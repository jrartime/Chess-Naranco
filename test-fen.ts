import { Chess } from 'chess.js';
const chess = new Chess();
try {
  chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq');
  console.log('Loaded 1');
} catch (e) {
  console.log('Failed 1');
}
try {
  chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq 0 1');
  console.log('Loaded 2');
} catch (e) {
  console.log('Failed 2');
}
try {
  chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  console.log('Loaded 3');
} catch (e) {
  console.log('Failed 3');
}
