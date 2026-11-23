import React, { useMemo, useState } from 'react';
import { ArrowLeft, RotateCcw, Lightbulb, Target, GraduationCap } from 'lucide-react';

type Piece = string;
type Board = Record<string, Piece>;
type Lesson = { id: string; title: string; description: string; fen: string; active: string; goal?: string; kind: 'diagram' | 'maze' };

const lessons: Lesson[] = [
  {
    id: 'rook',
    title: '01 · Movimiento de la torre',
    description: 'La torre se mueve por filas y columnas. Pulsa cualquier casilla a la que quieras llevarla. No necesitas reyes ni alternar turnos.',
    fen: '8/8/8/8/3R4/8/8/8',
    active: 'd4',
    kind: 'diagram',
  },
  {
    id: 'bishop',
    title: '02 · Alfil y obstáculos',
    description: 'El alfil avanza en diagonal, pero no puede saltar por encima de otras piezas. Prueba a atravesar un obstáculo.',
    fen: '8/8/5p2/8/3B4/2P5/8/8',
    active: 'd4',
    kind: 'diagram',
  },
  {
    id: 'maze',
    title: '03 · Laberinto de la torre',
    description: 'Ejercicio «Torre 0003» del temario EEDD. Lleva la torre blanca desde a1 hasta capturar la torre negra en h8. Los peones son obstáculos fijos.',
    fen: '7r/p2p2p1/2p2p2/8/1P4Pp/2P1P3/P7/R7',
    active: 'a1',
    goal: 'h8',
    kind: 'maze',
  },
];

const symbols: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
const alphabet = 'abcdefgh';
const squares = Array.from({ length: 64 }, (_, index) => alphabet[index % 8] + (8 - Math.floor(index / 8)));

function parseFenPlacement(fen: string): Board {
  const board: Board = {};
  fen.split(' ')[0].split('/').forEach((row, rowIndex) => {
    let file = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) file += Number(char);
      else {
        if (file < 8 && symbols[char]) board[alphabet[file] + (8 - rowIndex)] = char;
        file += 1;
      }
    }
  });
  return board;
}
const isWhite = (piece: string) => piece === piece.toUpperCase();
const pieceName = (piece: string) => ({ r: 'torre', b: 'alfil', q: 'dama', n: 'caballo', k: 'rey', p: 'peón' })[piece.toLowerCase()] || 'pieza';
const coords = (sq: string) => [alphabet.indexOf(sq[0]), Number(sq[1]) - 1] as const;

