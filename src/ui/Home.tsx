// 시작 화면 — 모드 선택(혼자 하기 / 온라인 대전) + 앱 받기.
import { DIFFICULTIES, DIFFICULTY_DESC, DIFFICULTY_LABEL } from '../engine/ai';
import type { Difficulty } from '../engine/ai';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { DownloadCards } from './DownloadCards';
import { Header } from './Header';
import { SeatPicker } from './SeatPicker';

export function Home() {
  const setScreen = useAppStore((s) => s.setScreen);
  const difficulty = useGameStore((s) => s.difficulty);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const seatPref = useGameStore((s) => s.seatPref);
  const newGame = useGameStore((s) => s.newGame);

  // newGame 을 먼저 부르는 순서는 의도적이다 — 세대를 올리고 thinking 을 세운 뒤
  // 솔로 화면이 그려져야, 내가 백일 때 첫 프레임부터 보드가 잠겨 보인다.
  const startSolo = () => {
    newGame({ difficulty, seatPref });
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
        <SeatPicker />
        <p className="home-note">흑이 언제나 선공입니다. 랜덤은 새 판을 시작할 때마다 다시 뽑아요.</p>
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
