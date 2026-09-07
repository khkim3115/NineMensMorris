// 알파베타 negamax + 반복심화 + 전치표 + 무브 오더링.
//
// 깊이는 "차례 수"로 센다. 밀을 만든 뒤의 제거 ply 는 같은 플레이어가 이어 두는 강제 수라
// 깊이를 깎지 않고 부호도 뒤집지 않는다(자식의 turn 이 바뀔 때만 뒤집는다).

import { MILLS_BY_POINT, MILLS } from '../core/board';
import {
  applyMoveInPlace,
  legalMoves,
  moveKey,
  sameMove,
  undoMove,
  type GameState,
  type Move,
  type Player,
} from '../core/gameState';
import { WIN_SCORE, evaluate, type WeightTable } from './evaluate';

export interface SearchOptions {
  /** 최대 탐색 깊이(차례 단위). */
  maxDepth: number;
  weights: WeightTable;
  /** performance.now() 기준 마감 시각. 넘으면 그때까지 끝난 깊이의 결과를 쓴다. */
  deadline?: number;
  /** 동점·근소차 무작위 선택용. 없으면 결정론적으로 첫 최선수를 고른다. */
  rng?: () => number;
  /** 루트 후보 점수에 섞는 잡음 폭(쉬움 난이도가 실수하도록). */
  noise?: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  /** 실제로 완주한 깊이. */
  depth: number;
  nodes: number;
  /** 마감 때문에 중간에 끊겼는가. */
  timedOut: boolean;
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const TT_MAX_ENTRIES = 1 << 18;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  move: Move | null;
}

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

class Searcher {
  private tt = new Map<number, TTEntry>();
  private history = new Map<string, number>();
  private nodes = 0;
  private aborted = false;

  constructor(private readonly opts: SearchOptions) {}

  /** 반복심화. 깊이를 하나씩 올리며 마감 전까지 완주한 마지막 결과를 돌려준다. */
  run(root: GameState): SearchResult {
    let best: SearchResult = {
      move: null,
      score: 0,
      depth: 0,
      nodes: 0,
      timedOut: false,
    };

    for (let depth = 1; depth <= this.opts.maxDepth; depth++) {
      this.aborted = false;
      const r = this.searchRoot(root, depth);
      if (this.aborted) {
        best = { ...best, nodes: this.nodes, timedOut: true };
        break;
      }
      best = { ...r, nodes: this.nodes, timedOut: false };
      // 확실한 승패를 찾았으면 더 파도 의미 없다.
      if (Math.abs(best.score) >= WIN_SCORE - 1000) break;
    }
    if (!best.move) {
      const ms = legalMoves(root);
      best.move = ms.length ? ms[0] : null;
    }
    return best;
  }

  private searchRoot(s: GameState, depth: number): SearchResult {
    const moves = this.order(s, this.ttMove(s));
    const rng = this.opts.rng;
    const noise = this.opts.noise ?? 0;
    // 잡음을 섞을 때는 루트에서 알파 가지치기를 끈다 — 안 그러면 컷된 수의 점수가
    // 상한값일 뿐이라, 잡음을 더해 고르면 실제로 얼마나 나쁜 수인지 알 수 없다.
    const prune = noise === 0;

    let alpha = -Infinity;
    let bestMove: Move | null = null;
    let bestTrue = -Infinity;
    let bestRanked = -Infinity;
    let ties = 0;

    for (const m of moves) {
      const score = this.child(s, m, depth, prune ? alpha : -Infinity, Infinity, 0);
      if (this.aborted) {
        return { move: bestMove, score: bestTrue, depth, nodes: this.nodes, timedOut: true };
      }
      const ranked = score + (noise > 0 && rng ? (rng() * 2 - 1) * noise : 0);
      if (bestMove === null || ranked > bestRanked) {
        bestRanked = ranked;
        bestTrue = score;
        bestMove = m;
        ties = 1;
        if (score > alpha) alpha = score;
      } else if (ranked === bestRanked) {
        // 동점은 무작위로 고른다(reservoir) — rng 가 없으면 결정론적으로 첫 수 유지.
        ties += 1;
        if (rng && rng() < 1 / ties) {
          bestTrue = score;
          bestMove = m;
        }
      }
    }
    if (bestMove) {
      this.tt.set(s.hash, { depth, score: bestTrue, flag: TT_EXACT, move: bestMove });
    }
    return { move: bestMove, score: bestTrue, depth, nodes: this.nodes, timedOut: false };
  }

