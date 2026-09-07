import { useEffect, useRef, useState } from 'react';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { CHAT_MAX_LEN } from '../lib/chat';

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 방 채팅 — 떠 있는 토글 패널(로비·게임 공용). 데스크톱은 우하단, 모바일은 하단 시트. */
export function ChatPanel() {
  const messages = useMultiplayerStore((s) => s.messages);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const sendChat = useMultiplayerStore((s) => s.sendChat);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  // 패널이 열려 있는 동안 도착한 메시지는 읽음 처리.
  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);

  // 새 메시지가 오면 맨 아래로 스크롤(패널이 열려 있을 때만).
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length]);

  const unread = open ? 0 : Math.max(0, messages.length - seen);

  function submit() {
    sendChat(draft);
    setDraft('');
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="채팅 열기">
        <span aria-hidden>💬</span>
        {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="방 채팅">
      <div className="chat-head">
        <span className="chat-title">채팅</span>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="채팅 닫기">
          ✕
        </button>
      </div>

      <div className="chat-msgs">
        {messages.length === 0 ? (
          <div className="chat-empty">아직 메시지가 없어요. 먼저 인사를 건네보세요!</div>
        ) : (
          messages.map((m, i) => {
            const mine = m.userId === myUserId;
            return (
              <div key={`${m.ts}-${m.userId}-${i}`} className={`chat-msg${mine ? ' me' : ''}`}>
                <div className="chat-meta">
                  <span className="chat-name">{mine ? '나' : m.displayName}</span>
                  <span className="chat-time">{hhmm(m.ts)}</span>
                </div>
                <div className="chat-bubble">{m.text}</div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={draft}
          maxLength={CHAT_MAX_LEN}
          placeholder="메시지 입력…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="chat-send" onClick={submit} disabled={!draft.trim()}>
          전송
        </button>
      </div>
    </div>
  );
}
