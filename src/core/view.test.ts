// 선후공 선택의 계약. 웹 스토어와 트레이 렌더러가 같은 리졸버를 쓰므로 여기서 한 번만 지킨다.
import { describe, expect, it } from 'vitest';
import { SEAT_PREFS, SEAT_PREF_LABEL, resolveSeat, toSeatPref, type SeatPref } from './view';

describe('toSeatPref', () => {
  it('예전에 쓰던 저장값 1·2 를 그대로 받아들인다', () => {
    expect(toSeatPref('1')).toBe('1');
    expect(toSeatPref('2')).toBe('2');
  });

  it('random 을 받아들인다', () => {
    expect(toSeatPref('random')).toBe('random');
  });

  it('빈 값·모르는 값은 흑으로 떨어진다', () => {
    expect(toSeatPref(null)).toBe('1');
    expect(toSeatPref(undefined)).toBe('1');
    expect(toSeatPref('')).toBe('1');
    expect(toSeatPref('3')).toBe('1');
    expect(toSeatPref('white')).toBe('1');
  });

  it('SEAT_PREFS 의 모든 값이 왕복한다', () => {
    for (const p of SEAT_PREFS) expect(toSeatPref(p)).toBe(p);
  });
});

describe('resolveSeat', () => {
  it('고정 선택은 난수와 무관하게 그 좌석이다', () => {
    for (const rand of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(resolveSeat('1', rand)).toBe(1);
      expect(resolveSeat('2', rand)).toBe(2);
    }
  });

  it('랜덤은 0.5 를 경계로 흑·백을 반씩 가른다', () => {
    expect(resolveSeat('random', 0)).toBe(1);
    expect(resolveSeat('random', 0.49)).toBe(1);
    expect(resolveSeat('random', 0.5)).toBe(2);
    expect(resolveSeat('random', 0.99)).toBe(2);
  });

  it('어떤 선택이든 결과는 언제나 좌석(1|2) 이다 — random 이 새어나오지 않는다', () => {
    for (const p of SEAT_PREFS) {
      for (const rand of [0, 0.5, 0.999]) {
        expect([1, 2]).toContain(resolveSeat(p, rand));
      }
    }
  });

  it('인자를 생략하면 Math.random 으로 뽑되 양쪽이 모두 나온다', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(resolveSeat('random'));
    expect(seen).toEqual(new Set([1, 2]));
  });
});

describe('선택 문구', () => {
  it('모든 선택에 라벨이 있다', () => {
    for (const p of SEAT_PREFS) expect(SEAT_PREF_LABEL[p]).toBeTruthy();
  });

  it('고정 선택의 라벨은 그 좌석의 색 이름과 같다', () => {
    // SIDE_LABEL 과 어긋나면 배너와 선택 화면이 다른 말을 하게 된다.
    expect(SEAT_PREF_LABEL['1' as SeatPref]).toBe('흑');
    expect(SEAT_PREF_LABEL['2' as SeatPref]).toBe('백');
  });
});
