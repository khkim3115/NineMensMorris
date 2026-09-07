// 보드 위상 불변식. 여기가 깨지면 UI·AI·서버가 조용히 다른 게임을 하게 된다.
import { describe, expect, it } from 'vitest';
import {
  ADJACENCY,
  MILLS,
  MILLS_BY_POINT,
  POINT_COUNT,
  POINT_LABEL,
  POINT_XY,
  isAdjacent,
} from './board';

describe('board topology', () => {
  it('24 지점 · 라벨·좌표가 모두 유일하다', () => {
    expect(ADJACENCY).toHaveLength(POINT_COUNT);
    expect(POINT_XY).toHaveLength(POINT_COUNT);
    expect(POINT_LABEL).toHaveLength(POINT_COUNT);
    expect(new Set(POINT_LABEL).size).toBe(POINT_COUNT);
    expect(new Set(POINT_XY.map((xy) => xy.join(','))).size).toBe(POINT_COUNT);
  });

  it('인접은 대칭이고 자기 자신·중복이 없다', () => {
    ADJACENCY.forEach((ns, a) => {
      expect(new Set(ns).size).toBe(ns.length);
      for (const b of ns) {
        expect(b).not.toBe(a);
        expect(ADJACENCY[b]).toContain(a);
      }
    });
  });

  it('무방향 32변 — 링 8변 × 3 + 스포크 2변 × 4', () => {
    const degrees = ADJACENCY.reduce((sum, ns) => sum + ns.length, 0);
    expect(degrees / 2).toBe(32);
  });

  it('차수 분포: 모서리 12칸 2 · 바깥/안쪽 중점 8칸 3 · 중간링 중점 4칸 4', () => {
    const byDegree = new Map<number, number>();
    for (const ns of ADJACENCY) byDegree.set(ns.length, (byDegree.get(ns.length) ?? 0) + 1);
    expect(byDegree.get(2)).toBe(12);
    expect(byDegree.get(3)).toBe(8);
    expect(byDegree.get(4)).toBe(4);
    // 차수 4 는 중간 링의 변 중점 — 스포크가 양쪽으로 뻗는 유일한 자리.
    const deg4 = ADJACENCY.map((ns, i) => [i, ns.length] as const)
      .filter(([, d]) => d === 4)
      .map(([i]) => i);
    expect(deg4).toEqual([4, 10, 13, 19]);
  });

  it('밀 16줄 — 가로 8 + 세로 8, 모든 지점이 정확히 2개의 밀에 속한다', () => {
    expect(MILLS).toHaveLength(16);
    expect(new Set(MILLS.map((m) => m.join(',')))).toHaveProperty('size', 16);
    for (let p = 0; p < POINT_COUNT; p++) expect(MILLS_BY_POINT[p]).toHaveLength(2);
  });

  it('각 밀은 실제로 이어진 직선이다(연속한 두 점이 인접)', () => {
    for (const [a, b, c] of MILLS) {
      expect(isAdjacent(a, b)).toBe(true);
      expect(isAdjacent(b, c)).toBe(true);
      // 양 끝은 직접 이어지지 않는다(가운데를 지나가는 3목).
      expect(isAdjacent(a, c)).toBe(false);
    }
  });

  it('isAdjacent 는 ADJACENCY 와 완전히 일치한다', () => {
    for (let a = 0; a < POINT_COUNT; a++) {
      for (let b = 0; b < POINT_COUNT; b++) {
        expect(isAdjacent(a, b)).toBe(ADJACENCY[a].includes(b));
      }
    }
  });
});
