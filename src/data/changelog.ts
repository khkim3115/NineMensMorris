// 패치노트(체인지로그)의 단일 진실원본. 순수 데이터 모듈 — React/DOM 의존 없음.
// 새 버전을 낼 때 CHANGELOG 맨 위(index 0)에 항목을 추가하면 LATEST_VERSION 이 자동 갱신되고
// 헤더 NEW 배지·자동 노출이 동작한다. (package.json 버전과는 분리 — 여기가 사용자에게 보이는 버전.)

/** 변경 종류. 칩 색/아이콘/라벨의 키. 순서가 곧 상세 화면의 그룹 표시 순서. */
export const CHANGE_TYPES = ['feature', 'improvement', 'fix'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** 종류별 표시 메타(라벨·이모지). 색은 index.css 의 .pn-chip-{type} 가 담당. */
export const CHANGE_TYPE_META: Record<ChangeType, { ko: string; emoji: string }> = {
  feature: { ko: '새 기능', emoji: '✨' },
  improvement: { ko: '개선', emoji: '🔧' },
  fix: { ko: '버그 수정', emoji: '🐛' },
};

export interface ChangeItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntry {
  /** 사용자에게 보이는 버전(단일 진실원본). 'seen' 추적 키로도 쓰임. */
  version: string;
  /** 배포일 ISO 'YYYY-MM-DD'. */
  date: string;
  /** 목록에 노출되는 한 줄 요약. */
  title: string;
  changes: ChangeItem[];
}

/** 최신이 [0]. 날짜 내림차순 유지(테스트로 강제). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.0',
    date: '2026-09-08',
    title: '선후공을 고를 수 있어요 — 흑·백·랜덤',
    changes: [
      {
        type: 'feature',
        text: '⚫⚪ 혼자 하기에서 내 색을 고를 수 있어요 — 흑(내가 먼저) · 백(AI 가 먼저) · 랜덤(판마다 추첨). 흑이 언제나 선공입니다.',
      },
      {
        type: 'feature',
        text: '🎲 랜덤을 고르면 새 판을 시작할 때마다 색을 다시 뽑습니다. 지금 내 색은 차례 배너와 결과 화면에서 확인할 수 있어요.',
      },
      {
        type: 'feature',
        text: '🖥 트레이 앱에서도 선후공을 고를 수 있습니다. 제목 줄의 색 칩을 누르거나 S 키로 흑 → 백 → 랜덤을 넘기세요.',
      },
      {
        type: 'fix',
        text: '🐛 대국 도중 설정에서 내 색을 바꾸면 판이 멈추던 문제를 고쳤습니다. 이제 바꾼 색은 안내대로 다음 판부터 적용됩니다.',
      },
      {
        type: 'fix',
        text: '🐛 더 되돌릴 수 없는데도 되돌리기 버튼이 눌리는 것처럼 보이던 문제를 고쳤습니다.',
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-07',
    title: '첫 공개 — 난이도별 AI 대결 + 온라인 멀티플레이',
    changes: [
      {
        type: 'feature',
        text: '⚫ 나인 멘스 모리스를 웹에서 바로 즐길 수 있어요. 말 9개를 놓고, 옮기고, 3개가 남으면 날아다니는 표준 규칙 그대로입니다.',
      },
      {
        type: 'feature',
        text: '🤖 난이도를 골라 AI 와 둘 수 있어요 — 쉬움(자주 실수) · 보통(네 수 앞까지) · 어려움(이중 위협과 봉쇄까지 계산).',
      },
      {
        type: 'feature',
        text: '💡 막히면 힌트 버튼을 눌러 보세요. 지금 국면에서 가장 좋은 수를 보드 위에 표시해 줍니다.',
      },
      {
        type: 'feature',
        text: '🌐 방을 만들고 초대코드를 알려주면 친구와 1:1 온라인 대전을 할 수 있어요. 방 안에서 채팅도 됩니다.',
      },
      {
        type: 'feature',
        text: '⬇ 앱으로 설치하면 작업표시줄에서 바로 실행되고, 혼자 하기는 인터넷 없이도 됩니다.',
      },
    ],
  },
];

/** 가장 최신 버전 문자열. NEW 배지·자동 노출의 기준값. */
export const LATEST_VERSION = CHANGELOG[0].version;

/**
 * seenVersion(마지막으로 확인한 버전) 기준 '아직 못 본' 최신 항목 개수.
 * 목록 상단부터 이 개수만큼 NEW 로 표시한다.
 * - 확인 버전을 목록에서 찾으면: 그 위(더 최신)에 있는 항목 수.
 * - 못 찾으면(최초 방문 '' 또는 알 수 없는 버전): 최신 1개만 — 전부 NEW 는 과하므로.
 */
export function unseenCount(seenVersion: string): number {
  const idx = CHANGELOG.findIndex((e) => e.version === seenVersion);
  return idx >= 0 ? idx : 1;
}

const MS_PER_DAY = 86_400_000;

function isoToUtcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/**
 * 'YYYY-MM-DD' 를 한국어 상대 시간으로. UTC 기준 일수 차이로 계산해 TZ 에 무관하게 결정적.
 * (테스트 위해 now 주입 가능; 런타임에선 Date.now() 기본값.)
 */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const days = Math.floor(nowMs / MS_PER_DAY) - isoToUtcDay(iso);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
