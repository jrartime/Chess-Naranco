import { Chess } from 'chess.js';
const game = new Chess();
game.loadPgn('1. e4 e5 2. Nf3 Nc6');
console.log('History length:', game.history().length);
game.undo();
game.undo();
console.log('History length after undo:', game.history().length);
try {
  const move = game.move({ from: 'f1', to: 'c4' });
  console.log('Move after undo worked:', move.san);
} catch (e) {
  console.error('Move after undo failed:', e);
}
