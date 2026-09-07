// 표준 룰의 규칙 계약. UI·AI·서버가 전부 이 동작을 전제로 만들어진다.
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  applyMoveInPlace,
  canFly,
  computeHash,
  createInitialState,
  formsMill,
  legalMoves,
  legalRemovals,
  moveKey,
  undoMove,
  type GameState,
  type Move,
  type Undo,
} from './gameState';
import { makeState } from './testkit';

const keys = (ms: Move[]) => ms.map(moveKey).sort();

describe('초기 상태', () => {
  it('양쪽 9개씩 손에 들고 1P 배치부터 시작한다', () => {
    const s = createInitialState();
    expect(s.turn).toBe(1);
    expect(s.hand).toEqual([9, 9]);
    expect(s.onBoard).toEqual([0, 0]);
    expect(s.phase).toBe('placing');
    expect(legalMoves(s)).toHaveLength(24);
    expect(s.hash).toBe(computeHash(s));
  });
});

describe('밀과 말 제거', () => {
  it('배치로 밀을 만들면 차례가 유지된 채 제거 ply 로 넘어간다', () => {
    // X: 0,1 / O: 9,10 — X 가 2 에 놓으면 [0,1,2] 밀.
    const s = makeState({ board: 'XX.......OO.............', turn: 1, hand: [7, 7] });
    const next = applyMove(s, { k: 'place', to: 2 });

    expect(formsMill(next.board, 2, 1)).toBe(true);
    expect(next.mustRemove).toBe(true);
    expect(next.turn).toBe(1); // 차례는 그대로 — 제거가 별도 ply
    expect(keys(legalMoves(next))).toEqual(['x10', 'x9']);
    expect(next.hash).toBe(computeHash(next));

    const after = applyMove(next, { k: 'remove', at: 9 });
    expect(after.board[9]).toBe(0);
    expect(after.onBoard).toEqual([3, 1]);
    expect(after.mustRemove).toBe(false);
    expect(after.turn).toBe(2);
  });

  it('밀에 속한 상대 말은 제거할 수 없다', () => {
    // O 의 [9,10,11] 은 밀, 3 은 자유말 → 3 만 제거 가능.
    const s = makeState({ board: 'XX.O.....OOO............', turn: 1, hand: [7, 5] });
    const next = applyMove(s, { k: 'place', to: 2 });
    expect(keys(legalMoves(next))).toEqual(['x3']);
  });

  it('상대 말이 전부 밀이면 예외적으로 아무거나 제거한다', () => {
    const s = makeState({ board: 'XX.......OOO............', turn: 1, hand: [7, 6] });
    const next = applyMove(s, { k: 'place', to: 2 });
    expect(keys(legalMoves(next))).toEqual(['x10', 'x11', 'x9']);
    expect(legalRemovals(next.board, 2)).toEqual([9, 10, 11]);
  });

  it('두 밀을 동시에 만들어도 말은 1개만 뺏는다', () => {
    // X: 0,1(가로 예비) + 9,21(세로 예비) → 2 가 아니라 0 자리에 놓아 두 줄을 동시에 완성.
    const s = makeState({ board: '.XX......X..........OX..', turn: 1, hand: [5, 8] });
    const next = applyMove(s, { k: 'place', to: 0 });
    expect(formsMill(next.board, 0, 1)).toBe(true);
    expect(next.mustRemove).toBe(true);
    const after = applyMove(next, { k: 'remove', at: 20 });
    expect(after.mustRemove).toBe(false); // 제거는 한 번뿐
    expect(after.turn).toBe(2);
  });
});

describe('이동과 플라잉', () => {
  it('배치가 끝나면 인접한 빈칸으로만 움직인다', () => {
    // X: 0,1,2,3 / O: 4,9,14,18 — X 의 3 만 살아 있고 나머지는 막혀 있다.
    const s = makeState({ board: 'XXXXO....O....O...O.....', turn: 1 });
    expect(s.phase).toBe('moving');
    expect(canFly(s, 1)).toBe(false);
    expect(keys(legalMoves(s))).toEqual(['m3-10']);
  });

  it('말이 3개만 남으면 아무 빈칸으로 날아간다', () => {
    const s = makeState({ board: 'X.....X.............X...', turn: 1 });
    expect(canFly(s, 1)).toBe(true);
    expect(legalMoves(s)).toHaveLength(3 * 21);
  });
});

