// AI 호출 창구. 워커가 있으면 워커에서, 없으면(테스트·구형 환경) 같은 스레드에서 계산한다.
// UI 는 이 모듈만 부르고 워커의 존재를 몰라도 된다.

import { toTransfer, type GameState, type Move } from '../core/gameState';
import { bestMove, chooseMove, type Difficulty } from './ai';
import type { AiRequest, AiResponse } from './ai.worker';

export interface AiAnswer {
  move: Move | null;
  score?: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: AiAnswer) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AiResponse>) => {
      const done = pending.get(e.data.id);
      if (!done) return; // 이미 버려진(취소된) 요청
      pending.delete(e.data.id);
      done({ move: e.data.move, score: e.data.score });
    };
    worker.onerror = () => {
      // 워커가 죽으면 이후 요청은 동기 계산으로 넘어간다.
      for (const [, done] of pending) done({ move: null });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function ask(kind: AiRequest['kind'], state: GameState, difficulty: Difficulty, timeBudgetMs?: number): Promise<AiAnswer> {
  const w = getWorker();
  if (!w) {
    // 동기 폴백 — UI 가 잠깐 멈추지만 결과는 동일하다.
    if (kind === 'hint') {
      const r = bestMove(state, timeBudgetMs);
      return Promise.resolve({ move: r.move, score: r.score });
    }
    return Promise.resolve({ move: chooseMove(state, difficulty, { timeBudgetMs }) });
  }
  const id = nextId++;
  const req: AiRequest = { id, kind, state: toTransfer(state), difficulty, timeBudgetMs };
  return new Promise<AiAnswer>((resolve) => {
    pending.set(id, resolve);
    w.postMessage(req);
  });
}

/** 난이도에 맞는 AI 의 한 수. */
export function requestAiMove(
  state: GameState,
  difficulty: Difficulty,
  timeBudgetMs?: number,
): Promise<AiAnswer> {
  return ask('move', state, difficulty, timeBudgetMs);
}

/** 힌트(항상 어려움 수준, 짧은 예산). */
export function requestHint(state: GameState, timeBudgetMs = 700): Promise<AiAnswer> {
  return ask('hint', state, 'hard', timeBudgetMs);
}

/** 진행 중인 요청을 모두 버린다(새 게임·되돌리기 등으로 국면이 바뀌었을 때). */
export function cancelPendingAi(): void {
  pending.clear();
}
