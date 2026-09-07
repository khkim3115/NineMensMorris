// 온라인 로비 — 방 만들기 / 코드로 참가 / 대기실. 게임이 시작되면 대전 화면으로 넘긴다.
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { rememberedName, useMultiplayerStore } from '../store/multiplayerStore';
import { ChatPanel } from './ChatPanel';
import { Header } from './Header';

export function Lobby() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const busy = useMultiplayerStore((s) => s.busy);
  const error = useMultiplayerStore((s) => s.error);
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const joinRoom = useMultiplayerStore((s) => s.joinRoom);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const leave = useMultiplayerStore((s) => s.leave);

  const [name, setName] = useState(rememberedName());
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // 방장이 시작하면 모두의 화면이 대전으로 전환된다.
  useEffect(() => {
    if (room?.status === 'playing') setScreen('mpgame');
  }, [room?.status, setScreen]);

  const isHost = !!room && players.some((p) => p.userId === myUserId && p.isHost);
  const canStart = isHost && players.length === 2;

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 코드는 화면에 그대로 보이니 그대로 둔다.
    }
  };

  return (
    <div className="page">
      <Header title="⚫ 나인 멘스 모리스" subtitle="온라인 대전" showHome />

      {!room ? (
        <section className="home-card">
          <h2>방 만들기 / 참가</h2>
          <label className="field">
            <span>닉네임</span>
            <input
              value={name}
              maxLength={24}
              placeholder="화면에 표시될 이름"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <button
            className="btn-primary btn-big"
            disabled={busy || name.trim().length === 0}
            onClick={() => void createRoom(name.trim())}
          >
            방 만들기
          </button>

          <div className="join-row">
            <input
              className="join-code"
              value={code}
              maxLength={6}
              placeholder="방 코드"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && code.trim()) {
                  void joinRoom(code.trim(), name.trim());
                }
              }}
            />
            <button
              className="btn-ghost"
              disabled={busy || name.trim().length === 0 || code.trim().length === 0}
              onClick={() => void joinRoom(code.trim(), name.trim())}
            >
              참가
            </button>
          </div>

          {error && <div className="mp-error">{error}</div>}
        </section>
      ) : (
        <section className="home-card">
          <h2>대기실</h2>
          <div className="code-row">
            <span className="code-label">방 코드</span>
            <b className="code-value">{room.code}</b>
            <button className="btn-ghost" onClick={() => void copyCode()}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="home-card-sub">이 코드를 친구에게 알려주면 같은 방으로 들어옵니다.</p>

          <ul className="player-list">
            {[0, 1].map((seat) => {
              const p = players.find((x) => x.seat === seat);
              return (
                <li key={seat} className={`player-row${p ? '' : ' empty'}`}>
                  {p ? (
                    <>
                      <span className="player-name">{p.displayName}</span>
                      {p.isHost && <span className="chip">방장</span>}
                      {p.userId === myUserId && <span className="chip">나</span>}
                      {!p.connected && <span className="chip">연결 끊김</span>}
                    </>
                  ) : (
                    <span className="player-waiting">상대를 기다리는 중…</span>
                  )}
                </li>
              );
            })}
          </ul>

          {isHost ? (
            <button className="btn-primary btn-big" disabled={!canStart} onClick={() => void startGame()}>
              {canStart ? '게임 시작' : '2명이 모여야 시작할 수 있어요'}
            </button>
          ) : (
            <p className="home-note">방장이 시작하기를 기다리는 중…</p>
          )}

          <button
            className="btn-ghost"
            onClick={() => {
              void leave();
            }}
          >
            방 나가기
          </button>

          {error && <div className="mp-error">{error}</div>}
        </section>
      )}

      {room && <ChatPanel />}
    </div>
  );
}
