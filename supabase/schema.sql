-- ============================================================================
-- 나인 멘스 모리스 멀티플레이 백엔드 (Supabase / Postgres)
--
-- 적용 대상: 요트다이스와 **공유하는** Supabase 프로젝트. 이 파일의 객체는 전부
-- `nmm_` 접두사를 쓰며 기존 요트다이스 스키마(rooms/room_players/leaderboard/feedback)를
-- 건드리지 않는다.
--
-- ⚠️ 이 파일에 `revoke ... on all functions in schema public` 같은 전역 회수를 절대 넣지 말 것.
--    요트다이스 RPC 권한이 통째로 날아간다. 신규 함수에 개별 grant 만 한다.
--
-- 설계: 서버 권위. 합법성 판정(인접·밀·제거 예외·승패·무승부)을 전부 서버가 하고,
--       클라이언트 직접 쓰기는 revoke + RLS 로 막는다. 규칙은 src/core 와 동일해야 한다.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── 스키마 ───────────────────────────────────────────────────────────────
-- 상태값은 enum 대신 text + CHECK — 기존 room_status enum 과 얽히지 않게.
create table if not exists public.nmm_rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  status          text not null default 'lobby'
                    check (status in ('lobby','playing','finished','abandoned')),
  host_id         uuid not null,

  -- 흑(선공, 색 1)을 맡은 좌석. 시작할 때 무작위로 정해 선공을 공평하게 나눈다.
  black_seat      smallint check (black_seat in (0,1)),
  -- 지금 둘 '색'(1=흑, 2=백). 좌석이 아니라 색이라 black_seat 와 조합해 차례를 판정한다.
  turn            smallint check (turn in (1,2)),

  -- 24 지점. 인덱스는 src/core/board.ts 순서와 동일하며, SQL 배열이 1-based 라 board[p+1] 로 읽는다.
  board           smallint[] not null default array_fill(0::smallint, array[24])
                    check (array_length(board,1) = 24),
  -- 아직 놓지 않은 말 [흑, 백].
  hand            smallint[] not null default array[9,9]::smallint[]
                    check (array_length(hand,1) = 2),
  -- 보드 위 말 [흑, 백].
  on_board        smallint[] not null default array[0,0]::smallint[]
                    check (array_length(on_board,1) = 2),
  -- true 면 turn 색이 상대 말 1개를 떼야 한다(다른 수 불가).
  must_remove     boolean not null default false,

  move_count      int not null default 0,
  -- 말을 못 뗀 채 지난 수(무승부 판정).
  since_capture   int not null default 0,
  -- 국면키 → 등장 횟수(3회 반복 무승부).
  pos_counts      jsonb not null default '{}'::jsonb,

  winner_seat     smallint check (winner_seat in (0,1)),
  win_reason      text check (win_reason in ('pieces','blocked','resign','timeout')),
  is_draw         boolean not null default false,
  draw_reason     text check (draw_reason in ('repetition','stale')),

  turn_started_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists nmm_rooms_code_idx on public.nmm_rooms (code);
create index if not exists nmm_rooms_status_idx on public.nmm_rooms (status, created_at);

create table if not exists public.nmm_room_players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.nmm_rooms(id) on delete cascade,
  user_id       uuid not null,
  seat          smallint not null check (seat in (0,1)),
  display_name  text not null check (char_length(display_name) between 1 and 24),
  is_host       boolean not null default false,
  connected     boolean not null default true,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);
create index if not exists nmm_room_players_room_idx on public.nmm_room_players (room_id, seat);

create or replace function public.nmm_touch_updated_at() returns trigger
language plpgsql set search_path = public, extensions as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists nmm_rooms_touch on public.nmm_rooms;
create trigger nmm_rooms_touch before update on public.nmm_rooms
  for each row execute function public.nmm_touch_updated_at();

