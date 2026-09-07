// 솔로 게임 상태 + 설정(난이도·선공·테마). 엔진과 UI 사이의 유일한 접착제.
//
// AI 차례는 여기서 스스로 돈다: 사람이 두면 곧바로 runAi() 가 걸리고, AI 가 밀을 만들어
// 제거 ply 가 남으면 한 번 더 돈다. 새 게임·되돌리기·기권은 generation 을 올려
// 늦게 도착한 워커 응답을 버린다.

import { create } from 'zustand';
import {
  applyMove,
  applyResign,
  createInitialState,
  other,
  type GameState,
  type Move,
  type Player,
} from '../core/gameState';
import { resolveClick } from '../core/view';
import { cancelPendingAi, requestAiMove, requestHint } from '../engine/aiClient';
import type { Difficulty } from '../engine/ai';

export type Theme = 'dark' | 'light';

const DIFFICULTY_KEY = 'nmm_difficulty';
const SEAT_KEY = 'nmm_seat';
const THEME_KEY = 'nmm_theme';

/** AI 가 "생각하는 척" 최소한 이 정도는 끌어야 사람 눈에 자연스럽다. */
const MIN_THINK_MS = 260;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 불가(사생활 모드 등) — 이번 세션에만 적용.
  }
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

interface GameStore {
  state: GameState;
  /** 되돌리기용 이전 국면 스택(사람·AI 수 모두 쌓인다). */
  past: GameState[];
  difficulty: Difficulty;
  /** 사람이 잡는 색. 1P(흑)가 선공. */
  humanSeat: Player;
  theme: Theme;

  /** 이동 페이즈에서 고른 출발점. */
  selected: number | null;
  /** AI 가 계산 중. 이 동안 보드는 클릭을 무시한다. */
  thinking: boolean;
  /** 방금 둔 수(보드에 잔상 표시). */
  lastMove: Move | null;

  hint: Move | null;
  hintLoading: boolean;
  /** 이 판에서 힌트를 한 번이라도 썼는가(결과 화면 표기용). */
  hintUsedThisGame: boolean;

  helpOpen: boolean;
  settingsOpen: boolean;

  /** 늦게 온 AI 응답을 버리기 위한 세대 번호. */
  generation: number;

