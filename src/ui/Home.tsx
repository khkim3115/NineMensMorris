// 시작 화면 — 모드 선택(혼자 하기 / 온라인 대전) + 앱 받기.
import { DIFFICULTIES, DIFFICULTY_DESC, DIFFICULTY_LABEL } from '../engine/ai';
import type { Difficulty } from '../engine/ai';
import type { Player } from '../core/gameState';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { DownloadCards } from './DownloadCards';
import { Header } from './Header';

export function Home() {
  const setScreen = useAppStore((s) => s.setScreen);
  const difficulty = useGameStore((s) => s.difficulty);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const setHumanSeat = useGameStore((s) => s.setHumanSeat);
  const newGame = useGameStore((s) => s.newGame);

  const startSolo = () => {
    newGame({ difficulty, humanSeat });
    setScreen('solo');
  };

  return (
    <div className="page home">
      <Header title="⚫ 나인 멘스 모리스" subtitle="Nine Men's Morris" />

      <p className="home-lead">
        말 9개를 놓고 옮겨 <b>가로·세로 3목(밀)</b>을 만들면 상대 말을 하나씩 떼어냅니다.
        상대를 2개로 줄이거나 꼼짝 못 하게 만들면 승리.
      </p>

      <section className="home-card">
        <h2>🤖 혼자 하기</h2>
        <p className="home-card-sub">난이도를 고르고 AI 와 한 판.</p>
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
        <div className="seg">
          {([1, 2] as Player[]).map((p) => (
            <button
              key={p}
              className={`seg-btn${humanSeat === p ? ' on' : ''}`}
              onClick={() => setHumanSeat(p)}
              aria-pressed={humanSeat === p}
            >
              <span className={`side-dot side-${p}`} aria-hidden="true" />
              {p === 1 ? '흑 (선공)' : '백 (후공)'}
            </button>
          ))}
        </div>
        <button className="btn-primary btn-big" onClick={startSolo}>
          게임 시작
        </button>
      </section>

      <section className="home-card">
        <h2>🌐 온라인 대전</h2>
        <p className="home-card-sub">방을 만들고 초대코드를 알려주면 친구와 1:1 로 둘 수 있어요.</p>
        <button
          className="btn-primary btn-big"
          onClick={() => setScreen('lobby')}
          disabled={!isSupabaseConfigured}
        >
          방 만들기 / 참가
        </button>
        {!isSupabaseConfigured && (
          <p className="home-note">
            이 빌드에는 멀티플레이 서버 설정이 없습니다. 혼자 하기는 그대로 즐길 수 있어요.
          </p>
        )}
      </section>

      <DownloadCards />
    </div>
  );
}