-- ── 순수 규칙 (src/core/board.ts · gameState.ts 포팅) ─────────────────────
-- 지점 번호는 0..23. 아래 두 상수는 클라이언트의 ADJACENCY/MILLS 와 **반드시** 같아야 한다.

create or replace function public.nmm_adj(p int)
returns int[] language sql immutable set search_path = public as $$
  select case p
    when 0  then array[1,9]        when 1  then array[0,2,4]      when 2  then array[1,14]
    when 3  then array[4,10]       when 4  then array[1,3,5,7]    when 5  then array[4,13]
    when 6  then array[7,11]       when 7  then array[4,6,8]      when 8  then array[7,12]
    when 9  then array[0,10,21]    when 10 then array[3,9,11,18]  when 11 then array[6,10,15]
    when 12 then array[8,13,17]    when 13 then array[5,12,14,20] when 14 then array[2,13,23]
    when 15 then array[11,16]      when 16 then array[15,17,19]   when 17 then array[12,16]
    when 18 then array[10,19]      when 19 then array[16,18,20,22] when 20 then array[13,19]
    when 21 then array[9,22]       when 22 then array[19,21,23]   when 23 then array[14,22]
  end;
$$;

create or replace function public.nmm_mills()
returns int[] language sql immutable set search_path = public as $$
  select array[
    array[0,1,2],   array[3,4,5],    array[6,7,8],
    array[9,10,11], array[12,13,14],
    array[15,16,17],array[18,19,20], array[21,22,23],
    array[0,9,21],  array[3,10,18],  array[6,11,15],  array[1,4,7],
    array[16,19,22],array[8,12,17],  array[5,13,20],  array[2,14,23]
  ];
$$;

create or replace function public.nmm_is_adjacent(a int, b int)
returns boolean language sql immutable set search_path = public as $$
  select b = any(public.nmm_adj(a));
$$;

/** p 에 놓인 who 의 말이 밀을 이루는가. */
create or replace function public.nmm_is_mill(p_board smallint[], p int, who smallint)
returns boolean language plpgsql immutable set search_path = public as $$
declare m int[] := public.nmm_mills(); i int;
begin
  for i in 1..16 loop
    if p = m[i][1] or p = m[i][2] or p = m[i][3] then
      if p_board[m[i][1] + 1] = who and p_board[m[i][2] + 1] = who and p_board[m[i][3] + 1] = who then
        return true;
      end if;
    end if;
  end loop;
  return false;
end $$;

/** 표준 룰: 밀에 속한 말은 못 뗀다. 단 상대 말이 전부 밀이면 아무거나 뗄 수 있다. */
create or replace function public.nmm_legal_removals(p_board smallint[], victim smallint)
returns int[] language plpgsql immutable set search_path = public as $$
declare freeones int[] := '{}'; allones int[] := '{}'; p int;
begin
  for p in 0..23 loop
    if p_board[p + 1] = victim then
      allones := allones || p;
      if not public.nmm_is_mill(p_board, p, victim) then freeones := freeones || p; end if;
    end if;
  end loop;
  return case when coalesce(array_length(freeones,1),0) > 0 then freeones else allones end;
end $$;

/** who 가 지금 움직일 수 있는가(배치가 끝난 뒤에만 의미가 있다). */
create or replace function public.nmm_has_move(p_board smallint[], who smallint, can_fly boolean)
returns boolean language plpgsql immutable set search_path = public as $$
declare p int; n int;
begin
  if can_fly then
    -- 플라잉이면 빈 칸이 하나라도 있으면 움직일 수 있다.
    for p in 0..23 loop
      if p_board[p + 1] = 0 then return true; end if;
    end loop;
    return false;
  end if;
  for p in 0..23 loop
    if p_board[p + 1] = who then
      foreach n in array public.nmm_adj(p) loop
        if p_board[n + 1] = 0 then return true; end if;
      end loop;
    end if;
  end loop;
  return false;
end $$;

