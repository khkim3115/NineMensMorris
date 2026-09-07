// 보드 클릭 의미와 하이라이트 계산. 순수 함수라 웹 React 보드와 트레이 팝업이 같은 것을 쓴다.
//
// 클릭 규칙은 한 곳(resolveClick)에만 있다 — 두 화면이 서로 다르게 동작할 여지를 없앤다.

import { POINT_COUNT } from './board';
import {
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
