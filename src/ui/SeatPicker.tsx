// 선후공 선택(흑·백·랜덤). 홈과 설정이 같은 것을 쓴다 — 두 벌이면 반드시 갈라진다.
import { SEAT_PREFS, SEAT_PREF_DESC, SEAT_PREF_LABEL, type SeatPref } from '../core/view';
import { useGameStore } from '../store/gameStore';

export function SeatPicker() {
  const seatPref = useGameStore((s) => s.seatPref);
  const setSeatPref = useGameStore((s) => s.setSeatPref);

  return (
    <div className="seg seg-seat">
      {SEAT_PREFS.map((p: SeatPref) => (
        <button
          key={p}
          className={`seg-btn${seatPref === p ? ' on' : ''}`}
          onClick={() => setSeatPref(p)}
          aria-pressed={seatPref === p}
          title={`${SEAT_PREF_LABEL[p]} — ${SEAT_PREF_DESC[p]}`}
        >
          <span className={`side-dot side-${p}`} aria-hidden="true" />
          {SEAT_PREF_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
