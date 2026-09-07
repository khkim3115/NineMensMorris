// 룰 단일 진실원본. core·engine·ui·서버(plpgsql 포팅)가 모두 이 값을 기준으로 한다.
// v1 은 표준 룰 고정 — 값을 바꾸면 AI 평가 가중치와 서버 검증도 함께 손봐야 한다.

export interface RuleConfig {
  /** 플레이어당 말 개수(표준 9). */
  piecesPerPlayer: number;
  /** 이 개수 이하로 남으면 인접 제한 없이 아무 빈칸으로 날아갈 수 있다(플라잉). */
  flyingThreshold: number;
  /** 배치가 끝난 뒤 이 개수 미만이 되면 패배(표준: 3 미만 = 2개). */
  minPieces: number;
  /** 같은 국면이 이 횟수만큼 반복되면 무승부. */
  repetitionLimit: number;
  /** 이동 페이즈에서 말 제거 없이 이만큼 수가 지나면 무승부. */
  staleMoveLimit: number;
}

export const DEFAULT_RULES: RuleConfig = {
  piecesPerPlayer: 9,
  flyingThreshold: 3,
  minPieces: 3,
  repetitionLimit: 3,
  staleMoveLimit: 50,
};
