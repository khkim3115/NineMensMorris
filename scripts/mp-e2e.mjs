// 멀티플레이 통합 점검 — 서버(nmm_* RPC)와 클라이언트(src/core)의 규칙이 완전히 같은지 확인한다.
//
// 독립 익명 세션 2개로 실제 한 판을 끝까지 두면서, 매 수마다 서버 보드/차례/손패를 로컬과 대조하고
// 마지막에 승패·무승부 판정까지 맞춰 본다. 서버 권위(시작 전 착수·비방장 시작·차례 아닌 착수 거부)도 확인.
//
//   npm run build:tray-engine      # 최신 규칙을 번들에 반영한 뒤
//   node scripts/mp-e2e.mjs        # .env.local 의 Supabase 값으로 실행
//
// ⚠️ 실제 프로젝트 DB 에 방을 만들었다 지운다. 개발/스테이징 환경에서만 돌릴 것.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

// .env.local 파싱
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

// 트레이 번들(IIFE)에서 규칙·AI 를 그대로 가져온다 — 웹과 같은 코드(빌드가 최신이어야 한다).
const bundle = fs.readFileSync(path.join(ROOT, 'desktop/vendor/nmm-engine.js'), 'utf8');
(0, eval)(bundle);
const NMM = globalThis.NMM;

const mk = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const A = mk();
const B = mk();

const fail = (msg) => {
  console.error('❌ ' + msg);
  process.exit(1);
};

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function room(client, id) {
  const { data, error } = await client.from('nmm_rooms').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('read room: ' + error.message);
  return data;
}

const boardStr = (arr) => arr.join('');

async function main() {
  const { data: a, error: ea } = await A.auth.signInAnonymously();
  if (ea) fail('익명 로그인 A 실패: ' + ea.message);
  const { data: b, error: eb } = await B.auth.signInAnonymously();
  if (eb) fail('익명 로그인 B 실패: ' + eb.message);
  console.log('익명 세션 2개 확보:', a.user.id.slice(0, 8), b.user.id.slice(0, 8));

  const created = await rpc(A, 'nmm_create_room', { p_display_name: '앨리스' });
  const roomId = created.room_id;
  console.log('방 생성:', created.code, '(seat', created.seat + ')');

  const joined = await rpc(B, 'nmm_join_room', { p_code: created.code, p_display_name: '밥' });
  console.log('참가:', 'seat', joined.seat);
  if (joined.seat !== 1) fail('두 번째 참가자는 seat 1 이어야 한다');

  // 시작 전에 두려고 하면 거부돼야 한다.
  const early = await A.rpc('nmm_place', { p_room: roomId, p_to: 0 });
  if (!early.error) fail('시작 전 착수가 거부되지 않았다');
  console.log('시작 전 착수 거부 ✓ —', early.error.message);

  // 방장이 아닌 쪽이 시작하면 거부돼야 한다.
  const notHost = await B.rpc('nmm_start_game', { p_room: roomId });
  if (!notHost.error) fail('방장이 아닌데 시작이 허용됐다');
  console.log('비방장 시작 거부 ✓ —', notHost.error.message);

  await rpc(A, 'nmm_start_game', { p_room: roomId });
  let r = await room(A, roomId);
  console.log('시작. 흑 좌석 =', r.black_seat);

  const clientOf = (seat) => (seat === 0 ? A : B);
  let local = NMM.createInitialState();
  let illegalChecked = false;

  for (let ply = 0; ply < 400; ply++) {
    r = await room(A, roomId);
    if (r.status !== 'playing') break;

    if (boardStr(r.board) !== boardStr(Array.from(local.board))) {
      fail(`보드 불일치 (ply ${ply})\n  서버: ${boardStr(r.board)}\n  로컬: ${boardStr(Array.from(local.board))}`);
    }
    if (r.turn !== local.turn) fail(`차례 불일치 (ply ${ply}): 서버 ${r.turn} / 로컬 ${local.turn}`);
    if (r.must_remove !== local.mustRemove) fail(`제거대기 불일치 (ply ${ply})`);
    if (r.hand[0] !== local.hand[0] || r.hand[1] !== local.hand[1]) fail(`손패 불일치 (ply ${ply})`);

    const curSeat = r.turn === 1 ? r.black_seat : 1 - r.black_seat;
    const cli = clientOf(curSeat);
    const other = clientOf(1 - curSeat);

    // 상대가 두려 하면 반드시 거부돼야 한다(서버 권위 확인 — 한 번만).
    if (!illegalChecked && !local.mustRemove && local.hand[local.turn - 1] > 0) {
      const empty = Array.from(local.board).findIndex((v) => v === 0);
      const wrong = await other.rpc('nmm_place', { p_room: roomId, p_to: empty });
      if (!wrong.error) fail('상대 차례가 아닌데 착수가 통과됐다');
      console.log('차례 아닌 착수 거부 ✓ —', wrong.error.message);
      illegalChecked = true;
    }

    const move = NMM.chooseMove(local, 'normal', { timeBudgetMs: 40 });
    if (!move) fail(`둘 수가 없다 (ply ${ply})`);

    if (move.k === 'place') await rpc(cli, 'nmm_place', { p_room: roomId, p_to: move.to });
    else if (move.k === 'move')
      await rpc(cli, 'nmm_move', { p_room: roomId, p_from: move.from, p_to: move.to });
    else await rpc(cli, 'nmm_remove', { p_room: roomId, p_at: move.at });

    local = NMM.applyMove(local, move);
  }

  r = await room(A, roomId);
  console.log('종료 상태:', r.status, '| 수:', r.move_count, '| 승자좌석:', r.winner_seat,
    '| 사유:', r.win_reason, '| 무승부:', r.is_draw, r.draw_reason ?? '');
  console.log('로컬 결과:', JSON.stringify(local.result));

  if (r.status !== 'finished') fail('서버가 게임을 끝내지 않았다');
  if (local.result === null) fail('로컬이 게임을 끝내지 않았다');

  // 승패/무승부 판정이 서버와 로컬에서 같은가.
  if (local.result.kind === 'draw') {
    if (!r.is_draw) fail('무승부 판정 불일치');
    if (r.draw_reason !== local.result.reason) fail('무승부 사유 불일치');
  } else {
    if (r.is_draw) fail('승패 판정 불일치');
    const serverWinnerColor = r.winner_seat === r.black_seat ? 1 : 2;
    if (serverWinnerColor !== local.result.winner) fail('승자 불일치');
    if (r.win_reason !== local.result.reason) fail('승리 사유 불일치');
  }
  console.log('✅ 서버와 클라이언트의 규칙·승패 판정이 완전히 일치한다.');

  await rpc(A, 'nmm_leave_room', { p_room: roomId });
  await rpc(B, 'nmm_leave_room', { p_room: roomId });
}

main().catch((e) => fail(e.message));
