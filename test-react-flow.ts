import { Chess } from 'chess.js';

const game = new Chess();
let fen = game.fen();
let pgn = game.pgn();
let moveHistory = game.history({ verbose: true });
let viewingMoveIndex = moveHistory.length - 1;

function updateGameState() {
  fen = game.fen();
  pgn = game.pgn();
  moveHistory = game.history({ verbose: true });
  viewingMoveIndex = moveHistory.length - 1;
}

function makeAMove(move) {
  try {
    const result = game.move(move);
    if (result) {
      updateGameState();
      return result;
    }
  } catch (e) {
    if (typeof move === 'object' && move.promotion) {
      try {
        const resultWithoutPromotion = game.move({ from: move.from, to: move.to });
        if (resultWithoutPromotion) {
          updateGameState();
          return resultWithoutPromotion;
        }
      } catch (e2) {
        console.error('Move error without promotion:', e2);
      }
    }
    console.error('Move error:', e.message);
    return null;
  }
  return null;
}

function onDrop(sourceSquare, targetSquare) {
  if (viewingMoveIndex !== moveHistory.length - 1) {
    const movesToUndo = moveHistory.length - 1 - viewingMoveIndex;
    for (let i = 0; i < movesToUndo; i++) {
      game.undo();
    }
  }

  const move = makeAMove({
    from: sourceSquare,
    to: targetSquare,
    promotion: 'q',
  });

  if (move === null && viewingMoveIndex !== moveHistory.length - 1) {
    game.loadPgn(pgn);
    return false;
  }

  return move !== null;
}

console.log('Initial FEN:', fen);
const success = onDrop('e2', 'e4');
console.log('Move success:', success);
console.log('New FEN:', fen);
console.log('History:', moveHistory.map(m => m.san));
