// 국면 평가(정적). 탐색이 리프에서 부르는 유일한 점수 함수.
//
// 특징값은 나인 멘스 모리스 문헌에서 쓰이는 고전 지표를 그대로 쓴다:
// 밀 수 · 재료(말 수) · 열린 2줄(밀 위협) · 포크(한 칸에 두 밀이 걸린 이중 위협) ·
// 봉쇄된 상대 말 · 이동성. 가중치는 페이즈(배치/이동/플라잉)마다 다르다.

import { ADJACENCY, MILLS, POINT_COUNT } from '../core/board';
import { canFly, type GameState, type Player } from '../core/gameState';

export interface Weights {
  /** 완성된 밀 1개당. */
  mill: number;
  /** 말 1개당(손패 + 보드). 재료는 대개 가장 무겁다. */
  piece: number;
  /** "내 말 2 + 빈칸 1" 줄 1개당(다음 수 밀 위협). */
  two: number;
  /** 한 빈칸이 두 줄을 동시에 완성하는 이중 위협 1개당. */
  fork: number;
  /** 봉쇄된 상대 말 1개당(내가 얻는 점수). */
  blocked: number;
  /** 이동 가능 수 차이 1당. */
  mobility: number;
  /** 지금 상대 말을 뗄 차례인 쪽에게 주는 보너스(밀을 갓 만든 상태). */
  pending: number;
}

export interface WeightTable {
  placing: Weights;
  moving: Weights;
  flying: Weights;
}

/** 어려움 난이도 — 페이즈별로 나눈 전체 가중치. */
export const FULL_WEIGHTS: WeightTable = {
  placing: { mill: 26, piece: 9, two: 10, fork: 14, blocked: 1, mobility: 0, pending: 20 },
  moving: { mill: 43, piece: 20, two: 10, fork: 12, blocked: 10, mobility: 2, pending: 34 },
  flying: { mill: 20, piece: 60, two: 16, fork: 20, blocked: 0, mobility: 0, pending: 40 },
};

/** 쉬움·보통 난이도 — 밀과 재료만 보는 단순 평가(포크·봉쇄·이동성을 못 본다). */
export const SIMPLE_WEIGHTS: WeightTable = (() => {
  const w: Weights = { mill: 20, piece: 20, two: 6, fork: 0, blocked: 0, mobility: 0, pending: 15 };
  return { placing: w, moving: w, flying: w };
})();

/** 승리 점수. 탐색 깊이로 보정해 "더 빠른 승리"를 선호하게 한다. */
export const WIN_SCORE = 100000;

function weightsFor(s: GameState, table: WeightTable): Weights {
  if (s.hand[0] > 0 || s.hand[1] > 0) return table.placing;
  if (canFly(s, 1) || canFly(s, 2)) return table.flying;
  return table.moving;
}

interface Features {
  mills: [number, number];
  two: [number, number];
  fork: [number, number];
  pieces: [number, number];
  blocked: [number, number];
  mobility: [number, number];
}

export function features(s: GameState): Features {
  const f: Features = {
    mills: [0, 0],
    two: [0, 0],
    fork: [0, 0],
    pieces: [s.onBoard[0] + s.hand[0], s.onBoard[1] + s.hand[1]],
    blocked: [0, 0],
    mobility: [0, 0],
  };

  // 줄 단위: 완성된 밀 / "2 + 빈칸 1" 위협. 위협은 빈칸별로도 세어 포크를 찾는다.
  const threatsAt = new Int8Array(POINT_COUNT * 2);
  for (const [a, b, c] of MILLS) {
    const va = s.board[a];
    const vb = s.board[b];
    const vc = s.board[c];
    if (va !== 0 && va === vb && vb === vc) {
      f.mills[va - 1] += 1;
      continue;
    }
    // 빈칸 1개 + 나머지 둘이 같은 편일 때만 위협.
    const empties = (va === 0 ? 1 : 0) + (vb === 0 ? 1 : 0) + (vc === 0 ? 1 : 0);
    if (empties !== 1) continue;
    const owner = va === 0 ? vb : va;
    if (vb !== 0 && vb !== owner) continue;
    if (vc !== 0 && vc !== owner) continue;
    const hole = va === 0 ? a : vb === 0 ? b : c;
    f.two[owner - 1] += 1;
    threatsAt[hole * 2 + (owner - 1)] += 1;
  }
  for (let p = 0; p < POINT_COUNT; p++) {
    if (threatsAt[p * 2] >= 2) f.fork[0] += 1;
    if (threatsAt[p * 2 + 1] >= 2) f.fork[1] += 1;
  }

  // 봉쇄·이동성은 이동 페이즈에서만 의미가 있다(플라잉이면 항상 열려 있다).
  const fly: [boolean, boolean] = [canFly(s, 1), canFly(s, 2)];
  for (let i = 0; i < POINT_COUNT; i++) {
    const v = s.board[i];
    if (v === 0) continue;
    if (fly[v - 1]) continue;
    let free = 0;
    for (const n of ADJACENCY[i]) if (s.board[n] === 0) free += 1;
    if (free === 0) f.blocked[v - 1] += 1;
    else f.mobility[v - 1] += free;
  }
  return f;
}

/** me 관점의 점수. 클수록 me 에게 좋다. */
export function evaluate(s: GameState, me: Player, table: WeightTable): number {
  const w = weightsFor(s, table);
  const f = features(s);
  const i = me - 1;
  const j = me === 1 ? 1 : 0;

  let score =
    w.mill * (f.mills[i] - f.mills[j]) +
    w.piece * (f.pieces[i] - f.pieces[j]) +
    w.two * (f.two[i] - f.two[j]) +
    w.fork * (f.fork[i] - f.fork[j]) +
    w.blocked * (f.blocked[j] - f.blocked[i]) +
    w.mobility * (f.mobility[i] - f.mobility[j]);

  // 밀을 갓 만들어 상대 말을 뗄 차례라면, 그 이득은 아직 점수에 안 잡혀 있다.
  if (s.mustRemove) score += s.turn === me ? w.pending : -w.pending;
  return score;
}