/** 반복 무승부 판정을 위한 국면 키(해시가 아니라 정확한 문자열이라 충돌이 없다). */
create or replace function public.nmm_pos_key(
  p_board smallint[], p_turn smallint, p_must_remove boolean, p_hand smallint[])
returns text language sql immutable set search_path = public as $$
  select array_to_string(p_board, '') || '|' || p_turn || '|'
      || case when p_must_remove then '1' else '0' end || '|'
      || p_hand[1] || ',' || p_hand[2];
$$;

create or replace function public.nmm_roll_seat()
returns smallint language sql volatile set search_path = public, extensions as $$
  select (get_byte(gen_random_bytes(1), 0) % 2)::smallint;
$$;

create or replace function public.nmm_generate_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; gen_code text; i int; attempts int := 0;
begin
  loop
    gen_code := '';
    for i in 1..6 loop
      gen_code := gen_code || substr(alphabet, (get_byte(gen_random_bytes(1),0) % length(alphabet)) + 1, 1);
    end loop;
    if not exists (
      select 1 from public.nmm_rooms where code = gen_code and status in ('lobby','playing')
    ) then
      return gen_code;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then raise exception 'could not allocate room code'; end if;
  end loop;
end $$;

-- ── 차례 전이 + 종료 판정 (src/core/gameState.applyMoveInPlace 와 같은 순서) ──
-- 말/손패 변경은 각 RPC 가 먼저 써 놓고, 이 함수가 차례·반복·승패만 마무리한다.
create or replace function public.nmm__advance(p_room uuid, p_formed boolean, p_was_remove boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.nmm_rooms;
  opp smallint; nxt_must boolean; nxt_turn smallint; key text; cnt int;
  mover smallint; loser_seat smallint; can_fly boolean;
begin
  select * into r from public.nmm_rooms where id = p_room;
  opp := 3 - r.turn;

  -- 밀을 만들었고 뺏을 말이 남아 있으면 같은 색이 제거 ply 를 이어 둔다.
  nxt_must := (not p_was_remove) and p_formed and r.on_board[opp] > 0;
  nxt_turn := (case when nxt_must then r.turn else opp end)::smallint;

  key := public.nmm_pos_key(r.board, nxt_turn, nxt_must, r.hand);
  cnt := coalesce((r.pos_counts->>key)::int, 0) + 1;

  update public.nmm_rooms set
    must_remove = nxt_must,
    turn = nxt_turn,
    move_count = r.move_count + 1,
    pos_counts = jsonb_set(r.pos_counts, array[key], to_jsonb(cnt), true),
    turn_started_at = now()
  where id = p_room;

  select * into r from public.nmm_rooms where id = p_room;

  -- 1) 말 부족·봉쇄 패배(배치가 끝난 쪽에만 적용)
  if not r.must_remove then
    mover := r.turn;
    if r.hand[mover] = 0 then
      loser_seat := (case when mover = 1 then r.black_seat else 1 - r.black_seat end)::smallint;
      if r.on_board[mover] < 3 then
        perform public.nmm__end_win(p_room, (1 - loser_seat)::smallint, 'pieces');
        return;
      end if;
      can_fly := r.on_board[mover] <= 3;
      if not public.nmm_has_move(r.board, mover, can_fly) then
        perform public.nmm__end_win(p_room, (1 - loser_seat)::smallint, 'blocked');
        return;
      end if;
    end if;
  end if;

  -- 2) 무승부
  if cnt >= 3 then
    perform public.nmm__end_draw(p_room, 'repetition');
    return;
  end if;
  if r.hand[1] = 0 and r.hand[2] = 0 and r.since_capture >= 50 then
    perform public.nmm__end_draw(p_room, 'stale');
    return;
  end if;
end $$;

