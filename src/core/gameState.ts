// 나인 멘스 모리스 규칙 엔진(순수). UI·네트워크·AI 가 모두 이 한 벌만 쓴다.
//
// 표현 원칙:
//  · 밀을 만든 뒤의 "상대 말 제거"는 별도의 ply(mustRemove) 다 — 차례는 유지된다.
//    UI 2클릭 흐름 · 서버 RPC · 탐색이 같은 표현을 공유하게 하려는 의도적 선택.
//  · 규칙 코드는 applyMoveInPlace 한 곳에만 있다. 불변 버전(applyMove)은 clone 후 이를 호출하고,
//    엔진은 make/unmake 로 같은 함수를 쓴다 → 규칙이 두 벌로 갈라질 여지가 없다.

import { ADJACENCY, MILLS, MILLS_BY_POINT, POINT_COUNT, isAdjacent } from './board';
import { DEFAULT_RULES, type RuleConfig } from './rules';
import { ZOB } from './zobrist';

export type Player = 1 | 2;
export type Phase = 'placing' | 'moving' | 'over';

export type Move =
  | { k: 'place'; to: number }
  | { k: 'move'; from: number; to: number }
  | { k: 'remove'; at: number };

export type GameResult =
  | { kind: 'win'; winner: Player; reason: 'pieces' | 'blocked' | 'resign' }
  | { kind: 'draw'; reason: 'repetition' | 'stale' };

export interface GameState {
  /** 24칸: 0 빈칸 / 1 흑(1P) / 2 백(2P). */
  board: Int8Array;
  turn: Player;
  /** 아직 배치하지 않은 말 [1P, 2P]. */
  hand: [number, number];
  /** 보드 위 말 [1P, 2P]. */
  onBoard: [number, number];
  /** true 면 turn 플레이어가 상대 말 1개를 제거해야 한다(다른 수 불가). */
  mustRemove: boolean;
  phase: Phase;
  result: GameResult | null;
  hash: number;
  /** 각 ply 이후의 hash(되돌리기 시 pop). */
  history: number[];
  /** hash → 등장 횟수(반복 무승부). */
  reps: Map<number, number>;
  /** 말 제거 없이 지난 ply 수. */
  sinceCapture: number;
  ply: number;
  rules: RuleConfig;
}

export interface Undo {
  move: Move;
  prevTurn: Player;
  prevMustRemove: boolean;
  prevPhase: Phase;
  prevResult: GameResult | null;
  prevHash: number;
  prevSinceCapture: number;
}

export const other = (p: Player): Player => (p === 1 ? 2 : 1);

/* ── 밀 판정 ─────────────────────────────────────────────────────────── */

/** point 에 놓인 player 의 말이 밀을 이루는가. */
export function formsMill(board: Int8Array, point: number, player: Player): boolean {
  for (const mi of MILLS_BY_POINT[point]) {
    const [a, b, c] = MILLS[mi];
    if (board[a] === player && board[b] === player && board[c] === player) return true;
  }
  return false;
}

/** point 의 말(있다면)이 지금 밀에 속해 있는가. */
export function isInMill(board: Int8Array, point: number): boolean {
  const p = board[point];
  return p !== 0 && formsMill(board, point, p as Player);
}

/**
 * 제거 가능한 상대 말. 표준 룰: 밀에 속한 말은 제거할 수 없고,
 * 상대 말이 전부 밀에 속해 있을 때만 예외적으로 아무거나 제거한다.
 */
export function legalRemovals(board: Int8Array, victim: Player): number[] {
  const free: number[] = [];
  const all: number[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== victim) continue;
    all.push(i);
    if (!formsMill(board, i, victim)) free.push(i);
  }
  return free.length > 0 ? free : all;
}

/* ── 합법 수 ─────────────────────────────────────────────────────────── */

/** 이 플레이어가 지금 플라잉(임의 이동) 가능한가. */
export function canFly(s: GameState, p: Player): boolean {
  return s.hand[p - 1] === 0 && s.onBoard[p - 1] <= s.rules.flyingThreshold;
}

