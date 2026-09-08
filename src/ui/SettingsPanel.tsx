// 솔로 설정 — 난이도와 선공. 바꾼 설정은 다음 판부터 적용되며, 바로 시작할 수도 있다.
import { useEffect } from 'react';
import { DIFFICULTIES, DIFFICULTY_DESC, DIFFICULTY_LABEL } from '../engine/ai';
import type { Difficulty } from '../engine/ai';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { SIDE_LABEL } from '../core/view';
import { SeatPicker } from './SeatPicker';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const difficulty = useGameStore((s) => s.difficulty);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const newGame = useGameStore((s) => s.newGame);
  const inProgress = useGameStore((s) => s.state.ply > 0 && s.state.phase !== 'over');
  const setScreen = useAppStore((s) => s.setScreen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startFresh = () => {
    newGame();
    setScreen('solo');
    onClose();
  };

  return (
    <div className="settings" onClick={onClose}>
      <div
        className="settings-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="설정"
      >
        <div className="settings-top">
          <h3>⚙️ 설정</h3>
          <button className="pn-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <section className="set-section">
          <h4>AI 난이도</h4>
          <div className="diff-list">
            {DIFFICULTIES.map((d: Difficulty) => (
              <button
                key={d}
                className={`diff-row${d === difficulty ? ' on' : ''}`}
                onClick={() => setDifficulty(d)}
                aria-pressed={d === difficulty}
              >
                <span className="diff-name">{DIFFICULTY_LABEL[d]}</span>
                <span className="diff-desc">{DIFFICULTY_DESC[d]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="set-section">
          <h4>내 색 / 선공</h4>
          <SeatPicker />
          {inProgress ? (
            <p className="set-note">
              {'이번 판은 '}
              <b>{SIDE_LABEL[humanSeat]}</b>
              {'으로 두는 중 — 바꾼 색은 다음 판부터 적용됩니다.'}
            </p>
          ) : (
            <p className="set-note">흑이 언제나 선공입니다. 랜덤은 새 판을 시작할 때마다 다시 뽑아요.</p>
          )}
        </section>

        <div className="settings-foot">
          <button className="btn-primary" onClick={startFresh}>
            이 설정으로 새 게임
          </button>
          <button className="pn-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