create or replace function public.nmm__end_win(p_room uuid, p_winner smallint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.nmm_rooms
    set status = 'finished', winner_seat = p_winner, win_reason = p_reason,
        is_draw = false, must_remove = false
  where id = p_room;
end $$;

create or replace function public.nmm__end_draw(p_room uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.nmm_rooms
    set status = 'finished', winner_seat = null, win_reason = null,
        is_draw = true, draw_reason = p_reason, must_remove = false
  where id = p_room;
end $$;

/** 내 좌석과 색을 확인하고 "지금 내 차례"가 아니면 예외. 반환값은 내 색(1=흑, 2=백). */
create or replace function public.nmm__require_turn(r public.nmm_rooms, uid uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare my_seat smallint; my_color smallint;
begin
  if r.status <> 'playing' then raise exception 'not playing'; end if;
  select seat into my_seat from public.nmm_room_players where room_id = r.id and user_id = uid;
  if my_seat is null then raise exception 'not a member'; end if;
  my_color := case when my_seat = r.black_seat then 1 else 2 end;
  if my_color <> r.turn then raise exception 'not your turn'; end if;
  return my_color;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────
create or replace function public.nmm_is_room_member(p_room uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.nmm_room_players where room_id = p_room and user_id = auth.uid()
  );
$$;

alter table public.nmm_rooms enable row level security;
alter table public.nmm_room_players enable row level security;

drop policy if exists nmm_rooms_select_member on public.nmm_rooms;
create policy nmm_rooms_select_member on public.nmm_rooms
  for select to authenticated using (public.nmm_is_room_member(id));

drop policy if exists nmm_players_select_member on public.nmm_room_players;
create policy nmm_players_select_member on public.nmm_room_players
  for select to authenticated using (public.nmm_is_room_member(room_id));

revoke insert, update, delete on public.nmm_rooms        from anon, authenticated;
revoke insert, update, delete on public.nmm_room_players from anon, authenticated;
grant  select on public.nmm_rooms, public.nmm_room_players to authenticated;

-- ── RPC (쓰기 표면 전부) ─────────────────────────────────────────────────

create or replace function public.nmm_create_room(p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid; new_code text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(coalesce(p_display_name,'')) = 0 then raise exception 'display name required'; end if;
  new_code := public.nmm_generate_code();
  insert into public.nmm_rooms(code, status, host_id)
    values (new_code, 'lobby', uid) returning id into new_id;
  insert into public.nmm_room_players(room_id, user_id, seat, display_name, is_host)
    values (new_id, uid, 0, left(p_display_name,24), true);
  return jsonb_build_object('room_id', new_id, 'code', new_code, 'seat', 0);
end $$;

create or replace function public.nmm_join_room(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; existing public.nmm_room_players; new_seat smallint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(coalesce(p_display_name,'')) = 0 then raise exception 'display name required'; end if;
  select * into r from public.nmm_rooms where code = upper(p_code) for update;
  if not found then raise exception 'room not found'; end if;

  select * into existing from public.nmm_room_players where room_id = r.id and user_id = uid;
  if found then
    -- 재접속: 좌석을 유지한 채 다시 붙는다.
    update public.nmm_room_players
      set display_name = left(p_display_name,24), last_seen_at = now(), connected = true
      where id = existing.id;
    return jsonb_build_object('room_id', r.id, 'code', r.code, 'seat', existing.seat);
  end if;

  if r.status <> 'lobby' then raise exception 'game already started'; end if;
  select min(s)::smallint into new_seat from generate_series(0,1) s
    where s not in (select seat from public.nmm_room_players where room_id = r.id);
  if new_seat is null then raise exception 'room is full'; end if;
  insert into public.nmm_room_players(room_id, user_id, seat, display_name, is_host)
    values (r.id, uid, new_seat, left(p_display_name,24), false);
  return jsonb_build_object('room_id', r.id, 'code', r.code, 'seat', new_seat);
end $$;

create or replace function public.nmm_start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; ncount int; first_black smallint;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.host_id <> uid then raise exception 'only host can start'; end if;
  if r.status <> 'lobby' then raise exception 'not in lobby'; end if;
  select count(*) into ncount from public.nmm_room_players where room_id = r.id;
  if ncount < 2 then raise exception 'need 2 players'; end if;

  -- 선공(흑)을 무작위로 — 방장이 늘 먼저 두지 않게.
  first_black := public.nmm_roll_seat();
  update public.nmm_rooms set
    status = 'playing',
    black_seat = first_black,
    turn = 1,
    board = array_fill(0::smallint, array[24]),
    hand = array[9,9]::smallint[],
    on_board = array[0,0]::smallint[],
    must_remove = false,
    move_count = 0,
    since_capture = 0,
    pos_counts = '{}'::jsonb,
    winner_seat = null, win_reason = null, is_draw = false, draw_reason = null,
    turn_started_at = now()
  where id = r.id;
end $$;

create or replace function public.nmm_place(p_room uuid, p_to int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; me smallint; nb smallint[]; formed boolean;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  me := public.nmm__require_turn(r, uid);
  if r.must_remove then raise exception 'must remove first'; end if;
  if p_to < 0 or p_to > 23 then raise exception 'illegal move'; end if;
  if r.hand[me] <= 0 then raise exception 'illegal move'; end if;
  if r.board[p_to + 1] <> 0 then raise exception 'illegal move'; end if;

  nb := r.board; nb[p_to + 1] := me;
  formed := public.nmm_is_mill(nb, p_to, me);
  update public.nmm_rooms set
    board = nb,
    hand = case when me = 1 then array[r.hand[1]-1, r.hand[2]] else array[r.hand[1], r.hand[2]-1] end::smallint[],
    on_board = case when me = 1 then array[r.on_board[1]+1, r.on_board[2]] else array[r.on_board[1], r.on_board[2]+1] end::smallint[],
    since_capture = r.since_capture + 1
  where id = r.id;
  perform public.nmm__advance(r.id, formed, false);
end $$;

create or replace function public.nmm_move(p_room uuid, p_from int, p_to int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; me smallint; nb smallint[]; formed boolean; can_fly boolean;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  me := public.nmm__require_turn(r, uid);
  if r.must_remove then raise exception 'must remove first'; end if;
  if p_from < 0 or p_from > 23 or p_to < 0 or p_to > 23 then raise exception 'illegal move'; end if;
  if r.hand[me] > 0 then raise exception 'illegal move'; end if;
  if r.board[p_from + 1] <> me then raise exception 'illegal move'; end if;
  if r.board[p_to + 1] <> 0 then raise exception 'illegal move'; end if;
  can_fly := r.on_board[me] <= 3;
  if not can_fly and not public.nmm_is_adjacent(p_from, p_to) then raise exception 'illegal move'; end if;

  nb := r.board; nb[p_from + 1] := 0; nb[p_to + 1] := me;
  formed := public.nmm_is_mill(nb, p_to, me);
  update public.nmm_rooms set board = nb, since_capture = r.since_capture + 1 where id = r.id;
  perform public.nmm__advance(r.id, formed, false);
end $$;

create or replace function public.nmm_remove(p_room uuid, p_at int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; me smallint; opp smallint; nb smallint[];
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  me := public.nmm__require_turn(r, uid);
  if not r.must_remove then raise exception 'nothing to remove'; end if;
  opp := 3 - me;
  if p_at < 0 or p_at > 23 then raise exception 'illegal move'; end if;
  if not (p_at = any(public.nmm_legal_removals(r.board, opp))) then
    raise exception 'protected piece';
  end if;

  nb := r.board; nb[p_at + 1] := 0;
  update public.nmm_rooms set
    board = nb,
    on_board = case when opp = 1 then array[r.on_board[1]-1, r.on_board[2]] else array[r.on_board[1], r.on_board[2]-1] end::smallint[],
    since_capture = 0
  where id = r.id;
  perform public.nmm__advance(r.id, false, true);
end $$;

create or replace function public.nmm_resign(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; my_seat smallint;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then return; end if;
  select seat into my_seat from public.nmm_room_players where room_id = r.id and user_id = uid;
  if my_seat is null then raise exception 'not a member'; end if;
  perform public.nmm__end_win(r.id, (1 - my_seat)::smallint, 'resign');
end $$;

/** 상대가 제한 시간 안에 두지 않으면 기다린 쪽이 이긴다(호출자가 상대일 때만). */
create or replace function public.nmm_claim_timeout(p_room uuid, p_seconds int default 120)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; my_seat smallint; cur_seat smallint;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then return; end if;
  if p_seconds < 60 then raise exception 'timeout too short'; end if;
  select seat into my_seat from public.nmm_room_players where room_id = r.id and user_id = uid;
  if my_seat is null then raise exception 'not a member'; end if;
  cur_seat := (case when r.turn = 1 then r.black_seat else 1 - r.black_seat end)::smallint;
  if cur_seat = my_seat then raise exception 'your turn'; end if;
  if r.turn_started_at is null or r.turn_started_at > now() - make_interval(secs => p_seconds) then
    return;
  end if;
  perform public.nmm__end_win(r.id, my_seat, 'timeout');
end $$;

create or replace function public.nmm_leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.nmm_rooms; me public.nmm_room_players; remaining int; new_host public.nmm_room_players;
begin
  select * into r from public.nmm_rooms where id = p_room for update;
  if not found then return; end if;
  select * into me from public.nmm_room_players where room_id = r.id and user_id = uid;
  if not found then return; end if;

  if r.status = 'lobby' then
    delete from public.nmm_room_players where id = me.id;
    select count(*) into remaining from public.nmm_room_players where room_id = r.id;
    if remaining = 0 then
      update public.nmm_rooms set status = 'abandoned' where id = r.id;
    elsif me.is_host then
      select * into new_host from public.nmm_room_players where room_id = r.id order by seat limit 1;
      update public.nmm_room_players set is_host = true where id = new_host.id;
      update public.nmm_rooms set host_id = new_host.user_id where id = r.id;
    end if;
  else
    -- 대국 중에는 좌석을 남겨 재접속할 수 있게 하고, 연결 상태만 내린다.
    update public.nmm_room_players set connected = false, last_seen_at = now() where id = me.id;
  end if;
end $$;

create or replace function public.nmm_cleanup_rooms()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.nmm_rooms where
       (status = 'lobby'     and updated_at < now() - interval '2 hours')
    or (status = 'finished'  and updated_at < now() - interval '24 hours')
    or (status = 'abandoned' and updated_at < now() - interval '1 hour')
    or (status = 'playing'   and updated_at < now() - interval '6 hours');
end $$;

-- ── 사용자 피드백 ────────────────────────────────────────────────────────
-- 요트다이스의 feedback 테이블을 공유하지 않고 별도 테이블을 쓴다(기존 스키마 무수정 원칙).
-- 읽기 정책이 없으므로 API 로는 아무도 못 읽는다 — 운영자는 Table Editor(서비스 롤)에서만 확인.
create table if not exists public.nmm_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  kind         text not null check (kind in ('bug','feature','other')),
  message      text not null check (char_length(message) between 1 and 2000),
  contact      text check (contact is null or char_length(contact) <= 200),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  screen       text check (screen is null or char_length(screen) <= 40),
  hint_used    boolean,
  user_agent   text check (user_agent is null or char_length(user_agent) <= 500),
  status       text not null default 'new' check (status in ('new','triaged','done','spam')),
  created_at   timestamptz not null default now()
);
create index if not exists nmm_feedback_triage_idx on public.nmm_feedback (status, created_at desc);

alter table public.nmm_feedback enable row level security;
revoke all on public.nmm_feedback from anon, authenticated;

create or replace function public.nmm_submit_feedback(
  p_kind text, p_message text, p_contact text default null,
  p_meta jsonb default '{}'::jsonb, p_hp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- 허니팟: 숨김 필드가 채워졌으면 봇 → 성공인 척 조용히 무시.
  if coalesce(p_hp, '') <> '' then return; end if;
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('bug','feature','other') then raise exception 'invalid kind'; end if;
  if char_length(coalesce(p_message,'')) < 1 or char_length(p_message) > 2000 then
    raise exception 'message length must be 1..2000';
  end if;
  if p_contact is not null and char_length(p_contact) > 200 then raise exception 'contact too long'; end if;
  if p_meta is not null and length(p_meta::text) > 4000 then raise exception 'meta too large'; end if;
  -- 세션당 10분 5건 + 전역 분당 30건(best-effort 스팸 방지).
  if (select count(*) from public.nmm_feedback
        where user_id = uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many submissions';
  end if;
  if (select count(*) from public.nmm_feedback
        where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many submissions';
  end if;
  insert into public.nmm_feedback(user_id, kind, message, contact, app_version, screen, hint_used, user_agent)
  values (
    uid, p_kind, left(p_message, 2000),
    nullif(btrim(coalesce(p_contact, '')), ''),
    nullif(left(coalesce(p_meta->>'app_version', ''), 40), ''),
    nullif(left(coalesce(p_meta->>'screen', ''), 40), ''),
    case when jsonb_typeof(p_meta->'hint_used') = 'boolean' then (p_meta->>'hint_used')::boolean else null end,
    nullif(left(coalesce(p_meta->>'user_agent', ''), 500), '')
  );
end $$;

-- ── 실행 권한 ────────────────────────────────────────────────────────────
-- ⚠️ 전역 revoke 금지(요트다이스 RPC 가 같은 스키마에 있다). 새 함수만 개별 처리한다.
revoke execute on function
  public.nmm__advance(uuid, boolean, boolean),
  public.nmm__end_win(uuid, smallint, text),
  public.nmm__end_draw(uuid, text),
  public.nmm__require_turn(public.nmm_rooms, uuid),
  public.nmm_cleanup_rooms()
from public, anon, authenticated;

-- 함수는 생성 시 PUBLIC 에 EXECUTE 가 기본 부여된다 — 게임 RPC 는 PUBLIC·anon 에서 회수하고
-- 로그인(익명 세션) 사용자에게만 남긴다. nmm_is_room_member 는 RLS select 정책과 realtime
-- 인가에서 호출되므로 authenticated 가 실행할 수 있어야 한다.
revoke execute on function
  public.nmm_create_room(text),
  public.nmm_join_room(text, text),
  public.nmm_start_game(uuid),
  public.nmm_place(uuid, int),
  public.nmm_move(uuid, int, int),
  public.nmm_remove(uuid, int),
  public.nmm_resign(uuid),
  public.nmm_claim_timeout(uuid, int),
  public.nmm_leave_room(uuid),
  public.nmm_is_room_member(uuid)
from public, anon;

grant execute on function
  public.nmm_create_room(text),
  public.nmm_join_room(text, text),
  public.nmm_start_game(uuid),
  public.nmm_place(uuid, int),
  public.nmm_move(uuid, int, int),
  public.nmm_remove(uuid, int),
  public.nmm_resign(uuid),
  public.nmm_claim_timeout(uuid, int),
  public.nmm_leave_room(uuid),
  public.nmm_is_room_member(uuid)
to authenticated;

-- 피드백 제출은 익명 세션(auth.uid() 필수)이 쓰므로 anon 롤 호출도 허용한다.
revoke execute on function public.nmm_submit_feedback(text, text, text, jsonb, text) from public;
grant execute on function public.nmm_submit_feedback(text, text, text, jsonb, text) to anon, authenticated;

-- ── Realtime (Postgres Changes) ──────────────────────────────────────────
alter table public.nmm_rooms replica identity full;
alter table public.nmm_room_players replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nmm_rooms'
  ) then
    alter publication supabase_realtime add table public.nmm_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nmm_room_players'
  ) then
    alter publication supabase_realtime add table public.nmm_room_players;
  end if;
end $$;
