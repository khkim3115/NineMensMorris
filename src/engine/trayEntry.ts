// 트레이 앱(desktop/popup.html)이 쓰는 자립형 번들의 진입점.
//
// `npm run build:tray-engine` 이 이 파일을 IIFE 한 개(window.NMM)로 묶어
// desktop/vendor/nmm-engine.js 로 내보낸다. 트레이 앱은 규칙·AI 를 재구현하지 않고
// 웹과 완전히 같은 코드를 쓴다 — src/core·src/engine 을 고치면 이 번들을 다시 만들어 커밋할 것.

export {
  ADJACENCY,
  MILLS,
  MILLS_BY_POINT,
  POINT_COUNT,
  POINT_LABEL,
  POINT_XY,
  isAdjacent,
} from '../core/board';
export { DEFAULT_RULES } from '../core/rules';
export {
  applyMove,
  applyResign,
  canFly,
  cloneState,
  createInitialState,
  formsMill,
  fromTransfer,
  isInMill,
  isLegal,
  legalMoves,
  legalRemovals,
  moveKey,
  other,
  sameMove,
  stateFromSnapshot,
  toSnapshot,
  toTransfer,
} from '../core/gameState';
export type {
  GameResult,
  GameState,
  Move,
  Phase,
  Player,
  Snapshot,
} from '../core/gameState';
export {
  SEAT_PREF_DESC,
  SEAT_PREF_LABEL,
  SEAT_PREFS,
  SIDE_LABEL,
  boardView,
  phaseLabel,
  resolveClick,
  resolveSeat,
  toSeatPref,
  turnHint,
} from '../core/view';
export type { BoardView, ClickResult, SeatPref } from '../core/view';
export {
  DIFFICULTIES,
  DIFFICULTY_DESC,
  DIFFICULTY_LABEL,
  PRESETS,
  bestMove,
  chooseMove,
} from './ai';
export type { Difficulty } from './ai';
