// 온라인 대전 결과. 문구는 솔로 결과(GameOver)의 사전을 그대로 쓴다.
import type { GameState, Player } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { resultText } from './GameOver';

export function MpGameOver({ state, myColor }: { state: GameState; myColor: Player }) {
  const setScreen = useAppStore((s) => s.setScreen);
  const leave = useMultiplayerStore((s) => s.leave);
  const moveCount = useMultiplayerStore((s) => s.room?.moveCount ?? 0);

  if (!state.result) return null;
  const { title, detail } = resultText(state.result, myColor);
  const tone =
    state.result.kind === 'draw' ? 'draw' : state.result.winner === myColor ? 'win' : 'lose';

  return (
    <div className="over">
      <div className="over-card" role="dialog" aria-modal="true" aria-label="대전 결과">
        <div className={`over-title over-${tone}`}>{title}</div>
        <p className="over-detail">{detail}</p>
        <div className="over-meta">
          <span className="chip">{moveCount}수</span>
        </div>
        <div className="over-actions">
          <button
            className="btn-primary"
            autoFocus
            onClick={() => {
              void leave();
              setScreen('lobby');
            }}
          >
            로비로
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              void leave();
              setScreen('home');
            }}
          >
            메뉴로
          </button>
        </div>
      </div>
    </div>
  );
}
