import { Chess } from 'chess.js';
const chess = new Chess();
try {
  chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  console.log('FEN loaded', chess.fen());
} catch (e) {
  console.error('FEN error', e);
}
try {
  chess.move({ from: 'e2', to: 'e4' });
  console.log('Move worked', chess.fen());
} catch (e) {
  console.error('Move error', e);
}