  /** 한 수를 두고 자식을 평가한다. 부호 뒤집기는 차례가 실제로 넘어갔을 때만. */
  private child(s: GameState, m: Move, depth: number, alpha: number, beta: number, ply: number): number {
    const mover = s.turn;
    const u = applyMoveInPlace(s, m);
    let score: number;
    if (s.turn === mover) {
      // 제거 ply — 같은 플레이어가 이어 둔다. 깊이도 부호도 그대로.
      score = this.negamax(s, depth, alpha, beta, ply + 1);
    } else {
      score = -this.negamax(s, depth - 1, -beta, -alpha, ply + 1);
    }
    undoMove(s, u);
    return score;
  }

  private negamax(s: GameState, depth: number, alphaIn: number, beta: number, ply: number): number {
    this.nodes += 1;
    if ((this.nodes & 0x3ff) === 0 && this.opts.deadline !== undefined && now() >= this.opts.deadline) {
      this.aborted = true;
      return 0;
    }

    if (s.result) {
      if (s.result.kind === 'draw') return 0;
      return s.result.winner === s.turn ? WIN_SCORE - ply : -(WIN_SCORE - ply);
    }
    if (depth <= 0) return evaluate(s, s.turn, this.opts.weights);

    let alpha = alphaIn;
    const hit = this.tt.get(s.hash);
    if (hit && hit.depth >= depth) {
      if (hit.flag === TT_EXACT) return hit.score;
      if (hit.flag === TT_LOWER && hit.score > alpha) alpha = hit.score;
      else if (hit.flag === TT_UPPER && hit.score < beta) beta = hit.score;
      if (alpha >= beta) return hit.score;
    }

    const moves = this.order(s, hit?.move ?? null);
    if (moves.length === 0) return evaluate(s, s.turn, this.opts.weights);

    let best = -Infinity;
    let bestMove: Move | null = null;
    for (const m of moves) {
      const score = this.child(s, m, depth, alpha, beta, ply);
      if (this.aborted) return best === -Infinity ? 0 : best;
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        const key = moveKey(m);
        this.history.set(key, (this.history.get(key) ?? 0) + depth * depth);
        break;
      }
    }

    if (this.tt.size >= TT_MAX_ENTRIES) this.tt.clear();
    this.tt.set(s.hash, {
      depth,
      score: best,
      flag: best <= alphaIn ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT,
      move: bestMove,
    });
    return best;
  }

  private ttMove(s: GameState): Move | null {
    return this.tt.get(s.hash)?.move ?? null;
  }

  /** 무브 오더링: 전치표 수 → 밀 완성/저지 → 히스토리. */
  private order(s: GameState, ttMove: Move | null): Move[] {
    const moves = legalMoves(s);
    if (moves.length <= 1) return moves;
    const scored = moves.map((m) => ({ m, v: this.moveScore(s, m, ttMove) }));
    scored.sort((a, b) => b.v - a.v);
    return scored.map((x) => x.m);
  }

  private moveScore(s: GameState, m: Move, ttMove: Move | null): number {
    if (ttMove && sameMove(m, ttMove)) return 1 << 20;
    let v = this.history.get(moveKey(m)) ?? 0;
    const me = s.turn;
    const opp: Player = me === 1 ? 2 : 1;

    if (m.k === 'remove') {
      // 상대의 밀 위협에 걸린 말부터 뗀다.
      v += 400 + threatWeight(s, m.at, opp) * 60;
      return v;
    }

    const to = m.to;
    const from = m.k === 'move' ? m.from : -1;
    if (completesMill(s, to, me, from)) v += 5000;
    // 상대가 다음 수에 밀을 만들 자리를 먼저 차지하면 큰 점수.
    if (completesMill(s, to, opp, -1)) v += 3000;
    return v;
  }
}

/** point 에 me 의 말을 놓으면(from 은 비우면서) 밀이 완성되는가. */
function completesMill(s: GameState, point: number, me: Player, from: number): boolean {
  for (const mi of MILLS_BY_POINT[point]) {
    const line = MILLS[mi];
    let ok = true;
    for (const p of line) {
      if (p === point) continue;
      if (p === from || s.board[p] !== me) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** 이 말이 몇 개의 "2 + 빈칸" 줄에 걸려 있는가(제거 우선순위). */
function threatWeight(s: GameState, point: number, owner: Player): number {
  let n = 0;
  for (const mi of MILLS_BY_POINT[point]) {
    const line = MILLS[mi];
    let mine = 0;
    let empty = 0;
    for (const p of line) {
      if (s.board[p] === owner) mine += 1;
      else if (s.board[p] === 0) empty += 1;
    }
    if (mine === 2 && empty === 1) n += 1;
  }
  return n;
}

export function search(state: GameState, opts: SearchOptions): SearchResult {
  return new Searcher(opts).run(state);
}
