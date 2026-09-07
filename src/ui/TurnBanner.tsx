// 차례·페이즈·지금 할 일을 한 줄로. 솔로와 멀티가 같은 문구를 쓴다.
import { canFly, type GameState, type Player } from '../core/gameState';

export const SIDE_LABEL: Record<Player, string> = { 1: '흑', 2: '백' };

/** 지금 이 국면에서 둘 사람이 해야 할 일. me 가 null 이면 관전 시점의 서술. */
export function turnHint(s: GameState, me: Player | null): string {
  if (s.phase === 'over') return '게임이 끝났습니다.';
  const mine = me !== null && s.turn === me;
  const who = mine ? '' : `${SIDE_LABEL[s.turn]} 차례 — `;
  if (s.mustRemove) {
    return mine ? '밀 완성! 상대 말을 하나 떼어내세요.' : `${who}상대 말을 떼는 중`;
  }
  if (s.hand[s.turn - 1] > 0) {
    return mine ? '빈 지점에 말을 놓으세요.' : `${who}말을 놓는 중`;
  }
  if (canFly(s, s.turn)) {
    return mine ? '말이 3개 — 아무 빈 지점으로 날아갈 수 있어요.' : `${who}날아서 이동 중`;
  }
  return mine ? '옮길 말을 고른 뒤 이어진 빈 지점을 누르세요.' : `${who}말을 옮기는 중`;
}

/** 페이즈 이름(배치/이동/플라잉). */
export function phaseLabel(s: GameState): string {
  if (s.phase === 'over') return '종료';
  if (s.hand[0] > 0 || s.hand[1] > 0) return '배치';
  if (canFly(s, 1) || canFly(s, 2)) return '플라잉';
  return '이동';
}

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
