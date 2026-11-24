import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Diagram } from './DiagramEditor';
import { Chessboard } from 'react-chessboard';
import BlockedSquaresOverlay from './BlockedSquaresOverlay';
import { validateDidacticMove } from './didacticSpecialRules';
import { ArrowLeft, RotateCcw, Lightbulb, Target, GraduationCap } from 'lucide-react';

type Piece = string;
type Board = Record<string, Piece>;
type Lesson = { id: string; title: string; description: string; fen: string; active: string; goal?: string; kind: 'diagram' | 'maze'; goalType?: 'reach' | 'capture'; blockedSquares?: string[]; showBlockedSquares?: boolean; captureAllowed?: string[]; nonCapturableSquares?: string[]; enforceCheck?: boolean; allowCastling?: boolean; allowEnPassant?: boolean; castlingRights?: string; enPassantSquare?: string; squareColors?: Diagram['squareColors']; arrows?: Diagram['arrows'] };

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

// The pedagogical board intentionally accepts positions without kings.
// This FEN is only a piece-placement description for the visual renderer;
// all move validation remains in checkMove, independent of chess.js.
function boardToFen(board: Board): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let empty = 0;
    let row = '';
    for (const file of alphabet) {
      const piece = board[file + rank];
      if (!piece) {
        empty += 1;
      } else {
        if (empty) row += String(empty);
        row += piece;
        empty = 0;
      }
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  return ranks.join('/') + ' w - - 0 1';
}

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

function crossesBlockedSquare(board: Board, from: string, to: string, blocked: string[]): boolean {
  if (blocked.includes(to)) return true;
  const piece = board[from];
  if (!piece || piece.toLowerCase() === 'n') return false;
  const [x1,y1] = coords(from), [x2,y2] = coords(to);
  const dx = x2 - x1, dy = y2 - y1;
  const straight = dx === 0 || dy === 0;
  const diagonal = Math.abs(dx) === Math.abs(dy);
  if (!straight && !diagonal) return false;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const steps = Math.max(Math.abs(dx),Math.abs(dy));
  for(let i=1;i<steps;i++) {
    if(blocked.includes(alphabet[x1+stepX*i]+(y1+stepY*i+1))) return true;
  }
  return false;
}

