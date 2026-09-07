// Zobrist 해시 키. 반복 무승부 판정과 엔진 전치표가 같은 해시를 쓴다.
// 고정 시드 PRNG 라 실행마다 값이 같다(테스트·저장 국면 재현 가능).

import { POINT_COUNT } from './board';
import { DEFAULT_RULES } from './rules';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(0x9e3779b9);
const key = () => (rnd() * 4294967296) | 0;
const table = (n: number) => Array.from({ length: n }, key);

/** hand 키는 0..piecesPerPlayer 를 모두 커버해야 한다(경계 포함). */
const HAND_LEVELS = DEFAULT_RULES.piecesPerPlayer + 1;

export const ZOB = {
  /** [플레이어-1][지점] — 보드 위 말. */
  piece: [table(POINT_COUNT), table(POINT_COUNT)] as const,
  /** [플레이어-1][남은 배치 말 수] — 배치 페이즈 구분. */
  hand: [table(HAND_LEVELS), table(HAND_LEVELS)] as const,
  /** 차례가 2P 일 때 XOR. */
  turn: key(),
  /** 제거 대기(밀 완성 직후) 상태일 때 XOR. */
  mustRemove: key(),
} as const;
