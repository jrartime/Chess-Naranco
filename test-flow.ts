import { Chess } from 'chess.js';

const game = new Chess();
game.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

console.log('Initial FEN:', game.fen());
console.log('Initial History:', game.history());

try {
  const move = game.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log('Move result:', move);
  console.log('New FEN:', game.fen());
  console.log('New History:', game.history());
} catch (e) {
  console.error('Move failed:', e);
}
