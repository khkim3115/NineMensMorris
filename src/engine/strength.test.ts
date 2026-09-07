// 난이도 강도 회귀. 요트다이스의 "최적 정책 시뮬 평균이 테이블 예측과 맞는가"에 대응하는,
// 이 저장소의 핵심 sanity check — 평가함수나 탐색을 건드리면 여기가 먼저 무너진다.
//
// 나인 멘스 모리스는 완전한 플레이에서 무승부인 게임이라 강자도 약자를 상대로 비기는 일이 잦다.
// 그래서 승률이 아니라 **승점 비율**(승 1 · 무 0.5)로 본다.

import { describe, expect, it } from 'vitest';
import {
  applyMoveInPlace,
  createInitialState,
  type GameResult,
  type Player,
} from '../core/gameState';
import { mulberry32 } from '../core/rng';
import { chooseMove, type Difficulty } from './ai';

/** 테스트용 시간 예산 — 실제 앱보다 훨씬 짧게 준다(강도 차이는 깊이·평가가 만든다). */
const BUDGET: Record<Difficulty, number> = { easy: 20, normal: 50, hard: 60 };

/** 한 판. 1P 는 first, 2P 는 second 난이도로 둔다. */
function playGame(first: Difficulty, second: Difficulty, rng: () => number): GameResult {
  const s = createInitialState();
  for (let ply = 0; ply < 400; ply++) {
    if (s.result) return s.result;
    const d = s.turn === 1 ? first : second;
    const m = chooseMove(s, d, { rng, timeBudgetMs: BUDGET[d] });
    if (!m) break;
    applyMoveInPlace(s, m);
  }
  return s.result ?? { kind: 'draw', reason: 'stale' };
}

/** games 판을 선후공 번갈아 두고 strong 쪽 승점 비율을 돌려준다. */
function scoreRate(strong: Difficulty, weak: Difficulty, games: number, seed: number): number {
  const rng = mulberry32(seed);
  let points = 0;
  for (let i = 0; i < games; i++) {
    const strongIsFirst = i % 2 === 0;
    const r = playGame(strongIsFirst ? strong : weak, strongIsFirst ? weak : strong, rng);
    if (r.kind === 'draw') {
      points += 0.5;
      continue;
    }
    const strongSeat: Player = strongIsFirst ? 1 : 2;
    if (r.winner === strongSeat) points += 1;
  }
  return points / games;
}

describe('난이도 강도', () => {
  it('어려움이 보통보다 확실히 강하다', { timeout: 300_000 }, () => {
    const rate = scoreRate('hard', 'normal', 10, 11);
    // eslint-disable-next-line no-console
    console.log(`hard vs normal 승점 비율: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  it('보통이 쉬움보다 확실히 강하다', { timeout: 300_000 }, () => {
    const rate = scoreRate('normal', 'easy', 12, 22);
    // eslint-disable-next-line no-console
    console.log(`normal vs easy 승점 비율: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  it('어려움이 쉬움에게는 한 판도 안 진다', { timeout: 300_000 }, () => {
    const rate = scoreRate('hard', 'easy', 8, 33);
    // eslint-disable-next-line no-console
    console.log(`hard vs easy 승점 비율: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });
});
