// 좌석 계약: 설정(seatPref)과 이번 판의 좌석(humanSeat)은 따로 논다.
// 이 둘을 섞으면 (a) 'random' 이 조용히 흑이 되고 (b) 판 도중 색이 바뀌어 보드가 잠긴다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Move } from '../core/gameState';

// 워커는 이 테스트의 관심사가 아니다 — AI 가 두지 않아도 좌석 계약은 성립해야 한다.
vi.mock('../engine/aiClient', () => ({
  cancelPendingAi: vi.fn(),
  requestAiMove: vi.fn(async () => ({ move: null })),
  requestHint: vi.fn(async () => ({ move: null })),
}));

const { canUndo, useGameStore } = await import('./gameStore');
const { requestAiMove, requestHint } = await import('../engine/aiClient');

const store = () => useGameStore.getState();

/** runAi 는 최소 생각 시간만큼 끌기 때문에, thinking 이 내려앉을 때까지 기다린다. */
async function settle() {
  for (let i = 0; i < 100 && store().thinking; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** 힌트 응답의 then 이 돌 때까지 기다린다. */
async function flushHint() {
  for (let i = 0; i < 50 && store().hintLoading; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** 원할 때 응답시킬 수 있는 힌트 요청 하나를 걸어 둔다. */
function deferHint(): (move: Move | null) => void {
  let resolve!: (r: { move: Move | null }) => void;
  vi.mocked(requestHint).mockImplementationOnce(
    () => new Promise((r) => { resolve = r; }),
  );
  return (move) => resolve({ move });
}

describe('newGame 이 좌석을 확정한다', () => {
  beforeEach(() => store().newGame({ seatPref: '1' }));

  it('흑을 고르면 내가 선공이다', () => {
    store().newGame({ seatPref: '1' });
    expect(store().humanSeat).toBe(1);
    expect(store().state.turn).toBe(1);
  });

  it('백을 고르면 좌석이 2다 — 첫 차례는 흑(AI)에게 있다', () => {
    store().newGame({ seatPref: '2' });
    expect(store().humanSeat).toBe(2);
    expect(store().state.turn).toBe(1);
  });

  it('랜덤이어도 humanSeat 에는 언제나 좌석(1|2)만 들어간다', () => {
    for (let i = 0; i < 50; i++) {
      store().newGame({ seatPref: 'random' });
      expect([1, 2]).toContain(store().humanSeat);
      expect(store().seatPref).toBe('random');
    }
  });

  it('랜덤은 판마다 다시 뽑는다', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      store().newGame({ seatPref: 'random' });
      seen.add(store().humanSeat);
    }
    expect(seen).toEqual(new Set([1, 2]));
  });

  it('인자를 주지 않으면 저장된 선택을 쓴다', () => {
    store().setSeatPref('2');
    store().newGame();
    expect(store().humanSeat).toBe(2);
  });
});

describe('setSeatPref 는 진행 중인 판을 건드리지 않는다', () => {
  it('판 도중 색을 바꿔도 이번 판의 좌석은 그대로다', () => {
    // 회귀: 예전에는 humanSeat 이 즉시 뒤집혀 보드가 잠겼다(#2).
    store().newGame({ seatPref: '1' });
    store().clickPoint(0);
    const before = store().humanSeat;
    const turn = store().state.turn;

    store().setSeatPref('2');

    expect(store().seatPref).toBe('2');
    expect(store().humanSeat).toBe(before);
    expect(store().state.turn).toBe(turn);
  });

  it('바꾼 선택은 다음 판부터 적용된다', () => {
    store().newGame({ seatPref: '1' });
    store().setSeatPref('2');
    expect(store().humanSeat).toBe(1);

    store().newGame();
    expect(store().humanSeat).toBe(2);
  });

  it('랜덤으로 바꿔도 진행 중인 판의 좌석은 좌석으로 남는다', () => {
    store().newGame({ seatPref: '2' });
    store().setSeatPref('random');
    expect(store().humanSeat).toBe(2);
    expect(store().seatPref).toBe('random');
  });
});

describe('힌트는 계산을 시킨 그 국면에만 붙는다', () => {
  // 회귀(#5): generation 은 착수로 오르지 않는다. 그래서 "💡 를 누르고 응답 전에 두면"
  // 지나간 국면 기준의 힌트가 새 보드 위에 그려지고 AI 응수를 넘어 다음 차례까지 남았다.
  it('국면이 그대로면 힌트가 들어온다', async () => {
    store().newGame({ seatPref: '1' });
    const answer = deferHint();
    store().askHint();
    expect(store().hintLoading).toBe(true);

    answer({ k: 'place', to: 4 });
    await flushHint();

    expect(store().hint).toEqual({ k: 'place', to: 4 });
    expect(store().hintLoading).toBe(false);
  });

  it('기다리는 동안 착수했으면 뒤늦게 온 힌트를 버린다', async () => {
    store().newGame({ seatPref: '1' });
    const answer = deferHint();
    store().askHint();

    store().clickPoint(0); // 힌트가 오기 전에 두어 버린다
    answer({ k: 'place', to: 4 }); // 두 수 전 국면 기준의 수가 뒤늦게 도착

    await settle();
    await flushHint();

    expect(store().hint).toBeNull();
    expect(store().hintLoading).toBe(false);
  });

  it('새 게임이 끼어들었으면 힌트가 새 판으로 새지 않는다', async () => {
    store().newGame({ seatPref: '1' });
    const answer = deferHint();
    store().askHint();

    store().newGame({ seatPref: '1' });
    answer({ k: 'place', to: 4 });

    await flushHint();

    expect(store().hint).toBeNull();
    expect(store().hintLoading).toBe(false);
  });

  it('AI 가 두고 나면 힌트가 화면에 남지 않는다', async () => {
    store().newGame({ seatPref: '1' });
    vi.mocked(requestHint).mockImplementationOnce(async () => ({
      move: { k: 'place', to: 4 } as Move,
    }));
    store().askHint();
    await flushHint();
    expect(store().hint).not.toBeNull();

    // AI 가 실제로 한 수 두는 경로를 태운다.
    vi.mocked(requestAiMove).mockImplementationOnce(async () => ({
      move: { k: 'place', to: 23 } as Move,
    }));
    store().clickPoint(0);
    await settle();

    expect(store().state.board[23]).toBe(2);
    expect(store().hint).toBeNull();
  });
});

describe('되돌리기는 좌석을 따른다', () => {
  it('한 수도 두지 않았으면 되돌릴 수 없다', () => {
    store().newGame({ seatPref: '1' });
    expect(canUndo(store())).toBe(false);
  });

  it('AI 가 생각하는 동안에는 되돌릴 수 없다', () => {
    store().newGame({ seatPref: '1' });
    store().clickPoint(0);
    expect(store().thinking).toBe(true);
    expect(canUndo(store())).toBe(false);
  });

  it('내가 둔 뒤에는 그 수 직전으로 돌아간다', async () => {
    store().newGame({ seatPref: '1' });
    store().clickPoint(0);
    await settle();
    expect(canUndo(store())).toBe(true);

    store().undo();
    expect(store().state.ply).toBe(0);
    expect(store().state.turn).toBe(1);
    expect(canUndo(store())).toBe(false);
  });

  it('백일 때 AI 만 둔 국면은 되돌릴 자리가 아니다 — 기록이 있어도 되돌릴 수 없다', async () => {
    // 회귀: 예전 트레이 구현은 여기서 past 를 통째로 비웠다.
    store().newGame({ seatPref: '2' });
    await settle();
    const past = [store().state];
    useGameStore.setState({ past });

    expect(past.length).toBe(1);
    expect(canUndo(store())).toBe(false);

    store().undo();
    expect(store().past).toBe(past); // 기록이 날아가지 않는다
  });
});
