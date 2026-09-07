// 보드 SVG. 표현만 담당하고 클릭 의미는 core/view.ts 가 정한다 — 솔로·멀티가 같은 컴포넌트를 쓴다.
//
// 좌표는 core/board.ts 의 POINT_XY(0..300) 를 그대로 쓰고, 말 반지름만큼 여백을 준다.

import { POINT_COUNT, POINT_LABEL, POINT_XY } from '../core/board';
import { boardView } from '../core/view';
import type { GameState, Move, Player } from '../core/gameState';

/** 세 겹 사각형 — [x, y, 한 변]. */
const RINGS: readonly (readonly [number, number, number])[] = [
  [0, 0, 300],
  [50, 50, 200],
  [100, 100, 100],
];

/** 링을 잇는 스포크 4개 — [x1, y1, x2, y2]. */
const SPOKES: readonly (readonly [number, number, number, number])[] = [
  [150, 0, 150, 100],
  [150, 200, 150, 300],
  [0, 150, 100, 150],
  [200, 150, 300, 150],
];

export interface BoardProps {
  state: GameState;
  /** 지금 조작하는 쪽. 관전(내 차례가 아예 없음)이면 null. */
  me: Player | null;
  selected: number | null;
  lastMove?: Move | null;
  /** 힌트로 제안된 수(있으면 목적지를 반짝인다). */
  hint?: Move | null;
  /** true 면 클릭을 받지 않는다(AI 계산 중 등). */
  disabled?: boolean;
  onPoint: (point: number) => void;
}

function movePoints(m: Move | null | undefined): { from: number | null; to: number | null } {
  if (!m) return { from: null, to: null };
  if (m.k === 'place') return { from: null, to: m.to };
  if (m.k === 'remove') return { from: null, to: m.at };
  return { from: m.from, to: m.to };
}

export function Board({ state, me, selected, lastMove, hint, disabled, onPoint }: BoardProps) {
  const view = boardView(state, disabled ? null : me, selected);
  const last = movePoints(lastMove);
  const tip = movePoints(hint);
  const active = me !== null && state.turn === me && !disabled && state.phase !== 'over';
  const removing = active && state.mustRemove;
  // 강조 강도를 상황에 맞춘다: 배치는 24칸이 전부 합법이라 은은하게, 이동·제거는 확실하게.
  const mode =
    !active || me === null ? 'idle' : removing ? 'remove' : state.hand[me - 1] > 0 ? 'place' : 'move';

  return (
    <svg
      className={`board board-${mode}`}
      viewBox="-26 -26 352 352"
      role="group"
      aria-label="나인 멘스 모리스 보드"
    >
      <g className="board-lines">
        {RINGS.map(([x, y, size]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={size} height={size} />
        ))}
        {SPOKES.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* 힌트가 '이동'이면 출발→도착을 화살표로 잇는다. */}
      {hint && hint.k === 'move' && (
        <line
          className="board-hint-arrow"
          x1={POINT_XY[hint.from][0]}
          y1={POINT_XY[hint.from][1]}
          x2={POINT_XY[hint.to][0]}
          y2={POINT_XY[hint.to][1]}
        />
      )}

      {Array.from({ length: POINT_COUNT }, (_, i) => {
        const [cx, cy] = POINT_XY[i];
        const owner = state.board[i];
        const playable = view.playable.has(i);
        const isSelected = selected === i;
        const classes = [
          'pt',
          owner === 0 ? 'pt-empty' : owner === 1 ? 'pt-p1' : 'pt-p2',
          playable ? (removing ? 'pt-removable' : 'pt-playable') : '',
          view.selectable.has(i) ? 'pt-selectable' : '',
          isSelected ? 'pt-selected' : '',
          owner !== 0 && view.inMill.has(i) ? 'pt-mill' : '',
          i === last.to ? 'pt-last' : '',
          i === last.from ? 'pt-last-from' : '',
          i === tip.to ? 'pt-hint' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const clickable = playable || view.selectable.has(i);
        return (
          <g
            key={i}
            className={classes}
            transform={`translate(${cx} ${cy})`}
            onClick={() => !disabled && onPoint(i)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={`${POINT_LABEL[i]} ${owner === 0 ? '빈 지점' : owner === 1 ? '흑' : '백'}`}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPoint(i);
              }
            }}
          >
            {/* 손가락으로도 누르기 쉬운 투명 히트 영역. */}
            <circle className="pt-hit" r={22} />
            <circle className="pt-node" r={5} />
            {owner !== 0 && <circle className="pt-piece" r={14} />}
            {owner !== 0 && view.inMill.has(i) && <circle className="pt-mill-ring" r={19} />}
            <circle className="pt-ring" r={18} />
          </g>
        );
      })}
    </svg>
  );
}
