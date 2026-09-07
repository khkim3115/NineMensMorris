// 멀티플레이 채팅 — 순수 헬퍼(웹 스토어/데스크톱 포팅 공용 규약의 기준값).
// Realtime broadcast 페이로드는 웹(multiplayerStore.ts)·데스크톱(popup.html)이
// 반드시 동일하게 맞춰야 교차 호환된다: 채널 `room:<roomId>`, 이벤트 'chat',
// payload = { userId, displayName, text, ts }.

/** 한 메시지 최대 길이(전송 전 잘라냄). */
export const CHAT_MAX_LEN = 200;
/** 메모리에 유지할 최근 메시지 수(무한 증가 방지). */
export const CHAT_KEEP = 50;

/** broadcast payload = 채팅 메시지(웹·데스크톱 공통 형식). */
export interface ChatMessage {
  userId: string;
  displayName: string;
  text: string;
  /** Date.now() epoch ms. */
  ts: number;
}

/**
 * 전송 전 정리: 앞뒤 공백 제거 → 비어 있으면 null(전송 안 함) → CHAT_MAX_LEN 으로 절단.
 */
export function sanitizeChatText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, CHAT_MAX_LEN);
}

/**
 * 불변 추가: 새 배열을 반환하며 최근 cap 개만 유지한다.
 */
export function appendCapped<T>(list: readonly T[], item: T, cap = CHAT_KEEP): T[] {
  return [...list, item].slice(-cap);
}
