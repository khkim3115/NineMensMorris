// 보드 클릭 의미와 하이라이트 계산. 순수 함수라 웹 React 보드와 트레이 팝업이 같은 것을 쓴다.
//
// 클릭 규칙은 한 곳(resolveClick)에만 있다 — 두 화면이 서로 다르게 동작할 여지를 없앤다.

import { POINT_COUNT } from './board';
import {
  canFly,
  isInMill,
  legalMoves,
  other,
  type GameState,
  type Move,
  type Player,
} from './gameState';

export interface BoardView {
  /** 지금 클릭하면 곧바로 한 수가 되는 지점. */
  playable: Set<number>;
  /** 이동 페이즈에서 출발점으로 고를 수 있는 내 말. */
  selectable: Set<number>;
  /** 밀에 속한 말(양쪽) — 떼어낼 수 없다는 표시. */
  inMill: Set<number>;
}

/**
 * me 가 지금 둘 차례라는 전제로 하이라이트를 계산한다.
 * 내 차례가 아니거나 me 가 null(관전)이면 playable·selectable 은 비어 있다.
 */
export function boardView(s: GameState, me: Player | null, selected: number | null): BoardView {
  const view: BoardView = { playable: new Set(), selectable: new Set(), inMill: new Set() };
  for (let i = 0; i < POINT_COUNT; i++) if (isInMill(s.board, i)) view.inMill.add(i);
  if (me === null || s.phase === 'over' || s.turn !== me) return view;

  for (const m of legalMoves(s)) {
    if (m.k === 'place') view.playable.add(m.to);
    else if (m.k === 'remove') view.playable.add(m.at);
    else {
      view.selectable.add(m.from);
      if (selected === m.from) view.playable.add(m.to);
    }
  }
  return view;
}

export type ClickResult =
  /** 실제 착수. */
  | { kind: 'move'; move: Move }
  /** 출발점 선택만 바뀜(null 이면 선택 해제). */
  | { kind: 'select'; point: number | null };

/**
 * 지점 클릭을 해석한다. 아무 의미 없는 클릭이면 null.
 * 이동 페이즈는 "내 말 고르기 → 목적지 찍기" 2단계이고, 고른 말을 다시 누르면 선택이 풀린다.
 */
export function resolveClick(
  s: GameState,
  me: Player,
  selected: number | null,
  point: number,
): ClickResult | null {
  if (s.phase === 'over' || s.turn !== me) return null;

  if (s.mustRemove) {
    const target = s.board[point] === other(me);
    if (!target) return null;
    const ok = legalMoves(s).some((m) => m.k === 'remove' && m.at === point);
    return ok ? { kind: 'move', move: { k: 'remove', at: point } } : null;
  }

  if (s.hand[me - 1] > 0) {
    return s.board[point] === 0 ? { kind: 'move', move: { k: 'place', to: point } } : null;
  }

  if (s.board[point] === me) {
    return { kind: 'select', point: selected === point ? null : point };
  }
  if (selected === null) return null;
  const ok = legalMoves(s).some((m) => m.k === 'move' && m.from === selected && m.to === point);
  return ok ? { kind: 'move', move: { k: 'move', from: selected, to: point } } : null;
}

/* ── 상태 문구(웹 배너와 트레이 팝업이 같은 말을 쓰도록 여기서 만든다) ────── */

export const SIDE_LABEL: Record<Player, string> = { 1: '흑', 2: '백' };

/* ── 선후공 선택 ─────────────────────────────────────────────────────── */
//
// 설정값(SeatPref)과 이번 판의 좌석(Player)은 다른 것이다 — 섞으면 'random' 이
// 좌석 자리로 새어들어 조용히 흑이 된다. 고르는 건 SeatPref, 판에 쓰는 건 Player.

/** 사용자가 고른 선후공. 흑이 언제나 선공이므로 색 = 선후공이다. */
export type SeatPref = '1' | '2' | 'random';

export const SEAT_PREFS: readonly SeatPref[] = ['1', '2', 'random'];

export const SEAT_PREF_LABEL: Record<SeatPref, string> = {
  '1': '흑',
  '2': '백',
  random: '랜덤',
};

export const SEAT_PREF_DESC: Record<SeatPref, string> = {
  '1': '내가 먼저',
  '2': 'AI 가 먼저',
  random: '판마다 무작위',
};

/** 저장값 → SeatPref. 예전에 쓰던 '1'/'2' 도 그대로 유효하고, 모르는 값은 흑. */
export function toSeatPref(v: string | null | undefined): SeatPref {
  return v === '2' || v === 'random' ? v : '1';
}

/**
 * 선택을 이번 판의 좌석으로 확정한다. 'random' 은 새 판을 시작할 때 딱 한 번만 뽑는다 —
 * 되돌리기·힌트·기권이 모두 좌석을 기준으로 돌기 때문에 판 도중 다시 뽑으면 국면이 깨진다.
 *
 * 시드 PRNG(rng.ts) 가 아니라 Math.random 을 쓴다: 재현 가능한 난수는 zobrist·AI 잡음의
 * 요구사항이고, 색 추첨은 반대로 예측할 수 없어야 한다. 테스트는 rand 를 주입한다.
 */
export function resolveSeat(pref: SeatPref, rand: number = Math.random()): Player {
  if (pref === '1') return 1;
  if (pref === '2') return 2;
  return rand < 0.5 ? 1 : 2;
}

/** 지금 둘 사람이 해야 할 일. me 가 null 이면 관전 시점의 서술. */
export function turnHint(s: GameState, me: Player | null): string {
  if (s.phase === 'over') return '게임이 끝났습니다.';
  const mine = me !== null && s.turn === me;
  const who = mine ? '' : `${SIDE_LABEL[s.turn]} 차례 — `;
  if (s.mustRemove) {
    return mine ? '밀 완성! 상대 말을 하나 떼어내세요.' : `${who}상대 말을 떼는 중`;
  }
  if (s.hand[s.turn - 1] > 0) {
    return mine ? '빈 지점에 말을 놓으세요.' : `${who}말을 놓는 중`;
  }
  if (canFly(s, s.turn)) {
    return mine ? '말이 3개 — 아무 빈 지점으로 날아갈 수 있어요.' : `${who}날아서 이동 중`;
  }
  return mine ? '옮길 말을 고른 뒤 이어진 빈 지점을 누르세요.' : `${who}말을 옮기는 중`;
}

/** 페이즈 이름(배치/이동/플라잉). */
export function phaseLabel(s: GameState): string {
  if (s.phase === 'over') return '종료';
  if (s.hand[0] > 0 || s.hand[1] > 0) return '배치';
  if (canFly(s, 1) || canFly(s, 2)) return '플라잉';
  return '이동';
}
