// 전술 정합성 — "이 국면에서 이 수를 찾아야 한다"는 최소 보증.
import { describe, expect, it } from 'vitest';
import { isLegal, legalMoves, moveKey, applyMoveInPlace } from '../core/gameState';
import { makeState } from '../core/testkit';
import { WIN_SCORE } from './evaluate';
import { mulberry32 } from '../core/rng';
import { bestMove, chooseMove, DIFFICULTIES } from './ai';

describe('전술', () => {
  it('한 수로 끝나는 자리를 찾는다', () => {
    // X: 0,1,14 / O: 9,10,11(밀). 14→2 로 [0,1,2] 를 만들면 O 를 2개로 줄여 이긴다.
    const s = makeState({
      board: 'XX' + '.'.repeat(7) + 'OOO' + '..X' + '.'.repeat(9),
      turn: 1,
    });
    const r = bestMove(s, 800);
    expect(r.move && moveKey(r.move)).toBe('m14-2');
    expect(r.score).toBeGreaterThan(WIN_SCORE - 1000);
  });

  it('상대의 3목 완성 자리를 막는다', () => {
    // O: 0,1 → 2 가 뚫려 있다. X: 3,21 은 서로 아무 줄도 공유하지 않아 막는 것 말고 할 일이 없다.
    const s = makeState({
      board: 'OO.X' + '.'.repeat(17) + 'X' + '..',
      turn: 1,
      hand: [7, 7],
    });
    const r = bestMove(s, 800);
    expect(r.move && moveKey(r.move)).toBe('p2');
  });

  it('어려움은 같은 국면에서 늘 같은 수를 둔다', () => {
    const s = makeState({
      board: 'OO.X' + '.'.repeat(17) + 'X' + '..',
      turn: 1,
      hand: [7, 7],
    });
    const a = chooseMove(s, 'hard', { timeBudgetMs: 120 });
    const b = chooseMove(s, 'hard', { timeBudgetMs: 120 });
    expect(a && moveKey(a)).toBe(b && moveKey(b));
  });

  it('3개만 남아도 날아가서 급소를 막는다', () => {
    // 같은 국면에서 O 차례. 2 를 비워 두면 다음 수에 X 가 [0,1,2] 로 끝낸다.
    // O 는 말이 3개라 플라잉으로 어느 말이든 2 로 보낼 수 있다 — 어디서 오든 목적지는 2.
    const s = makeState({
      board: 'XX' + '.'.repeat(7) + 'OOO' + '..X' + '.'.repeat(9),
      turn: 2,
    });
    const r = bestMove(s, 800);
    expect(r.move?.k).toBe('move');
    expect(r.move && 'to' in r.move && r.move.to).toBe(2);
    expect(r.score).toBeGreaterThan(-(WIN_SCORE - 1000));
  });
});

describe('모든 난이도', () => {
  it('실제 대국 도중 어떤 국면에서도 합법 수만 낸다', () => {
    const rng = mulberry32(20260907);
    for (const difficulty of DIFFICULTIES) {
      const s = makeState({ board: '.'.repeat(24), turn: 1, hand: [9, 9] });
      for (let i = 0; i < 60 && !s.result; i++) {
        const m = chooseMove(s, difficulty, { rng, timeBudgetMs: 40 });
        expect(m).not.toBeNull();
        expect(isLegal(s, m!)).toBe(true);
        applyMoveInPlace(s, m!);
      }
      // 60 ply 면 배치(18) 를 지나 이동 페이즈까지 반드시 들어간다.
      expect(s.result !== null || s.phase === 'moving').toBe(true);
    }
  });

  it('둘 수 없는 국면에서는 null 을 낸다', () => {
    // X: 0,1,2,3 이 전부 막혀 있고 배치도 끝났다 — 합법 수 0.
    const s = makeState({ board: 'XXXXO....O....O...O.....', turn: 1 });
    // 이 국면 자체는 3→10 이 열려 있으므로 수가 있다. 10 을 막으면 없어진다.
    expect(legalMoves(s)).toHaveLength(1);
    const blocked = makeState({ board: 'XXXXO....O' + 'O' + '...O...O.....', turn: 1 });
    expect(legalMoves(blocked)).toHaveLength(0);
    expect(chooseMove(blocked, 'hard', { timeBudgetMs: 40 })).toBeNull();
  });
});