  newGame: (opts?: { difficulty?: Difficulty; humanSeat?: Player }) => void;
  clickPoint: (point: number) => void;
  undo: () => void;
  resign: () => void;
  askHint: () => void;
  setDifficulty: (d: Difficulty) => void;
  setHumanSeat: (p: Player) => void;
  toggleTheme: () => void;
  setHelpOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

const initialTheme = readStored<Theme>(THEME_KEY, ['dark', 'light'], 'dark');
applyTheme(initialTheme);

export const useGameStore = create<GameStore>((set, get) => {
  /** 한 수 적용 + 파생 상태 정리. AI 차례가 되면 이어서 돈다. */
  function commit(move: Move) {
    const { state, past } = get();
    const next = applyMove(state, move);
    set({
      state: next,
      past: [...past, state],
      selected: null,
      lastMove: move,
      hint: null,
    });
    void runAi();
  }

  /** AI 차례면 한 수 둔다. 밀을 만들어 제거가 남으면 자기 자신을 다시 부른다. */
  async function runAi(): Promise<void> {
    const { state, humanSeat, difficulty, generation } = get();
    if (state.phase === 'over' || state.turn === humanSeat) return;

    set({ thinking: true });
    const started = Date.now();
    const { move } = await requestAiMove(state, difficulty);
    const wait = MIN_THINK_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    // 그 사이 새 게임·되돌리기가 있었으면 이 결과는 버린다.
    if (get().generation !== generation) return;
    if (!move) {
      set({ thinking: false });
      return;
    }
    const cur = get().state;
    const next = applyMove(cur, move);
    set({ state: next, past: [...get().past, cur], lastMove: move, thinking: false });
    if (next.turn !== humanSeat && next.phase !== 'over') void runAi();
  }

  function startGame(difficulty: Difficulty, humanSeat: Player) {
    cancelPendingAi();
    set((s) => ({
      state: createInitialState(),
      past: [],
      difficulty,
      humanSeat,
      selected: null,
      thinking: false,
      lastMove: null,
      hint: null,
      hintLoading: false,
      hintUsedThisGame: false,
      generation: s.generation + 1,
    }));
    // 사람이 후공이면 AI 가 먼저 둔다.
    if (humanSeat !== 1) void runAi();
  }

  return {
    state: createInitialState(),
    past: [],
    difficulty: readStored<Difficulty>(DIFFICULTY_KEY, ['easy', 'normal', 'hard'], 'normal'),
    humanSeat: readStored(SEAT_KEY, ['1', '2'], '1') === '2' ? 2 : 1,
    theme: initialTheme,

    selected: null,
    thinking: false,
    lastMove: null,
    hint: null,
    hintLoading: false,
    hintUsedThisGame: false,
    helpOpen: false,
    settingsOpen: false,
    generation: 0,

    newGame: (opts) => {
      const difficulty = opts?.difficulty ?? get().difficulty;
      const humanSeat = opts?.humanSeat ?? get().humanSeat;
      startGame(difficulty, humanSeat);
    },

    clickPoint: (point) => {
      const { state, humanSeat, selected, thinking } = get();
      if (thinking) return;
      const r = resolveClick(state, humanSeat, selected, point);
      if (!r) return;
      if (r.kind === 'select') {
        set({ selected: r.point });
        return;
      }
      commit(r.move);
    },

    undo: () => {
      const { past, humanSeat, generation } = get();
      const rest = [...past];
      let target: GameState | null = null;
      // 사람이 다시 둘 수 있는 지점(내 차례 시작)까지 되감는다.
      while (rest.length > 0) {
        const st = rest.pop()!;
        if (st.turn === humanSeat && !st.mustRemove && st.phase !== 'over') {
          target = st;
          break;
        }
      }
      if (!target) return;
      cancelPendingAi();
      set({
        state: target,
        past: rest,
        selected: null,
        thinking: false,
        lastMove: null,
        hint: null,
        hintLoading: false,
        generation: generation + 1,
      });
    },

    resign: () => {
      const { state, humanSeat, generation } = get();
      if (state.phase === 'over') return;
      cancelPendingAi();
      set({
        state: applyResign(state, humanSeat),
        thinking: false,
        selected: null,
        hint: null,
        generation: generation + 1,
      });
    },

    askHint: () => {
      const { state, humanSeat, thinking, hintLoading, generation } = get();
      if (thinking || hintLoading) return;
      if (state.phase === 'over' || state.turn !== humanSeat) return;
      set({ hintLoading: true, hintUsedThisGame: true });
      void requestHint(state).then(({ move }) => {
        if (get().generation !== generation) return;
        set({ hint: move, hintLoading: false });
      });
    },

    setDifficulty: (d) => {
      persist(DIFFICULTY_KEY, d);
      set({ difficulty: d });
    },

    setHumanSeat: (p) => {
      persist(SEAT_KEY, String(p));
      set({ humanSeat: p });
    },

    toggleTheme: () => {
      const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
      persist(THEME_KEY, theme);
      applyTheme(theme);
      set({ theme });
    },

    setHelpOpen: (helpOpen) => set({ helpOpen }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  };
});

/** 파생: 사람 차례이고 AI 를 기다리지 않는 상태인가. */
export function isHumanTurn(s: {
  state: GameState;
  humanSeat: Player;
  thinking: boolean;
}): boolean {
  return !s.thinking && s.state.phase !== 'over' && s.state.turn === s.humanSeat;
}

export const aiSeatOf = (humanSeat: Player): Player => other(humanSeat);