describe('종료 판정', () => {
  it('말이 2개로 줄면 패배한다', () => {
    // O 가 13→5 로 [3,4,5] 밀을 만들고 X 말 하나를 떼면 X 는 2개.
    const s = makeState({ board: 'XX.OO....X...O..........', turn: 2 });
    const milled = applyMove(s, { k: 'move', from: 13, to: 5 });
    expect(milled.mustRemove).toBe(true);
    const done = applyMove(milled, { k: 'remove', at: 0 });
    expect(done.phase).toBe('over');
    expect(done.result).toEqual({ kind: 'win', winner: 2, reason: 'pieces' });
  });

  it('움직일 수 없으면 패배한다', () => {
    // O 가 18→10 으로 X 의 마지막 숨통(3→10)을 막는다.
    const s = makeState({ board: 'XXXXO....O....O...O.....', turn: 2 });
    const done = applyMove(s, { k: 'move', from: 18, to: 10 });
    expect(done.turn).toBe(1);
    expect(done.result).toEqual({ kind: 'win', winner: 2, reason: 'blocked' });
  });

  it('같은 국면이 3번 나오면 무승부', () => {
    const s = makeState({ board: 'XXX...OOO......O.....X..', turn: 1 });
    const shuttle: Move[] = [
      { k: 'move', from: 21, to: 9 },
      { k: 'move', from: 15, to: 16 },
      { k: 'move', from: 9, to: 21 },
      { k: 'move', from: 16, to: 15 },
    ];
    let cur = s;
    for (const m of [...shuttle, ...shuttle]) cur = applyMove(cur, m);
    expect(cur.result).toEqual({ kind: 'draw', reason: 'repetition' });
  });

  it('말을 못 뺏은 채 정해진 수를 넘기면 무승부', () => {
    const s = makeState({
      board: 'XXX...OOO......O.....X..',
      turn: 1,
      rules: { staleMoveLimit: 4 },
    });
    const shuttle: Move[] = [
      { k: 'move', from: 21, to: 9 },
      { k: 'move', from: 15, to: 16 },
      { k: 'move', from: 9, to: 21 },
      { k: 'move', from: 16, to: 15 },
    ];
    let cur = s;
    for (const m of shuttle) cur = applyMove(cur, m);
    expect(cur.result).toEqual({ kind: 'draw', reason: 'stale' });
  });
});

describe('상태 관리', () => {
  it('applyMove 는 원본을 건드리지 않는다', () => {
    const s = createInitialState();
    const before = { hash: s.hash, hand: [...s.hand], ply: s.ply };
    applyMove(s, { k: 'place', to: 0 });
    expect(s.board[0]).toBe(0);
    expect(s.hash).toBe(before.hash);
    expect(s.hand).toEqual(before.hand);
    expect(s.ply).toBe(before.ply);
  });

  it('증분 해시는 항상 전체 재계산과 같다', () => {
    const s = createInitialState();
    for (let i = 0; i < 40; i++) {
      const ms = legalMoves(s);
      if (ms.length === 0) break;
      applyMoveInPlace(s, ms[i % ms.length]);
      expect(s.hash).toBe(computeHash(s));
    }
  });

  it('undo 를 끝까지 되돌리면 시작 국면과 완전히 같아진다', () => {
    const s = createInitialState();
    const snap = snapshotOf(s);
    const undos: Undo[] = [];
    for (let i = 0; i < 40; i++) {
      const ms = legalMoves(s);
      if (ms.length === 0) break;
      undos.push(applyMoveInPlace(s, ms[i % ms.length]));
    }
    expect(s.ply).toBeGreaterThan(20);
    while (undos.length) undoMove(s, undos.pop()!);
    expect(snapshotOf(s)).toEqual(snap);
  });
});

function snapshotOf(s: GameState) {
  return {
    board: Array.from(s.board),
    turn: s.turn,
    hand: [...s.hand],
    onBoard: [...s.onBoard],
    mustRemove: s.mustRemove,
    phase: s.phase,
    result: s.result,
    hash: s.hash,
    history: [...s.history],
    reps: [...s.reps.entries()].sort((a, b) => a[0] - b[0]),
    sinceCapture: s.sinceCapture,
    ply: s.ply,
  };
}
