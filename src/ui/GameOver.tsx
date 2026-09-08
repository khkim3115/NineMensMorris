// 솔로 결과 화면. 승패 이유까지 한국어로 풀어 준다(왜 끝났는지 모르면 배울 수 없으니).
import { DIFFICULTY_LABEL } from '../engine/ai';
import type { Difficulty } from '../engine/ai';
import type { GameResult, Player } from '../core/gameState';
import { SIDE_LABEL } from '../core/view';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';

export const WIN_REASON: Record<'pieces' | 'blocked' | 'resign' | 'timeout', string> = {
  pieces: '말이 2개로 줄었습니다',
  blocked: '움직일 수 있는 말이 없습니다',
  resign: '기권했습니다',
  timeout: '시간 안에 두지 않았습니다',
};

export const DRAW_REASON: Record<'repetition' | 'stale', string> = {
  repetition: '같은 국면이 세 번 반복됐습니다',
  stale: '오랫동안 말을 하나도 떼지 못했습니다',
};

export function resultText(result: GameResult, me: Player): { title: string; detail: string } {
  if (result.kind === 'draw') {
    return { title: '무승부', detail: DRAW_REASON[result.reason] };
  }
  const won = result.winner === me;
  const loser = won ? '상대' : '내';
  return {
    title: won ? '승리!' : '패배',
    detail: `${loser} ${WIN_REASON[result.reason]}`,
  };
}

export function GameOver() {
  const result = useGameStore((s) => s.state.result);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const difficulty = useGameStore((s) => s.difficulty) as Difficulty;
  const hintUsed = useGameStore((s) => s.hintUsedThisGame);
  const ply = useGameStore((s) => s.state.ply);
  const newGame = useGameStore((s) => s.newGame);
  const setScreen = useAppStore((s) => s.setScreen);

  if (!result) return null;
  const { title, detail } = resultText(result, humanSeat);
  const tone = result.kind === 'draw' ? 'draw' : result.winner === humanSeat ? 'win' : 'lose';

  return (
    <div className="over">
      <div className="over-card" role="dialog" aria-modal="true" aria-label="게임 결과">
        <div className={`over-title over-${tone}`}>{title}</div>
        <p className="over-detail">{detail}</p>
        <div className="over-meta">
          <span className="chip">난이도 {DIFFICULTY_LABEL[difficulty]}</span>
          <span className="chip">내 색 {SIDE_LABEL[humanSeat]}</span>
          <span className="chip">{ply}수</span>
          {hintUsed && <span className="chip">💡 힌트 사용</span>}
        </div>
        <div className="over-actions">
          <button className="btn-primary" onClick={() => newGame()} autoFocus>
            다시 하기
          </button>
          <button className="btn-ghost" onClick={() => setScreen('home')}>
            메뉴로
          </button>
        </div>
      </div>
    </div>
  );
}