export function legalMoves(s: GameState): Move[] {
  if (s.phase === 'over') return [];
  const me = s.turn;
  const out: Move[] = [];

  if (s.mustRemove) {
    for (const at of legalRemovals(s.board, other(me))) out.push({ k: 'remove', at });
    return out;
  }

  if (s.hand[me - 1] > 0) {
    for (let i = 0; i < POINT_COUNT; i++) if (s.board[i] === 0) out.push({ k: 'place', to: i });
    return out;
  }

  const fly = canFly(s, me);
  for (let from = 0; from < POINT_COUNT; from++) {
    if (s.board[from] !== me) continue;
    if (fly) {
      for (let to = 0; to < POINT_COUNT; to++) {
        if (s.board[to] === 0) out.push({ k: 'move', from, to });
      }
    } else {
      for (const to of ADJACENCY[from]) if (s.board[to] === 0) out.push({ k: 'move', from, to });
    }
  }
  return out;
}

/** 합법 수가 하나라도 있는지만 확인(legalMoves 전체 생성 없이). */
export function hasLegalMove(s: GameState): boolean {
  if (s.phase === 'over') return false;
  const me = s.turn;
  if (s.mustRemove) return s.onBoard[other(me) - 1] > 0;
  if (s.hand[me - 1] > 0) {
    for (let i = 0; i < POINT_COUNT; i++) if (s.board[i] === 0) return true;
    return false;
  }
  const fly = canFly(s, me);
  for (let from = 0; from < POINT_COUNT; from++) {
    if (s.board[from] !== me) continue;
    if (fly) {
      for (let to = 0; to < POINT_COUNT; to++) if (s.board[to] === 0) return true;
    } else {
      for (const to of ADJACENCY[from]) if (s.board[to] === 0) return true;
    }
  }
  return false;
}

export function sameMove(a: Move, b: Move): boolean {
  if (a.k !== b.k) return false;
  if (a.k === 'place') return a.to === (b as { to: number }).to;
  if (a.k === 'remove') return a.at === (b as { at: number }).at;
  const bb = b as { from: number; to: number };
  return a.from === bb.from && a.to === bb.to;
}

export function isLegal(s: GameState, m: Move): boolean {
  return legalMoves(s).some((x) => sameMove(x, m));
}

export function moveKey(m: Move): string {
  if (m.k === 'place') return 'p' + m.to;
  if (m.k === 'remove') return 'x' + m.at;
  return 'm' + m.from + '-' + m.to;
}

/* ── 상태 생성 · 복제 ────────────────────────────────────────────────── */

export function computeHash(s: GameState): number {
  let h = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    const v = s.board[i];
    if (v !== 0) h ^= ZOB.piece[v - 1][i];
  }
  h ^= ZOB.hand[0][s.hand[0]] ^ ZOB.hand[1][s.hand[1]];
  if (s.turn === 2) h ^= ZOB.turn;
  if (s.mustRemove) h ^= ZOB.mustRemove;
  return h | 0;
}

export function createInitialState(rules: RuleConfig = DEFAULT_RULES): GameState {
  const s: GameState = {
    board: new Int8Array(POINT_COUNT),
    turn: 1,
    hand: [rules.piecesPerPlayer, rules.piecesPerPlayer],
    onBoard: [0, 0],
    mustRemove: false,
    phase: 'placing',
    result: null,
    hash: 0,
    history: [],
    reps: new Map(),
    sinceCapture: 0,
    ply: 0,
    rules,
  };
  s.hash = computeHash(s);
  s.history.push(s.hash);
  s.reps.set(s.hash, 1);
  return s;
}

export function cloneState(s: GameState): GameState {
  return {
    board: new Int8Array(s.board),
    turn: s.turn,
    hand: [s.hand[0], s.hand[1]],
    onBoard: [s.onBoard[0], s.onBoard[1]],
    mustRemove: s.mustRemove,
    phase: s.phase,
    result: s.result,
    hash: s.hash,
    history: s.history.slice(),
    reps: new Map(s.reps),
    sinceCapture: s.sinceCapture,
    ply: s.ply,
    rules: s.rules,
  };
}

