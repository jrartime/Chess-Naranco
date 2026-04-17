import { Chess } from 'chess.js';

export const validateFEN = (fen: string): boolean => {
  const chess = new Chess();
  try {
    chess.load(fen);
    return true;
  } catch (e) {
    return false;
  }
};

export const getFEN = (chess: Chess): string => {
  return chess.fen();
};

export const getPGN = (chess: Chess): string => {
  return chess.pgn();
};

export const loadPGN = (chess: Chess, pgn: string): boolean => {
  try {
    chess.loadPgn(pgn);
    return true;
  } catch (e) {
    return false;
  }
};
