import { Chess } from 'chess.js';
const game = new Chess();
try {
  const move = game.move({ from: 'g1', to: 'f3', promotion: 'q' });
  console.log('Knight move with promotion worked:', move.san);
} catch (e) {
  console.log('Knight move with promotion failed:', e.message);
}