function checkMove(board: Board, from: string, to: string): { ok: boolean; explanation: string } {
  const piece = board[from];
  if (!piece) return { ok: false, explanation: 'Selecciona primero la pieza que quieres mover.' };
  if (from === to) return { ok: false, explanation: 'Selecciona una casilla de destino diferente.' };
  const target = board[to];
  if (target && isWhite(target) === isWhite(piece)) {
    return { ok: false, explanation: 'No puedes ocupar una casilla que ya tiene una pieza del mismo color.' };
  }
  const [x1, y1] = coords(from), [x2, y2] = coords(to);
  const dx = x2 - x1, dy = y2 - y1;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const type = piece.toLowerCase();
  let validShape = false;
  let reason = '';
  if (type === 'r') {
    validShape = dx === 0 || dy === 0;
    reason = 'La torre se mueve en línea recta por filas o columnas, nunca en diagonal.';
  } else if (type === 'b') {
    validShape = ax === ay;
    reason = 'El alfil se mueve únicamente por las diagonales.';
  } else if (type === 'q') {
    validShape = dx === 0 || dy === 0 || ax === ay;
    reason = 'La dama se mueve por filas, columnas o diagonales.';
  } else if (type === 'n') {
    validShape = (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    reason = 'El caballo se mueve en forma de L: dos casillas y una perpendicular.';
  } else if (type === 'k') {
    validShape = Math.max(ax, ay) === 1;
    reason = 'El rey solo puede desplazarse una casilla en cualquier dirección.';
  } else if (type === 'p') {
    const forward = isWhite(piece) ? 1 : -1;
    const startRank = isWhite(piece) ? 1 : 6;
    validShape = target
      ? ax === 1 && dy === forward
      : dx === 0 && (dy === forward || (y1 === startRank && dy === forward * 2));
    reason = 'El peón avanza de frente y captura en diagonal. No puede avanzar si tiene una pieza delante.';
  }
  if (!validShape) return { ok: false, explanation: reason };
  if (type !== 'n') {
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const steps = Math.max(ax, ay);
    for (let i = 1; i < steps; i += 1) {
      const intermediary = alphabet[x1 + stepX * i] + (y1 + stepY * i + 1);
      if (board[intermediary]) {
        return { ok: false, explanation: 'Hay una pieza en el camino. La ' + pieceName(piece) + ' no puede saltar por encima de ella.' };
      }
    }
    if (type === 'p' && target && dx === 0) return { ok: false, explanation: 'Un peón no puede capturar una pieza avanzando recto.' };
    if (type === 'p' && !target && dx !== 0) return { ok: false, explanation: 'Para capturar en diagonal, debe haber una pieza rival en el destino.' };
  }
  return { ok: true, explanation: '' };
}

export default function DidacticBoard({ onExit }: { onExit: () => void }) {
  const [lessonId, setLessonId] = useState('rook');
  const lesson = lessons.find((item) => item.id === lessonId) || lessons[0];
  const [board, setBoard] = useState<Board>(() => parseFenPlacement(lessons[0].fen));
  const [active, setActive] = useState(lessons[0].active);
  const [numberOfMoves, setNumberOfMoves] = useState(0);
  const [feedback, setFeedback] = useState('Pulsa una casilla para mover la pieza protagonista.');
  const [feedbackKind, setFeedbackKind] = useState<'neutral' | 'error' | 'success'>('neutral');
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const movableSquares = useMemo(() => squares.filter((sq) => {
    if (lesson.kind === 'maze' && board[sq] && sq !== lesson.goal) return false;
    return checkMove(board, active, sq).ok;
  }), [active, board, lesson.goal, lesson.kind]);

  const switchLesson = (id: string) => {
    const selected = lessons.find((item) => item.id === id) || lessons[0];
    setLessonId(selected.id);
    setBoard(parseFenPlacement(selected.fen));
    setActive(selected.active);
    setNumberOfMoves(0);
    setTrail([]);
    setHint(false);
    setDone(false);
    setFeedbackKind('neutral');
    setFeedback('Pulsa una casilla para mover la pieza protagonista.');
  };

  const onSquare = (destination: string) => {
    if (done) return;
    const piece = board[active];
    if (!piece) return;
    if (destination === active) {
      setFeedback('Esa es la posición actual. Elige una casilla de destino.');
      setFeedbackKind('neutral');
      return;
    }
    const check = checkMove(board, active, destination);
    if (!check.ok) {
      setFeedback(check.explanation);
      setFeedbackKind('error');
      return;
    }
    if (lesson.kind === 'maze' && board[destination] && destination !== lesson.goal) {
      setFeedback('En este laberinto, los peones son obstáculos. Debes rodearlos sin capturarlos.');
      setFeedbackKind('error');
      return;
    }
    const next = { ...board };
    delete next[active];
    next[destination] = piece;
    setBoard(next);
    setTrail((values) => [...values, active]);
    setActive(destination);
    setNumberOfMoves((count) => count + 1);
    if (lesson.goal && destination === lesson.goal) {
      setDone(true);
      setFeedbackKind('success');
      setFeedback('¡Objetivo conseguido! Has capturado la torre negra en ' + (numberOfMoves + 1) + ' movimientos.');
    } else {
      setFeedbackKind('success');
      setFeedback('¡Bien! Has movido la ' + pieceName(piece) + ' de ' + active + ' a ' + destination + '. Puedes volver a moverla sin alternar turnos.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Chess-Naranco · Modo didáctico</p>
            <h1 className="text-xl font-bold">Tablero sin reyes y retos de movimiento</h1>
          </div>
          <button type="button" onClick={onExit} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"><ArrowLeft size={17}/> Volver al inicio</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap gap-2" aria-label="Ejemplos didácticos">
          {lessons.map((item) => (
            <button type="button" key={item.id} onClick={() => switchLesson(item.id)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${item.id === lesson.id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'}`}>{item.title}</button>
          ))}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,600px)_minmax(260px,1fr)]">
          <div className="space-y-3">
            <div className="w-full overflow-hidden rounded-xl border-[6px] border-[#473122] shadow-2xl">
              <div className="grid aspect-square w-full grid-cols-8" role="group" aria-label="Tablero didáctico de ajedrez">
                {squares.map((square, index) => {
                  const piece = board[square];
                  const dark = (Math.floor(index / 8) + index % 8) % 2 === 1;
                  const current = active === square;
                  const showHint = hint && movableSquares.includes(square);
                  const isGoal = lesson.goal === square && !done;
                  return (
                    <button
                      key={square}
                      type="button"
                      onClick={() => onSquare(square)}
                      aria-label={square + (piece ? ', ' + pieceName(piece) : '')}
                      title={square}
                      className="relative flex aspect-square items-center justify-center p-0 transition hover:brightness-110"
                      style={{ background: current ? '#bed868' : showHint ? (dark ? '#639a5b' : '#a3cb7b') : dark ? '#bc8c64' : '#f1ddb0' }}
                    >
                      {isGoal && <span className="pointer-events-none absolute inset-1 rounded-sm border-[3px] border-amber-500"/>}
                      {trail.includes(square) && !current && <span className="pointer-events-none absolute h-2 w-2 rounded-full bg-emerald-900/50"/>}
                      {piece && <span aria-hidden="true" className={`pointer-events-none select-none text-[clamp(22px,6vw,54px)] leading-none ${isWhite(piece) ? 'text-white' : 'text-zinc-900'}`} style={isWhite(piece) ? { textShadow: '0 1px 2px #111, 1px 0 1px #111, -1px 0 1px #111' } : {}}>{symbols[piece]}</span>}
                      {index >= 56 && <span className="pointer-events-none absolute bottom-0 right-1 text-[9px] font-bold text-zinc-900/70">{square[0]}</span>}
                      {index % 8 === 0 && <span className="pointer-events-none absolute left-1 top-0 text-[9px] font-bold text-zinc-900/70">{square[1]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-center text-xs text-zinc-500">Pulsar la casilla de destino. No hay alternancia de turnos ni reyes obligatorios.</p>
          </div>
          <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400"><GraduationCap size={17}/> Ejercicio interactivo</p>
              <h2 className="text-2xl font-semibold">{lesson.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-300">{lesson.description}</p>
            </div>
            <div className={`rounded-xl border p-4 text-sm leading-relaxed ${feedbackKind === 'error' ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : feedbackKind === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-zinc-700 bg-zinc-950 text-zinc-200'}`} role="status" aria-live="polite">{feedback}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-950 px-4 py-3">
              <div className="flex items-center gap-2"><Target className="text-orange-400" size={20}/> <span className="text-sm">Movimientos</span></div>
              <span className="text-2xl font-bold tabular-nums">{numberOfMoves}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setHint((old) => !old)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800"><Lightbulb size={17}/> {hint ? 'Ocultar ayuda' : 'Mostrar casillas'}</button>
              <button type="button" onClick={() => switchLesson(lesson.id)} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold hover:bg-orange-700"><RotateCcw size={17}/> Reiniciar</button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">Versión de prueba: incluye tres ejercicios. Los movimientos incorrectos se explican, pero no aumentan el contador ni mueven la pieza.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
