// 온라인 대전 화면. 솔로와 같은 Board·TurnBanner 를 쓰고, 상태는 서버 스냅샷에서만 온다.
import { useEffect, useState } from 'react';
import { Board } from './Board';
import { ChatPanel } from './ChatPanel';
import { Header } from './Header';
import { MpGameOver } from './MpGameOver';
import { TurnBanner } from './TurnBanner';
import type { Player } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import {
  colorOfSeat,
  mpGameState,
  selectMe,
  selectOpponent,
  useMultiplayerStore,
} from '../store/multiplayerStore';

/** 상대가 이 시간 넘게 두지 않으면 승리를 주장할 수 있다(서버와 같은 값). */
const TIMEOUT_SECONDS = 120;

export function MultiplayerGame() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const selected = useMultiplayerStore((s) => s.selected);
  const error = useMultiplayerStore((s) => s.error);
  const me = useMultiplayerStore(selectMe);
  const opponent = useMultiplayerStore(selectOpponent);
  const playPoint = useMultiplayerStore((s) => s.playPoint);
  const resign = useMultiplayerStore((s) => s.resign);
  const claimTimeout = useMultiplayerStore((s) => s.claimTimeout);
  const leave = useMultiplayerStore((s) => s.leave);
  const clearError = useMultiplayerStore((s) => s.clearError);

  const [now, setNow] = useState(() => Date.now());

  // 시간초과 버튼 노출 판단에만 쓰는 저빈도 타이머.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // 방이 사라졌으면(정리·강제 종료) 로비로 돌려보낸다.
  useEffect(() => {
    if (!room) setScreen('lobby');
  }, [room, setScreen]);

  const state = mpGameState(room);
  if (!room || !state || !me) return null;

  const myColor = colorOfSeat(me.seat, room.blackSeat);
  const oppColor: Player = myColor === 1 ? 2 : 1;
  const names: Record<Player, string> = {
    [myColor]: `${me.displayName} (나)`,
    [oppColor]: opponent?.displayName ?? '상대',
  } as Record<Player, string>;

  const over = room.status === 'finished';
  const myTurn = !over && state.turn === myColor;
  const elapsed = room.turnStartedAt ? (now - Date.parse(room.turnStartedAt)) / 1000 : 0;
  const canClaimTimeout = !over && !myTurn && elapsed > TIMEOUT_SECONDS;

  return (
    <div className="page">
      <Header title="⚫ 나인 멘스 모리스" subtitle={`온라인 · ${room.code}`}>
        <button
          className="theme-btn"
          onClick={() => {
            void leave();
            setScreen('home');
          }}
          title="방 나가기"
        >
          나가기
        </button>
      </Header>

      <TurnBanner state={state} me={myColor} names={names} />

      <div className="board-wrap">
        <Board
          state={state}
          me={myColor}
          selected={selected}
          disabled={!myTurn}
          onPoint={(p) => void playPoint(p)}
        />
      </div>

      <div className="controls">
        {canClaimTimeout && (
          <button className="btn-ghost" onClick={() => void claimTimeout()}>
            ⏱ 시간초과 승리
          </button>
        )}
        <button className="btn-ghost btn-danger" onClick={() => void resign()} disabled={over}>
          🏳 기권
        </button>
      </div>

      {!opponent?.connected && !over && (
        <p className="home-note">상대의 연결이 끊겼습니다. 2분이 지나면 시간초과로 이길 수 있어요.</p>
      )}

      {error && (
        <div className="mp-error" onClick={clearError} role="button">
          {error}
        </div>
      )}

      <ChatPanel />
      {over && <MpGameOver state={state} myColor={myColor} />}
    </div>
  );
}
