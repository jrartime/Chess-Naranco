import { Chess } from 'chess.js';
const chess = new Chess();
try {
  chess.loadPgn('1. e4 e5 2. Nf3 Nc6');
  console.log('Loaded PGN', chess.fen());
} catch (e) {
  console.error('Failed PGN', e);
}