export default function DidacticBoard({ onExit, initialLesson }: { onExit: () => void; initialLesson?: Diagram | null }) {
  const availableLessons: Lesson[] = initialLesson ? [{ ...initialLesson }, ...lessons] : lessons;
  const [lessonId, setLessonId] = useState(initialLesson?.id || 'rook');
  const lesson = availableLessons.find((item) => item.id === lessonId) || availableLessons[0];
  const [board, setBoard] = useState<Board>(() => parseFenPlacement(initialLesson?.fen || lessons[0].fen));
  const [active, setActive] = useState(initialLesson?.active || lessons[0].active);
  const [numberOfMoves, setNumberOfMoves] = useState(0);
  const [castlingRights,setCastlingRights]=useState(initialLesson?.castlingRights||'');
  const [enPassantSquare,setEnPassantSquare]=useState(initialLesson?.enPassantSquare||'');
  const [feedback, setFeedback] = useState('Pulsa una casilla para mover la pieza protagonista.');
  const [feedbackKind, setFeedbackKind] = useState<'neutral' | 'error' | 'success'>('neutral');
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(560);
  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;
    const updateWidth = () => setBoardWidth(Math.max(1, Math.round(container.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const displayFen = useMemo(() => boardToFen(board), [board]);
  const checkDestination = (destination: string) => validateDidacticMove(board,active,destination,{
    kind:lesson.kind,goal:lesson.goal,
    blockedSquares:lesson.blockedSquares,nonCapturableSquares:lesson.nonCapturableSquares,
    captureAllowed:lesson.captureAllowed,enforceCheck:lesson.enforceCheck,
    allowCastling:lesson.allowCastling,castlingRights,
    allowEnPassant:lesson.allowEnPassant,enPassantSquare,
  });
  const movableSquares = squares.filter(sq => checkDestination(sq).ok);

  const squareHighlights = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    for (const [square, code] of Object.entries(lesson.squareColors || {})) {
      const colors: Record<string,string> = { G:'#219653', R:'#e34c4c', Y:'#e9ad24', B:'#347de0' };
      if (colors[code]) styles[square] = { backgroundColor:colors[code]+'99' };
    }
    for (const square of squares) {
      if (hint && movableSquares.includes(square)) {
        styles[square] = { backgroundColor: 'rgba(59, 175, 89, 0.50)' };
      }
      if (trail.includes(square)) {
        styles[square] = { ...styles[square], boxShadow: 'inset 0 0 0 3px rgba(20, 110, 58, 0.28)' };
      }
    }
    for (const square of lesson.nonCapturableSquares || []) {
      styles[square] = { ...styles[square], boxShadow: 'inset 0 0 0 4px #a78bfa' };
    }
    if (lesson.goal && !done) {
      styles[lesson.goal] = { ...styles[lesson.goal], boxShadow: 'inset 0 0 0 4px rgba(245, 158, 11, 0.95)' };
    }
    styles[active] = { ...styles[active], backgroundColor: '#bed868' };
    return styles;
  }, [active, done, hint, lesson.goal, lesson.squareColors, lesson.showBlockedSquares, lesson.blockedSquares, lesson.nonCapturableSquares, movableSquares, trail]);
  const switchLesson = (id: string) => {
    const selected = availableLessons.find((item) => item.id === id) || availableLessons[0];
    setLessonId(selected.id);
    setBoard(parseFenPlacement(selected.fen));
    setActive(selected.active);
    setNumberOfMoves(0);
    setCastlingRights(selected.castlingRights||'');
    setEnPassantSquare(selected.enPassantSquare||'');
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
    const result=checkDestination(destination);
    if(!result.ok){
      setFeedback(result.explanation);setFeedbackKind('error');return;
    }
    const next=result.next!;
    setCastlingRights(result.castlingRights||'');
    setEnPassantSquare(result.enPassantSquare||'');
    setBoard(next);
    setTrail((values) => [...values, active]);
    setActive(destination);
    setNumberOfMoves((count) => count + 1);
    if (lesson.goal && destination === lesson.goal) {
      setDone(true);
      setFeedbackKind('success');
      setFeedback('¡Objetivo conseguido! ' + (lesson.goalType === 'capture' ? 'Has capturado la pieza objetivo' : 'Has alcanzado la casilla objetivo') + ' en ' + (numberOfMoves + 1) + ' movimientos.');
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
          {availableLessons.map((item) => (
            <button type="button" key={item.id} onClick={() => switchLesson(item.id)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${item.id === lesson.id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'}`}>{item.title}</button>
          ))}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,600px)_minmax(260px,1fr)]">
          <div className="space-y-3">
            <div ref={boardContainerRef} className="relative w-full max-w-[592px] overflow-hidden rounded-xl border-[6px] border-[#473122] shadow-2xl">
              <Chessboard
                position={displayFen}
                boardOrientation="white"
                boardWidth={boardWidth}
                arePiecesDraggable={false}
                onSquareClick={(square) => onSquare(square)}
                customDarkSquareStyle={{ backgroundColor: '#bc8c64' }}
                customLightSquareStyle={{ backgroundColor: '#f1ddb0' }}
                customSquareStyles={squareHighlights}
              />
              {lesson.showBlockedSquares !== false && <BlockedSquaresOverlay squares={lesson.blockedSquares || []} occupied={board} />}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true">
                <defs><marker id="didactic-arrow-tip" viewBox="0 0 24 24" markerWidth="2.3" markerHeight="2.3" refX="18" refY="12" orient="auto" markerUnits="strokeWidth"><path d="M 2 2 L 22 12 L 2 22 z" fill="context-stroke"/></marker></defs>
                {(lesson.arrows || []).map((arrow, index) => { const x1 = (alphabet.indexOf(arrow.from[0]) + .5)*100, y1=(8.5-Number(arrow.from[1]))*100, x2=(alphabet.indexOf(arrow.to[0])+.5)*100, y2=(8.5-Number(arrow.to[1]))*100; return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={({G:'#219653',R:'#e34c4c',Y:'#e9ad24',B:'#347de0'} as Record<string,string>)[arrow.color]} strokeWidth="11" strokeLinecap="round" markerEnd="url(#didactic-arrow-tip)"/>; })}
              </svg>
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
