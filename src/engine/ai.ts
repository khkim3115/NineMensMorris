// AI 공개 API. UI·트레이 앱·테스트는 여기만 부른다.
//
// 난이도 차이는 세 축으로 만든다:
//   1) 탐색 깊이·시간 예산  2) 평가함수 정밀도(단순/전체)  3) 실수 확률과 점수 잡음.
// 쉬움은 한 수 앞만 보고 자주 실수하고, 보통은 4수 앞을 단순 평가로 보고,
// 어려움은 시간 예산까지 반복심화로 파고 잡음 없이 결정론적으로 둔다.

import {
  legalMoves,
  type GameState,
  type Move,
} from '../core/gameState';
import { FULL_WEIGHTS, SIMPLE_WEIGHTS, type WeightTable } from './evaluate';
import { search, type SearchResult } from './search';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

export const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: '한 수 앞만 봅니다. 밀을 막지 못하고 자주 실수합니다.',
  normal: '네 수 앞까지 읽습니다. 밀과 말 수는 챙기지만 함정은 놓칩니다.',
  hard: '시간이 허락하는 만큼 깊이 읽습니다. 이중 위협과 봉쇄까지 계산합니다.',
};

export interface DifficultyPreset {
  maxDepth: number;
  timeBudgetMs: number;
  weights: WeightTable;
  /** 루트 후보 점수에 섞는 잡음 폭. */
  noise: number;
  /** 이 확률로 최선수 대신 아무 합법수나 둔다. */
  blunderRate: number;
}

export const PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: { maxDepth: 1, timeBudgetMs: 100, weights: SIMPLE_WEIGHTS, noise: 45, blunderRate: 0.25 },
  normal: { maxDepth: 4, timeBudgetMs: 600, weights: SIMPLE_WEIGHTS, noise: 6, blunderRate: 0.03 },
  hard: { maxDepth: 16, timeBudgetMs: 1500, weights: FULL_WEIGHTS, noise: 0, blunderRate: 0 },
};

export interface ChooseOptions {
  /** 기본 Math.random. 테스트는 시드 PRNG 를 넣어 재현한다. */
  rng?: () => number;
  /** 프리셋 시간 예산을 덮어쓴다(트레이 앱은 더 짧게 준다). */
  timeBudgetMs?: number;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 난이도에 맞는 한 수. 둘 수 없으면 null. */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  opts: ChooseOptions = {},
): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const preset = PRESETS[difficulty];
  const rng = opts.rng ?? Math.random;

  if (preset.blunderRate > 0 && rng() < preset.blunderRate) {
    return moves[Math.floor(rng() * moves.length)];
  }

  const budget = opts.timeBudgetMs ?? preset.timeBudgetMs;
  const result = search(state, {
    maxDepth: preset.maxDepth,
    weights: preset.weights,
    deadline: now() + budget,
    // 어려움은 잡음도 무작위 동점 선택도 없다 — 같은 국면이면 항상 같은 수.
    rng: preset.noise > 0 ? rng : undefined,
    noise: preset.noise,
  });
  return result.move ?? moves[0];
}

/**
 * 힌트용 최선수. 난이도와 무관하게 항상 어려움 수준으로 읽고,
 * 사람을 기다리게 하지 않도록 예산만 짧게 준다.
 */
export function bestMove(state: GameState, timeBudgetMs = 700): SearchResult {
  return search(state, {
    maxDepth: PRESETS.hard.maxDepth,
    weights: FULL_WEIGHTS,
    deadline: now() + timeBudgetMs,
  });
}
