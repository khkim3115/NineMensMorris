// 차례·페이즈·지금 할 일을 한 줄로. 솔로와 멀티가 같은 문구를 쓴다.
import type { GameState, Player } from '../core/gameState';
import { phaseLabel, turnHint } from '../core/view';

interface TurnBannerProps {
  state: GameState;
  me: Player | null;
  /** 두 진영 이름(솔로는 '나'/'AI', 멀티는 닉네임). */
  names: Record<Player, string>;
  /** AI·상대를 기다리는 중이면 표시. */
  waiting?: boolean;
}

export function TurnBanner({ state, me, names, waiting }: TurnBannerProps) {
  const s = state;
  return (
    <div className="turnbar">
      <div className="turnbar-main">
        <span className={`side-dot side-${s.turn}`} aria-hidden="true" />
        <strong>{s.phase === 'over' ? '게임 종료' : `${names[s.turn]} 차례`}</strong>
        <span className="turnbar-hint">{waiting ? '생각 중…' : turnHint(s, me)}</span>
      </div>
      <div className="turnbar-counts">
        <span className="chip">{phaseLabel(s)}</span>
        {([1, 2] as Player[]).map((p) => (
          <span key={p} className={`count count-${p}`} title={`${names[p]} — 손패 / 보드`}>
            <span className={`side-dot side-${p}`} aria-hidden="true" />
            {s.hand[p - 1] > 0 && <span className="count-hand">손 {s.hand[p - 1]}</span>}
            <span className="count-board">판 {s.onBoard[p - 1]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