/* ── 착수 적용 ───────────────────────────────────────────────────────── */

/** 제자리 적용(엔진 핫패스). 되돌리려면 반환한 Undo 를 undoMove 에 넘긴다. */
export function applyMoveInPlace(s: GameState, m: Move): Undo {
  const undo: Undo = {
    move: m,
    prevTurn: s.turn,
    prevMustRemove: s.mustRemove,
    prevPhase: s.phase,
    prevResult: s.result,
    prevHash: s.hash,
    prevSinceCapture: s.sinceCapture,
  };

  const me = s.turn;
  const opp = other(me);
  let formed = false;

  if (m.k === 'place') {
    s.board[m.to] = me;
    s.hash ^= ZOB.piece[me - 1][m.to];
    s.hash ^= ZOB.hand[me - 1][s.hand[me - 1]];
    s.hand[me - 1] -= 1;
    s.hash ^= ZOB.hand[me - 1][s.hand[me - 1]];
    s.onBoard[me - 1] += 1;
    formed = formsMill(s.board, m.to, me);
    s.sinceCapture += 1;
  } else if (m.k === 'move') {
    s.board[m.from] = 0;
    s.board[m.to] = me;
    s.hash ^= ZOB.piece[me - 1][m.from] ^ ZOB.piece[me - 1][m.to];
    formed = formsMill(s.board, m.to, me);
    s.sinceCapture += 1;
  } else {
    s.board[m.at] = 0;
    s.hash ^= ZOB.piece[opp - 1][m.at];
    s.onBoard[opp - 1] -= 1;
    s.sinceCapture = 0;
  }

  // 차례 전이: 밀을 만들었고 뺏을 말이 남아 있으면 같은 플레이어가 제거 ply 를 이어 둔다.
  const nextMustRemove = m.k !== 'remove' && formed && s.onBoard[opp - 1] > 0;
  if (nextMustRemove !== s.mustRemove) s.hash ^= ZOB.mustRemove;
  s.mustRemove = nextMustRemove;
  if (!nextMustRemove) {
    s.turn = opp;
    s.hash ^= ZOB.turn;
  }

  s.phase = s.hand[0] > 0 || s.hand[1] > 0 ? 'placing' : 'moving';
  s.ply += 1;
  s.hash |= 0;
  s.history.push(s.hash);
  s.reps.set(s.hash, (s.reps.get(s.hash) ?? 0) + 1);
  s.result = detectResult(s);
  if (s.result) s.phase = 'over';
  return undo;
}

export function undoMove(s: GameState, u: Undo): void {
  const h = s.history.pop();
  if (h !== undefined) {
    const c = s.reps.get(h) ?? 0;
    if (c <= 1) s.reps.delete(h);
    else s.reps.set(h, c - 1);
  }
  s.ply -= 1;

  const m = u.move;
  const me = u.prevTurn;
  const opp = other(me);
  if (m.k === 'place') {
    s.board[m.to] = 0;
    s.hand[me - 1] += 1;
    s.onBoard[me - 1] -= 1;
  } else if (m.k === 'move') {
    s.board[m.to] = 0;
    s.board[m.from] = me;
  } else {
    s.board[m.at] = opp;
    s.onBoard[opp - 1] += 1;
  }

  s.turn = u.prevTurn;
  s.mustRemove = u.prevMustRemove;
  s.phase = u.prevPhase;
  s.result = u.prevResult;
  s.hash = u.prevHash;
  s.sinceCapture = u.prevSinceCapture;
}

/** 불변 적용(UI·테스트용). 규칙 코드는 applyMoveInPlace 한 곳뿐이다. */
export function applyMove(s: GameState, m: Move): GameState {
  const next = cloneState(s);
  applyMoveInPlace(next, m);
  return next;
}

