import { Chess } from 'chess.js';
const chess = new Chess();
try {
  chess.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log('Move with promotion worked');
} catch (e) {
  console.log('Move with promotion failed:', e.message);
}
