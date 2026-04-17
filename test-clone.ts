import { Chess } from 'chess.js';

const game = new Chess();
game.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
game.move({ from: 'e2', to: 'e4' });

const pgn = game.pgn();
console.log('PGN:', pgn);

const gameCopy = new Chess();
gameCopy.loadPgn(pgn);
console.log('Copied FEN:', gameCopy.fen());
console.log('Copied History:', gameCopy.history());
