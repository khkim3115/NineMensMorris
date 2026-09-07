// 규칙·조작 도움말. 처음 방문하면 한 번 자동으로 열린다(생소한 규칙의 게임이라 필요).
import { useEffect } from 'react';
import { DEFAULT_RULES } from '../core/rules';
import { activeCommunityLinks } from '../data/links';

export function HelpPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const links = activeCommunityLinks();

  return (
    <div className="help" onClick={onClose}>
      <div
        className="help-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="도움말"
      >
        <div className="help-top">
          <h3>❓ 나인 멘스 모리스 규칙</h3>
          <button className="pn-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="help-body">
          <p className="help-lead">
            두 사람이 말 {DEFAULT_RULES.piecesPerPlayer}개씩 나눠 갖고, 선으로 이어진 24개 지점 위에서
            <b> 가로·세로 3목(밀)</b>을 만들어 상대 말을 하나씩 떼어내는 게임입니다.
          </p>

          <h4>진행 순서</h4>
          <ol className="help-steps">
            <li>
              <b>배치</b> — 번갈아 빈 지점에 말을 하나씩 놓습니다(각 {DEFAULT_RULES.piecesPerPlayer}개).
            </li>
            <li>
              <b>이동</b> — 다 놓았으면 <b>선으로 이어진 인접한 빈 지점</b>으로만 옮깁니다.
            </li>
            <li>
              <b>플라잉</b> — 내 말이 {DEFAULT_RULES.flyingThreshold}개만 남으면 인접 제한 없이
              <b> 아무 빈 지점</b>으로 날아갈 수 있습니다.
            </li>
          </ol>

          <h4>밀(3목)과 말 떼어내기</h4>
          <ul className="help-list">
            <li>한 줄에 내 말 3개를 모으면 <b>밀</b>이 되고, 곧바로 <b>상대 말 1개를 떼어냅니다.</b></li>
            <li>
              단 <b>밀에 속한 상대 말은 뗄 수 없습니다.</b> 상대 말이 전부 밀에 들어가 있을 때만 예외로
              아무거나 뗄 수 있어요.
            </li>
            <li>밀을 풀었다가 다시 만들면 <b>또 뗄 수 있습니다.</b> 두 줄을 동시에 완성해도 떼는 건 1개입니다.</li>
          </ul>

          <h4>승패</h4>
          <ul className="help-list">
            <li>상대 말이 <b>2개</b>로 줄면 승리.</li>
            <li>상대가 <b>움직일 수 없게</b> 되면 승리.</li>
            <li>
              같은 국면이 {DEFAULT_RULES.repetitionLimit}번 반복되거나, 말을 하나도 못 뗀 채
              {' '}{DEFAULT_RULES.staleMoveLimit}수가 지나면 <b>무승부</b>.
            </li>
          </ul>

          <h4>조작</h4>
          <ul className="help-list">
            <li><b>배치</b>: 빈 지점을 누르면 놓입니다.</li>
            <li><b>이동</b>: 내 말을 누르면 갈 수 있는 곳이 표시돼요. 목적지를 누르면 이동합니다(다시 누르면 선택 해제).</li>
            <li><b>떼기</b>: 밀을 만들면 뗄 수 있는 상대 말이 표시됩니다. 하나를 누르세요.</li>
            <li><b>💡 힌트</b>: 지금 국면의 최선수를 보드 위에 보여줍니다.</li>
            <li><b>↩ 되돌리기</b>: 내 마지막 차례로 되감습니다(AI 수까지 함께).</li>
          </ul>

          {links.length > 0 && (
            <>
              <h4>커뮤니티</h4>
              <ul className="help-list">
                {links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer noopener">
                      {l.emoji} {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="help-foot">
          <button className="btn-primary" onClick={onClose} autoFocus>
            알겠어요
          </button>
        </div>
      </div>
    </div>
  );
}
