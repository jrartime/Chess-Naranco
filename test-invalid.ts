import { Chess } from 'chess.js';
const game = new Chess();
try {
  const move = game.move({ from: 'e2', to: 'e5' });
  console.log('Invalid move returned:', move);
} catch (e) {
  console.log('Invalid move threw:', e.message);
}
