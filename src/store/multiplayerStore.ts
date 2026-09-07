// 서버 권위 멀티플레이 상태(읽기 전용 모델 + RPC 래퍼 + Realtime 구독).
//
// 클라이언트는 테이블에 직접 쓰지 않는다 — 합법성 판정은 전부 nmm_* RPC 가 한다.
// 화면은 서버 스냅샷을 core 의 GameState 로 되살려 솔로와 **같은** Board/클릭 규칙으로 그린다.

import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureAnonSession } from '../lib/supabase';
import { appendCapped, sanitizeChatText, type ChatMessage } from '../lib/chat';
import { stateFromSnapshot, type GameState, type Player } from '../core/gameState';
import { resolveClick } from '../core/view';

export type MpStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface MpRoom {
  id: string;
  code: string;
  status: MpStatus;
  hostId: string;
  /** 흑(선공)을 맡은 좌석. 시작 전에는 null. */
  blackSeat: number | null;
  /** 지금 둘 색(1=흑, 2=백). 시작 전에는 null. */
  turn: Player | null;
  board: number[];
  hand: [number, number];
  onBoard: [number, number];
  mustRemove: boolean;
  moveCount: number;
  winnerSeat: number | null;
  winReason: 'pieces' | 'blocked' | 'resign' | 'timeout' | null;
  isDraw: boolean;
  drawReason: 'repetition' | 'stale' | null;
  turnStartedAt: string | null;
}

export interface MpPlayer {
  id: string;
  userId: string;
  seat: number;
  displayName: string;
  isHost: boolean;
  connected: boolean;
}

/** 좌석 → 색. 흑은 blackSeat 좌석이 잡는다. */
export function colorOfSeat(seat: number, blackSeat: number | null): Player {
  return blackSeat !== null && seat === blackSeat ? 1 : 2;
}

/** 서버 스냅샷을 그릴 수 있는 GameState 로. 끝난 방이면 결과까지 채운다. */
export function mpGameState(room: MpRoom | null): GameState | null {
  if (!room || room.turn === null) return null;
  const s = stateFromSnapshot({
    board: room.board,
    turn: room.turn,
    hand: room.hand,
    onBoard: room.onBoard,
    mustRemove: room.mustRemove,
  });
  if (room.status === 'finished') {
    s.phase = 'over';
    if (room.isDraw) {
      s.result = { kind: 'draw', reason: room.drawReason ?? 'stale' };
    } else if (room.winnerSeat !== null && room.winReason) {
      s.result = {
        kind: 'win',
        winner: colorOfSeat(room.winnerSeat, room.blackSeat),
        reason: room.winReason,
      };
    }
  }
  return s;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRoom(r: any): MpRoom {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    hostId: r.host_id,
    blackSeat: r.black_seat,
    turn: r.turn,
    board: (r.board ?? []) as number[],
    hand: [r.hand?.[0] ?? 9, r.hand?.[1] ?? 9],
    onBoard: [r.on_board?.[0] ?? 0, r.on_board?.[1] ?? 0],
    mustRemove: !!r.must_remove,
    moveCount: r.move_count ?? 0,
    winnerSeat: r.winner_seat,
    winReason: r.win_reason,
    isDraw: !!r.is_draw,
    drawReason: r.draw_reason,
    turnStartedAt: r.turn_started_at,
  };
}

