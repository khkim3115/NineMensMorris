// 솔로 게임 화면 — 보드 + 차례 배너 + 조작 버튼 + 결과 오버레이.
import { useEffect } from 'react';
import { Board } from './Board';
import { GameOver } from './GameOver';
import { Header } from './Header';
import { TurnBanner } from './TurnBanner';
import { DIFFICULTY_LABEL } from '../engine/ai';
import { other, type Player } from '../core/gameState';
import { useGameStore } from '../store/gameStore';

export default function App() {
  const state = useGameStore((s) => s.state);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const difficulty = useGameStore((s) => s.difficulty);
  const selected = useGameStore((s) => s.selected);
  const thinking = useGameStore((s) => s.thinking);
  const lastMove = useGameStore((s) => s.lastMove);
  const hint = useGameStore((s) => s.hint);
  const hintLoading = useGameStore((s) => s.hintLoading);
  const canUndo = useGameStore((s) => s.past.length > 0);
  const clickPoint = useGameStore((s) => s.clickPoint);
  const undo = useGameStore((s) => s.undo);
  const askHint = useGameStore((s) => s.askHint);
  const resign = useGameStore((s) => s.resign);
  const newGame = useGameStore((s) => s.newGame);

  const over = state.phase === 'over';
  const myTurn = !over && !thinking && state.turn === humanSeat;
  const aiSeat: Player = other(humanSeat);
  const names: Record<Player, string> = {
    [humanSeat]: '나',
    [aiSeat]: `AI (${DIFFICULTY_LABEL[difficulty]})`,
  } as Record<Player, string>;

  // 단축키: H 힌트 · Z(또는 Backspace) 되돌리기 · N 새 게임.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === 'h' || e.key === 'H') askHint();
      else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') undo();
      else if (e.key === 'n' || e.key === 'N') newGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [askHint, undo, newGame]);

  return (
    <div className="page">
      <Header title="⚫ 나인 멘스 모리스" subtitle="혼자 하기" showHome showSettings autoHelp />

      <TurnBanner state={state} me={humanSeat} names={names} waiting={thinking} />

      <div className="board-wrap">
        <Board
          state={state}
          me={humanSeat}
          selected={selected}
          lastMove={lastMove}
          hint={hint}
          disabled={!myTurn}
          onPoint={clickPoint}
        />
      </div>

      <div className="controls">
        <button className="btn-ghost" onClick={askHint} disabled={!myTurn || hintLoading} title="힌트 (H)">
          {hintLoading ? '⏳ 계산 중' : '💡 힌트'}
        </button>
        <button className="btn-ghost" onClick={undo} disabled={!canUndo || thinking} title="되돌리기 (Z)">
          ↩ 되돌리기
        </button>
        <button className="btn-ghost" onClick={() => newGame()} title="새 게임 (N)">
          ↺ 새 게임
        </button>
        <button className="btn-ghost btn-danger" onClick={resign} disabled={over}>
          🏳 기권
        </button>
      </div>

      {over && <GameOver />}
    </div>
  );
}
