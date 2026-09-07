// 테스트 전용 국면 빌더. 앱 번들에는 포함되지 않는다(테스트에서만 import).
//
// 보드 문자열은 24글자 — '.' 빈칸 / 'X' 1P / 'O' 2P. 인덱스는 board.ts 순서 그대로:
//   "XXX.....................", "...X.O..................", …

import { POINT_COUNT } from './board';
import { DEFAULT_RULES, type RuleConfig } from './rules';
import { computeHash, type GameState, type Player } from './gameState';

export interface StateSpec {
  board: string;
  turn?: Player;
  /** 남은 배치 말 [1P, 2P]. 생략하면 배치가 끝난 상태([0, 0]). */
  hand?: [number, number];
  mustRemove?: boolean;
  rules?: Partial<RuleConfig>;
}

export function makeState(spec: StateSpec): GameState {
  const cells = spec.board.replace(/\s/g, '');
  if (cells.length !== POINT_COUNT) {
    throw new Error(`board 문자열은 ${POINT_COUNT}글자여야 합니다 (받은 값: ${cells.length})`);
  }
  const board = new Int8Array(POINT_COUNT);
  const onBoard: [number, number] = [0, 0];
  for (let i = 0; i < POINT_COUNT; i++) {
    const c = cells[i];
    if (c === 'X') {
      board[i] = 1;
      onBoard[0] += 1;
    } else if (c === 'O') {
      board[i] = 2;
      onBoard[1] += 1;
    } else if (c !== '.') {
      throw new Error(`알 수 없는 칸 문자: ${c}`);
    }
  }
  const rules: RuleConfig = { ...DEFAULT_RULES, ...spec.rules };
  const hand: [number, number] = spec.hand ? [spec.hand[0], spec.hand[1]] : [0, 0];
  const s: GameState = {
    board,
    turn: spec.turn ?? 1,
    hand,
    onBoard,
    mustRemove: spec.mustRemove ?? false,
    phase: hand[0] > 0 || hand[1] > 0 ? 'placing' : 'moving',
    result: null,
    hash: 0,
    history: [],
    reps: new Map(),
    sinceCapture: 0,
    ply: 0,
    rules,
  };
  s.hash = computeHash(s);
  s.history.push(s.hash);
  s.reps.set(s.hash, 1);
  return s;
}

/** 국면을 24글자 보드 문자열로. 실패한 테스트를 눈으로 읽기 위한 것. */
export function formatBoard(s: GameState): string {
  let out = '';
  for (let i = 0; i < POINT_COUNT; i++) out += s.board[i] === 1 ? 'X' : s.board[i] === 2 ? 'O' : '.';
  return out;
}