function mapPlayer(p: any): MpPlayer {
  return {
    id: p.id,
    userId: p.user_id,
    seat: p.seat,
    displayName: p.display_name,
    isHost: !!p.is_host,
    connected: !!p.connected,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ERROR_KO: [string, string][] = [
  ['Anonymous sign-ins are disabled', '익명 로그인이 비활성화되어 있습니다. Supabase 대시보드에서 켜주세요.'],
  ['room not found', '방을 찾을 수 없습니다. 코드를 확인하세요.'],
  ['game already started', '이미 시작된 게임입니다.'],
  ['room is full', '방이 가득 찼습니다.'],
  ['need 2 players', '2명이 모여야 시작할 수 있습니다.'],
  ['only host can start', '방장만 시작할 수 있습니다.'],
  ['not your turn', '당신의 차례가 아닙니다.'],
  ['your turn', '지금은 당신의 차례입니다.'],
  ['display name required', '닉네임을 입력하세요.'],
  ['must remove first', '먼저 상대 말을 하나 떼어내세요.'],
  ['nothing to remove', '지금은 말을 뗄 수 없습니다.'],
  ['protected piece', '밀에 속한 말은 뗄 수 없습니다.'],
  ['illegal move', '둘 수 없는 수입니다.'],
  ['not a member', '이 방의 참가자가 아닙니다.'],
  ['not playing', '진행 중인 게임이 아닙니다.'],
];

function humanError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  for (const [needle, ko] of ERROR_KO) if (msg.includes(needle)) return ko;
  return msg;
}

const NAME_KEY = 'nmm_mp_name';
const CODE_KEY = 'nmm_mp_code';

interface MpState {
  room: MpRoom | null;
  players: MpPlayer[];
  myUserId: string | null;
  /** 이동 페이즈에서 고른 출발점(로컬 UI 전용). */
  selected: number | null;
  busy: boolean;
  error: string | null;
  channel: RealtimeChannel | null;
  messages: ChatMessage[];

  createRoom: (name: string) => Promise<boolean>;
  joinRoom: (code: string, name: string) => Promise<boolean>;
  startGame: () => Promise<void>;
  /** 보드 클릭 → 솔로와 같은 규칙(resolveClick)으로 해석해 알맞은 RPC 를 부른다. */
  playPoint: (point: number) => Promise<void>;
  resign: () => Promise<void>;
  claimTimeout: () => Promise<void>;
  leave: () => Promise<void>;
  sendChat: (text: string) => void;
  clearError: () => void;
  subscribeRoom: (roomId: string) => void;
  refetch: (roomId: string) => Promise<void>;
}

export const useMultiplayerStore = create<MpState>((set, get) => ({
  room: null,
  players: [],
  myUserId: null,
  selected: null,
  busy: false,
  error: null,
  channel: null,
  messages: [],

  createRoom: async (name) => {
    set({ busy: true, error: null });
    try {
      const uid = await ensureAnonSession();
      set({ myUserId: uid });
      const { data, error } = await supabase.rpc('nmm_create_room', { p_display_name: name });
      if (error) throw error;
      const roomId = (data as { room_id: string }).room_id;
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(CODE_KEY, (data as { code: string }).code);
      get().subscribeRoom(roomId);
      await get().refetch(roomId);
      set({ busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: humanError(e) });
      return false;
    }
  },

  joinRoom: async (code, name) => {
    set({ busy: true, error: null });
    try {
      const uid = await ensureAnonSession();
      set({ myUserId: uid });
      const { data, error } = await supabase.rpc('nmm_join_room', {
        p_code: code.trim().toUpperCase(),
        p_display_name: name,
      });
      if (error) throw error;
      const roomId = (data as { room_id: string }).room_id;
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(CODE_KEY, (data as { code: string }).code);
      get().subscribeRoom(roomId);
      await get().refetch(roomId);
      set({ busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: humanError(e) });
      return false;
    }
  },

  startGame: async () => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('nmm_start_game', { p_room: room.id });
    if (error) set({ error: humanError(error) });
  },

  playPoint: async (point) => {
    const { room, players, myUserId, selected } = get();
    if (!room || room.status !== 'playing') return;
    const me = players.find((p) => p.userId === myUserId);
    if (!me) return;
    const state = mpGameState(room);
    if (!state) return;
    const myColor = colorOfSeat(me.seat, room.blackSeat);

    const r = resolveClick(state, myColor, selected, point);
    if (!r) return;
    if (r.kind === 'select') {
      set({ selected: r.point });
      return;
    }

    const m = r.move;
    set({ selected: null, error: null });
    const { error } =
      m.k === 'place'
        ? await supabase.rpc('nmm_place', { p_room: room.id, p_to: m.to })
        : m.k === 'move'
          ? await supabase.rpc('nmm_move', { p_room: room.id, p_from: m.from, p_to: m.to })
          : await supabase.rpc('nmm_remove', { p_room: room.id, p_at: m.at });
    if (error) {
      set({ error: humanError(error) });
      // 서버가 거절했으면 우리 모델이 낡았을 수 있다 — 최신 상태를 다시 받는다.
      await get().refetch(room.id);
    }
  },

  resign: async () => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('nmm_resign', { p_room: room.id });
    if (error) set({ error: humanError(error) });
  },

  claimTimeout: async () => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('nmm_claim_timeout', { p_room: room.id, p_seconds: 120 });
    if (error) set({ error: humanError(error) });
  },

  leave: async () => {
    const { room, channel } = get();
    if (room) await supabase.rpc('nmm_leave_room', { p_room: room.id }).then(undefined, () => {});
    if (channel) void supabase.removeChannel(channel);
    localStorage.removeItem(CODE_KEY);
    set({ room: null, players: [], channel: null, error: null, selected: null, messages: [] });
  },

  // 채팅은 테이블 없이 Realtime broadcast 만 쓴다(self:true 라 내 메시지도 같은 경로로 표시).
  sendChat: (text) => {
    const clean = sanitizeChatText(text);
    if (!clean) return;
    const { channel, myUserId, players } = get();
    if (!channel || !myUserId) return;
    const me = players.find((p) => p.userId === myUserId);
    const displayName = me?.displayName || localStorage.getItem(NAME_KEY) || '익명';
    const payload: ChatMessage = { userId: myUserId, displayName, text: clean, ts: Date.now() };
    void channel.send({ type: 'broadcast', event: 'chat', payload });
  },

  clearError: () => set({ error: null }),

  subscribeRoom: (roomId) => {
    const prev = get().channel;
    if (prev) void supabase.removeChannel(prev);
    set({ messages: [] });
    const ch = supabase
      .channel(`nmm:${roomId}`, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        set((s) => ({ messages: appendCapped(s.messages, payload as ChatMessage) }));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nmm_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            set({ room: null, players: [] });
            return;
          }
          set({ room: mapRoom(payload.new), selected: null });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nmm_room_players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const players = get().players.slice();
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string }).id;
            set({ players: players.filter((p) => p.id !== oldId) });
            return;
          }
          const np = mapPlayer(payload.new);
          const idx = players.findIndex((p) => p.id === np.id);
          if (idx >= 0) players[idx] = np;
          else players.push(np);
          players.sort((a, b) => a.seat - b.seat);
          set({ players });
        },
      )
      .subscribe();
    set({ channel: ch });
  },

  refetch: async (roomId) => {
    const { data: roomData } = await supabase
      .from('nmm_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();
    const { data: playersData } = await supabase
      .from('nmm_room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('seat');
    if (roomData) set({ room: mapRoom(roomData) });
    if (playersData) set({ players: (playersData as unknown[]).map(mapPlayer) });
  },
}));

/** 파생: 내 좌석 / 내 색 / 상대. */
export function selectMe(s: MpState): MpPlayer | null {
  return s.players.find((p) => p.userId === s.myUserId) ?? null;
}

export function selectOpponent(s: MpState): MpPlayer | null {
  const me = selectMe(s);
  return s.players.find((p) => p.id !== me?.id) ?? null;
}

/** 마지막으로 쓴 닉네임(입력창 기본값). */
export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
