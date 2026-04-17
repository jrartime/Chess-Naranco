import { Chess } from 'chess.js';
const chess = new Chess();
try {
  chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { skipValidation: true });
  console.log('Loaded FEN');
} catch (e) {
  console.error('Failed FEN', e);
}