/** 기권 — 규칙 밖의 종료(솔로 포기·멀티 나가기). */
export function applyResign(s: GameState, quitter: Player): GameState {
  const next = cloneState(s);
  next.result = { kind: 'win', winner: other(quitter), reason: 'resign' };
  next.phase = 'over';
  return next;
}

/* ── 종료 판정 ───────────────────────────────────────────────────────── */

function detectResult(s: GameState): GameResult | null {
  if (!s.mustRemove) {
    const p = s.turn;
    // 배치가 남아 있는 동안에는 말 부족·봉쇄로 지지 않는다.
    if (s.hand[p - 1] === 0) {
      if (s.onBoard[p - 1] < s.rules.minPieces) {
        return { kind: 'win', winner: other(p), reason: 'pieces' };
      }
      if (!hasLegalMove(s)) {
        return { kind: 'win', winner: other(p), reason: 'blocked' };
      }
    }
  }
  if ((s.reps.get(s.hash) ?? 0) >= s.rules.repetitionLimit) {
    return { kind: 'draw', reason: 'repetition' };
  }
  if (s.phase === 'moving' && s.sinceCapture >= s.rules.staleMoveLimit) {
    return { kind: 'draw', reason: 'stale' };
  }
  return null;
}

/* ── 스냅샷(서버 동기화용) ───────────────────────────────────────────── */

export interface Snapshot {
  board: number[];
  turn: Player;
  hand: [number, number];
  onBoard: [number, number];
  mustRemove: boolean;
}

export function toSnapshot(s: GameState): Snapshot {
  return {
    board: Array.from(s.board),
    turn: s.turn,
    hand: [s.hand[0], s.hand[1]],
    onBoard: [s.onBoard[0], s.onBoard[1]],
    mustRemove: s.mustRemove,
  };
}

/**
 * 서버가 보내준 국면을 그릴 수 있는 GameState 로 되살린다.
 * 반복 이력은 서버가 관리하므로 여기서는 비운다(무승부 판정은 서버 권위).
 */
export function stateFromSnapshot(snap: Snapshot, rules: RuleConfig = DEFAULT_RULES): GameState {
  const s: GameState = {
    board: Int8Array.from(snap.board),
    turn: snap.turn,
    hand: [snap.hand[0], snap.hand[1]],
    onBoard: [snap.onBoard[0], snap.onBoard[1]],
    mustRemove: snap.mustRemove,
    phase: snap.hand[0] > 0 || snap.hand[1] > 0 ? 'placing' : 'moving',
    result: null,
    hash: 0,
    history: [],
    reps: new Map(),
    sinceCapture: 0,
    ply: 0,
    rules,
  };
  s.hash = computeHash(s);
  s.history.push(s.hash);
  s.reps.set(s.hash, 1);
  return s;
}

/**
 * Worker 로 넘기기 위한 완전 직렬화형. 스냅샷과 달리 반복 이력까지 들고 가서
 * AI 가 "무승부로 몰리는 수"를 알아볼 수 있게 한다.
 */
export interface StateTransfer extends Snapshot {
  history: number[];
  sinceCapture: number;
}

export function toTransfer(s: GameState): StateTransfer {
  return { ...toSnapshot(s), history: s.history.slice(), sinceCapture: s.sinceCapture };
}

export function fromTransfer(t: StateTransfer, rules: RuleConfig = DEFAULT_RULES): GameState {
  const s = stateFromSnapshot(t, rules);
  s.sinceCapture = t.sinceCapture;
  const hist = t.history.length > 0 ? t.history.slice() : [s.hash];
  // 마지막 항목은 현재 국면이어야 한다. 어긋나면(직렬화 불일치) 현재 해시로 보정.
  if (hist[hist.length - 1] !== s.hash) hist.push(s.hash);
  s.history = hist;
  s.reps = new Map();
  for (const h of hist) s.reps.set(h, (s.reps.get(h) ?? 0) + 1);
  return s;
}

export { isAdjacent };
