import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { parse } from 'pgn-parser';
import { Play, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Upload, Copy, FileText, MessageSquarePlus, Settings, LibraryBig, ChevronRightCircle, Home } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';

type PgnMove = { move: string; comments?: Array<{ text: string }>; nags?: string[]; variations?: PgnMove[][] };
type PgnGame = { headers?: Record<string, string> | Array<{ name: string; value: string }>; introComments?: Array<{ text: string }>; moves?: PgnMove[]; result?: string };
type ContextMenuState = { x: number; y: number; linePath: number[]; moveIndex: number; historySans: string[]; isMainLine: boolean } | null;
type AppView = 'home' | 'analysis' | 'library';
type NotationView = 'inline' | 'table';
type LibraryGame = { id: string; title: string; subtitle: string; pgn: string; headers: Record<string, string> };
type PgnLibrary = { id: string; name: string; importedAt: string; games: LibraryGame[] };

const LIBRARIES_STORAGE_KEY = 'chess-naranco-libraries';

const DEFAULT_HEADERS: Record<string, string> = {
  Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', Result: '*',
  StudyName: '', ChapterName: '', ChapterURL: '', Annotator: '', ECO: '', Opening: '', UTCDate: '', UTCTime: '', Variant: 'Standard',
};

const HEADER_FIELDS = [
  ['Event', 'Evento'], ['Site', 'Sitio'], ['Date', 'Fecha'], ['Round', 'Ronda'],
  ['White', 'Blancas'], ['Black', 'Negras'], ['Result', 'Resultado'], ['StudyName', 'Estudio'],
  ['ChapterName', 'Capitulo'], ['Annotator', 'Anotador'], ['ECO', 'ECO'], ['Opening', 'Apertura'],
] as const;

const cloneParsedPgn = (value: PgnGame[] | null) => value ? (JSON.parse(JSON.stringify(value)) as PgnGame[]) : null;
const stripHeaders = (rawPgn: string) => rawPgn.replace(/^(?:\[[^\]]*]\s*\r?\n)+\s*\r?\n?/, '').trim();
const ensurePgnResult = (rawPgn: string) => /(?:\*|1-0|0-1|1\/2-1\/2)\s*$/.test(rawPgn.trim()) ? rawPgn : `${rawPgn.trim()} *`;
const NAG_SYMBOLS: Record<string, string> = {
  '$1': '!',
  '$2': '?',
  '$3': '!!',
  '$4': '??',
  '$5': '!?',
  '$6': '?!',
  '$10': '=',
  '$13': '∞',
  '$14': '⩲',
  '$15': '⩱',
  '$16': '±',
  '$17': '∓',
  '$18': '+−',
  '$19': '−+',
};

const PIECE_SYMBOLS = {
  white: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' },
  black: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' },
} as const;

const formatSanForDisplay = (san: string, isWhiteMove: boolean) => {
  const symbolMap = isWhiteMove ? PIECE_SYMBOLS.white : PIECE_SYMBOLS.black;
  return san
    .replace(/^([KQRBN])/, (_, piece: keyof typeof PIECE_SYMBOLS.white) => symbolMap[piece])
    .replace(/=([KQRBN])/g, (_, piece: keyof typeof PIECE_SYMBOLS.white) => `=${symbolMap[piece]}`);
};

const normalizeParsedMoves = (moves: any[] | undefined): PgnMove[] => {
  if (!moves) return [];
  return moves.map((move) => ({
    move: move.move,
    comments: Array.isArray(move.comments)
      ? move.comments.map((comment: any) => typeof comment === 'string' ? { text: comment } : { text: comment.text ?? String(comment) })
      : [],
    nags: Array.isArray(move.nags) ? move.nags : [],
    variations: Array.isArray(move.variations)
      ? move.variations.map((variation: any) => normalizeParsedMoves(variation))
      : Array.isArray(move.ravs)
        ? move.ravs.map((variation: any) => normalizeParsedMoves(variation.moves))
        : [],
  }));
};

const normalizeParsedGames = (games: any[] | null): PgnGame[] | null => {
  if (!games) return null;
  return games.map((game) => ({
    headers: game.headers,
    introComments: [
      ...(Array.isArray(game.comments_above_header)
        ? game.comments_above_header.map((comment: any) => typeof comment === 'string' ? { text: comment } : { text: comment.text ?? String(comment) })
        : []),
      ...(Array.isArray(game.comments)
        ? game.comments.map((comment: any) => typeof comment === 'string' ? { text: comment } : { text: comment.text ?? String(comment) })
        : []),
    ],
    moves: normalizeParsedMoves(game.moves),
    result: game.result || '*',
  }));
};

const headersToRecord = (headers: PgnGame['headers']): Record<string, string> => {
  if (!headers) return {};
  if (!Array.isArray(headers)) return headers;
  return Object.fromEntries(headers.map((header) => [header.name, header.value]));
};

const buildLibraryGameTitle = (headers: Record<string, string>, fallbackIndex: number) => {
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  if (white || black) return `${white || '?'} vs ${black || '?'}`;
  if (headers.Event?.trim()) return headers.Event.trim();
  return `Partida ${fallbackIndex + 1}`;
};

const buildLibraryGameSubtitle = (headers: Record<string, string>) => {
  const parts = [headers.Event, headers.Site, headers.Date, headers.Result].filter((value) => value && value !== '?');
  return parts.length ? parts.join(' · ') : 'Sin metadatos adicionales';
};

const decodePgnFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
};

const splitPgnGames = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const matches = [...normalized.matchAll(/^\[Event\b/mg)];
  if (!matches.length) {
    return normalized ? [normalized] : [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    return normalized.slice(start, end).trim();
  }).filter(Boolean);
};

export default function App() {
  const gameRef = useRef(new Chess());
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressHistoryClickRef = useRef(false);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const [fen, setFen] = useState(gameRef.current.fen());
  const [rootFen, setRootFen] = useState(gameRef.current.fen());
  const [pgn, setPgn] = useState(gameRef.current.pgn());
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [annotation, setAnnotation] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [importType, setImportType] = useState<'FEN' | 'PGN'>('FEN');
  const [importValue, setImportValue] = useState('');
  const [viewingMoveIndex, setViewingMoveIndex] = useState(-1);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [isHeaderDialogOpen, setIsHeaderDialogOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState<Record<string, string>>(DEFAULT_HEADERS);
  const [parsedPgn, setParsedPgn] = useState<PgnGame[] | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [libraries, setLibraries] = useState<PgnLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [notationView, setNotationView] = useState<NotationView>('inline');
  const [showNotationComments, setShowNotationComments] = useState(true);

  const stringifyPgn = useCallback((gameData: PgnGame | null) => {
    if (!gameData) return '';
    let out = '';
    if (gameData.headers) {
      const headers = typeof gameData.headers === 'object' && !Array.isArray(gameData.headers) ? Object.entries(gameData.headers) : gameData.headers;
      headers.forEach((header) => {
        const [name, value] = Array.isArray(header) ? header : [header.name, header.value];
        if (name && value) out += `[${name} "${value}"]\n`;
      });
      if (headers.length) out += '\n';
    }
    gameData.introComments?.forEach((comment) => { out += `{${comment.text}}\n`; });
    if (gameData.introComments?.length) out += '\n';
    const walk = (moves: PgnMove[], moveNum: number, isWhite: boolean): string => {
      let text = '';
      moves.forEach((move, index) => {
        if (!move.move) return;
        if (isWhite) text += `${moveNum}. `;
        else if (index === 0) text += `${moveNum}... `;
        text += `${move.move} `;
        move.nags?.forEach((nag) => { text += `${nag} `; });
        move.comments?.forEach((comment) => { text += `{${comment.text}} `; });
        move.variations?.forEach((variation) => { text += `(${walk(variation, moveNum, isWhite)}) `; });
        if (!isWhite && move.variations?.length) text += `${moveNum}... `;
        if (isWhite) isWhite = false;
        else { isWhite = true; moveNum += 1; }
      });
      return text.trim();
    };
    out += walk(gameData.moves || [], 1, true);
    return `${out} ${gameData.result || '*'}`;
  }, []);

  const syncFromGame = useCallback((nextGame: Chess, nextIndex?: number, fixedHeaders?: Record<string, string>) => {
    gameRef.current = nextGame;
    const nextHistory = nextGame.history({ verbose: true });
    setFen(nextGame.fen());
    setPgn(nextGame.pgn());
    setMoveHistory(nextHistory);
    setViewingMoveIndex(typeof nextIndex === 'number' ? nextIndex : nextHistory.length - 1);
    if (!isHeaderDialogOpen) {
      setHeaderForm((prev) => {
        const gameHeaders = nextGame.header();
        const parsedHeaders = parsedPgn?.[0]?.headers ? headersToRecord(parsedPgn[0].headers) : {};
        const sourceHeaders = Object.keys(gameHeaders).length
          ? gameHeaders
          : fixedHeaders ?? (Object.keys(parsedHeaders).length ? parsedHeaders : prev);
        return { ...DEFAULT_HEADERS, ...sourceHeaders };
      });
    }
  }, [isHeaderDialogOpen, parsedPgn]);

  const updateGameState = useCallback((nextIndex?: number) => syncFromGame(gameRef.current, nextIndex), [syncFromGame]);
  const currentHistorySans = useMemo(() => moveHistory.map((move) => move.san), [moveHistory]);
  const activeHistorySans = useMemo(
    () => viewingMoveIndex >= 0 ? moveHistory.slice(0, viewingMoveIndex + 1).map((move) => move.san) : [],
    [moveHistory, viewingMoveIndex]
  );

  const exportPgn = useMemo(() => {
    return parsedPgn?.[0] ? stringifyPgn(parsedPgn[0]) : pgn;
  }, [parsedPgn, pgn, stringifyPgn]);

  const getLineByPath = useCallback((moves: PgnMove[], linePath: number[]): PgnMove[] | null => {
    let currentLine = moves;
    for (let i = 0; i < linePath.length; i += 2) {
      const parentMove = currentLine[linePath[i]];
      const variationIndex = linePath[i + 1];
      const nextLine = parentMove?.variations?.[variationIndex];
      if (!nextLine) return null;
      currentLine = nextLine;
    }
    return currentLine;
  }, []);

  const findMoveLocation = useCallback((moves: PgnMove[], sequence: string[]): { line: PgnMove[]; index: number } | null => {
    const visit = (line: PgnMove[], startIndex: number, seqIndex: number): { line: PgnMove[]; index: number } | null => {
      for (let i = startIndex; i < line.length; i += 1) {
        if (line[i].move !== sequence[seqIndex]) continue;
        if (seqIndex === sequence.length - 1) return { line, index: i };
        const mainMatch = visit(line, i + 1, seqIndex + 1);
        if (mainMatch) return mainMatch;
        for (const variation of line[i].variations ?? []) {
          const variationMatch = visit(variation, 0, seqIndex + 1);
          if (variationMatch) return variationMatch;
        }
      }
      return null;
    };

    if (!sequence.length) return null;
    return visit(moves, 0, 0);
  }, []);

  const sequenceExistsInTree = useCallback((moves: PgnMove[], sequence: string[]) => {
    if (!sequence.length) return true;
    return findMoveLocation(moves, sequence) !== null;
  }, [findMoveLocation]);

  const addMoveToTree = useCallback((moveSan: string, historySans: string[]) => {
    if (!parsedPgn?.[0]) {
      setParsedPgn([{
        headers: Object.fromEntries(Object.entries(headerForm).filter(([, value]) => value.trim())),
        moves: historySans.map((san) => ({ move: san, variations: [] })),
        result: headerForm.Result || '*',
      }]);
      return;
    }

    const nextParsed = cloneParsedPgn(parsedPgn);
    if (!nextParsed?.[0]?.moves) return;

    const parentSequence = historySans.slice(0, -1);
    if (!parentSequence.length) {
      const firstMove = nextParsed[0].moves[0];
      if (!firstMove) {
        nextParsed[0].moves.push({ move: moveSan, variations: [] });
      } else if (firstMove.move !== moveSan) {
        const rootVariationExists = nextParsed[0].moves.some((move) => move.move === moveSan);
        if (!rootVariationExists) nextParsed[0].moves.unshift({ move: moveSan, variations: [] });
      }
      setParsedPgn(nextParsed);
      return;
    }

    const parentLocation = findMoveLocation(nextParsed[0].moves, parentSequence);
    if (!parentLocation) return;

    const nextMove = parentLocation.line[parentLocation.index + 1];
    if (!nextMove) {
      parentLocation.line.push({ move: moveSan, variations: [] });
    } else if (nextMove.move !== moveSan) {
      const parentMove = parentLocation.line[parentLocation.index];
      parentMove.variations ??= [];
      if (!parentMove.variations.some((variation) => variation[0]?.move === moveSan)) {
        parentMove.variations.push([{ move: moveSan, variations: [] }]);
        toast.success('Nueva variante anadida');
      }
    }

    setParsedPgn(nextParsed);
  }, [findMoveLocation, headerForm, parsedPgn]);

  const goToHistory = useCallback((historySans: string[], fullLineSans: string[] = historySans) => {
    try {
      const nextGame = new Chess(rootFen);
      fullLineSans.forEach((san) => {
        nextGame.move(san);
      });
      syncFromGame(nextGame, historySans.length - 1);
      setSelectedSquare(null);
      setLegalTargets([]);
    } catch {
      toast.error('No se pudo cargar esa posicion');
    }
  }, [rootFen, syncFromGame]);

  const applyTreeEdit = useCallback((editor: (moves: PgnMove[]) => void, fallbackHistory: string[]) => {
    if (!parsedPgn?.[0]?.moves) return;

    const nextParsed = cloneParsedPgn(parsedPgn);
    if (!nextParsed?.[0]?.moves) return;

    editor(nextParsed[0].moves);
    setParsedPgn(nextParsed);
    setContextMenu(null);

    const targetHistory = sequenceExistsInTree(nextParsed[0].moves, currentHistorySans)
      ? currentHistorySans
      : fallbackHistory;

    if (targetHistory.length) {
      goToHistory(targetHistory);
    } else {
      const nextGame = new Chess(rootFen);
      syncFromGame(nextGame, -1);
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  }, [currentHistorySans, goToHistory, parsedPgn, rootFen, sequenceExistsInTree, syncFromGame]);

  const deleteVariation = useCallback((linePath: number[], historySans: string[]) => {
    if (!linePath.length) return;
    const parentLinePath = linePath.slice(0, -2);
    const parentMoveIndex = linePath[linePath.length - 2];
    const variationIndex = linePath[linePath.length - 1];

    applyTreeEdit((moves) => {
      const parentLine = getLineByPath(moves, parentLinePath);
      const parentMove = parentLine?.[parentMoveIndex];
      if (!parentMove?.variations) return;
      parentMove.variations.splice(variationIndex, 1);
      if (!parentMove.variations.length) delete parentMove.variations;
    }, historySans.slice(0, Math.max(0, historySans.length - 1)));
  }, [applyTreeEdit, getLineByPath]);

  const promoteVariation = useCallback((linePath: number[], historySans: string[]) => {
    if (!linePath.length) return;
    const parentLinePath = linePath.slice(0, -2);
    const parentMoveIndex = linePath[linePath.length - 2];
    const variationIndex = linePath[linePath.length - 1];

    applyTreeEdit((moves) => {
      const parentLine = getLineByPath(moves, parentLinePath);
      const parentMove = parentLine?.[parentMoveIndex];
      const variationLine = parentMove?.variations?.[variationIndex];
      if (!parentLine || !parentMove || !variationLine) return;

      const oldMainTail = parentLine.splice(parentMoveIndex + 1);
      parentMove.variations!.splice(variationIndex, 1);
      if (!parentMove.variations!.length) delete parentMove.variations;
      parentLine.push(...variationLine);

      if (oldMainTail.length) {
        parentMove.variations ??= [];
        parentMove.variations.unshift(oldMainTail);
      }
    }, historySans);
  }, [applyTreeEdit, getLineByPath]);

  const truncateMainLine = useCallback((moveIndex: number, historySans: string[]) => {
    applyTreeEdit((moves) => {
      moves.splice(moveIndex + 1);
    }, historySans.slice(0, moveIndex + 1));
  }, [applyTreeEdit]);

  const deleteLibrary = useCallback((libraryId: string) => {
    setLibraries((previous) => previous.filter((library) => library.id !== libraryId));
    toast.success('Biblioteca eliminada');
  }, []);

  const openContextMenu = useCallback((payload: Exclude<ContextMenuState, null>) => {
    setContextMenu(payload);
    setSelectedSquare(null);
    setLegalTargets([]);
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    try {
      const rawLibraries = window.localStorage.getItem(LIBRARIES_STORAGE_KEY);
      if (!rawLibraries) return;
      const parsedLibraries = JSON.parse(rawLibraries) as PgnLibrary[];
      setLibraries(parsedLibraries);
      if (parsedLibraries.length) setSelectedLibraryId(parsedLibraries[0].id);
    } catch {
      window.localStorage.removeItem(LIBRARIES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LIBRARIES_STORAGE_KEY, JSON.stringify(libraries));
    if (!libraries.length) {
      setSelectedLibraryId(null);
      return;
    }
    if (!selectedLibraryId || !libraries.some((library) => library.id === selectedLibraryId)) {
      setSelectedLibraryId(libraries[0].id);
    }
  }, [libraries, selectedLibraryId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight' && viewingMoveIndex < moveHistory.length - 1) setViewingMoveIndex((value) => value + 1);
      if (event.key === 'ArrowLeft' && viewingMoveIndex > -1) setViewingMoveIndex((value) => value - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveHistory.length, viewingMoveIndex]);

  const navigateHistory = (index: number) => {
    if (index >= -1 && index < moveHistory.length) {
      setViewingMoveIndex(index);
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  };

  const makeAMove = useCallback((move: string | { from: string; to: string; promotion?: string }) => {
    const game = gameRef.current;
    try {
      const result = game.move(move);
      if (!result) return null;
      addMoveToTree(result.san, game.history());
      updateGameState();
      return result;
    } catch (error: unknown) {
      if (typeof move === 'object' && move.promotion) {
        try {
          const fallbackResult = game.move({ from: move.from, to: move.to });
          if (fallbackResult) {
            addMoveToTree(fallbackResult.san, game.history());
            updateGameState();
            return fallbackResult;
          }
        } catch {}
      }
      toast.error(`Movimiento invalido: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      return null;
    }
  }, [addMoveToTree, updateGameState]);

  const onDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    const game = gameRef.current;
    if (viewingMoveIndex !== moveHistory.length - 1) {
      for (let i = 0; i < moveHistory.length - 1 - viewingMoveIndex; i += 1) game.undo();
    }
    const move = makeAMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    if (move === null && viewingMoveIndex !== moveHistory.length - 1) {
      game.loadPgn(pgn);
      return false;
    }
    setSelectedSquare(null);
    setLegalTargets([]);
    return move !== null;
  }, [makeAMove, moveHistory.length, pgn, viewingMoveIndex]);

  const resetGame = () => {
    const nextGame = new Chess();
    setRootFen(nextGame.fen());
    syncFromGame(nextGame, undefined, {});
    setParsedPgn(null);
    toast.success('Tablero reiniciado');
  };

  const saveHeaders = () => {
    const nextGame = new Chess();
    Object.entries(headerForm).forEach(([key, value]) => { if (value.trim()) nextGame.header(key, value.trim()); });
    const movetext = stripHeaders(pgn);
    if (movetext) nextGame.loadPgn(movetext);
    syncFromGame(nextGame, undefined, Object.fromEntries(Object.entries(headerForm).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)));
    if (parsedPgn?.[0]) {
      const nextParsed = cloneParsedPgn(parsedPgn);
      if (nextParsed?.[0]) {
        nextParsed[0].headers = Object.fromEntries(Object.entries(headerForm).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
        nextParsed[0].result = headerForm.Result || '*';
        setParsedPgn(nextParsed);
      }
    }
    setIsHeaderDialogOpen(false);
    toast.success('Informacion de partida actualizada');
  };

  const currentPositionFen = useMemo(() => {
    if (viewingMoveIndex === moveHistory.length - 1) return fen;
    const tempGame = new Chess();
    tempGame.loadPgn(pgn);
    for (let i = 0; i < moveHistory.length - 1 - viewingMoveIndex; i += 1) tempGame.undo();
    return tempGame.fen();
  }, [fen, moveHistory.length, pgn, viewingMoveIndex]);

  const getVisibleGame = useCallback(() => new Chess(currentPositionFen), [currentPositionFen]);

  const loadNotation = useCallback((value: string, preferredType: 'FEN' | 'PGN' = 'PGN') => {
    const trimmed = value.trim();
    if (!trimmed) return false;

    try {
      const parsed = preferredType === 'PGN' || !trimmed.includes('/')
        ? (() => {
            try {
              return normalizeParsedGames(parse(ensurePgnResult(trimmed)) as any[]);
            } catch {
              return null;
            }
          })()
        : null;

      const isFen =
        preferredType === 'FEN' ||
        /^\s*([rnbqkRNBQK1-8]+\/){7}[rnbqkRNBQK1-8]+\s+[bw]\s+(-|K?Q?k?q?)\s+(-|[a-h][36])\s+\d+\s+\d+\s*$/.test(trimmed) ||
        (trimmed.includes('/') && trimmed.split(' ').length >= 2 && !trimmed.includes('['));

      const nextGame = new Chess();
      if (isFen) {
        nextGame.load(trimmed);
        setRootFen(nextGame.fen());
        syncFromGame(nextGame, undefined, {});
        setParsedPgn(null);
      } else {
        nextGame.loadPgn(ensurePgnResult(trimmed));
        const setupFen = nextGame.header().FEN;
        const parsedHeaders = parsed?.[0]?.headers ? headersToRecord(parsed[0].headers) : nextGame.header();
        setRootFen(typeof setupFen === 'string' && setupFen.trim() ? setupFen : new Chess().fen());
        syncFromGame(nextGame, -1, parsedHeaders);
        setParsedPgn(parsed);
      }

      setImportValue('');
      setSelectedSquare(null);
      setLegalTargets([]);
      setCurrentView('analysis');
      toast.success(isFen ? 'FEN cargado correctamente' : 'PGN cargado correctamente');
      return true;
    } catch {
      toast.error('Error al importar. Verifica el formato.');
      return false;
    }
  }, [syncFromGame]);

  const buildLibraryFromText = useCallback((name: string, text: string): PgnLibrary | null => {
    try {
      const rawGames = splitPgnGames(text);
      if (!rawGames.length) return null;

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        importedAt: new Date().toISOString(),
        games: rawGames.map((rawGame, index) => {
          const parsedGame = normalizeParsedGames(parse(ensurePgnResult(rawGame)) as any[])?.[0];
          const headers = headersToRecord(parsedGame?.headers);
          return {
            id: `${name}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            title: buildLibraryGameTitle(headers, index),
            subtitle: buildLibraryGameSubtitle(headers),
            pgn: ensurePgnResult(rawGame),
            headers,
          };
        }),
      };
    } catch {
      return null;
    }
  }, []);

  const handleSquareClick = useCallback((square: Square) => {
    const visibleGame = getVisibleGame();
    const piece = visibleGame.get(square);
    const selectablePiece = piece && piece.color === visibleGame.turn();

    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalTargets([]);
        return;
      }

      if (legalTargets.includes(square)) {
        onDrop(selectedSquare, square);
        return;
      }

      if (selectablePiece) {
        setSelectedSquare(square);
        setLegalTargets(visibleGame.moves({ square, verbose: true }).map((move) => move.to));
        return;
      }

      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    if (!selectablePiece) return;

    setSelectedSquare(square);
    setLegalTargets(visibleGame.moves({ square, verbose: true }).map((move) => move.to));
  }, [getVisibleGame, legalTargets, onDrop, selectedSquare]);

  const handleImport = () => {
    if (loadNotation(importValue, importType)) {
      setIsDialogOpen(false);
    }
  };

  const handleLibraryFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const importedLibraries: PgnLibrary[] = [];
    for (const file of files) {
      try {
        const text = await decodePgnFile(file);
        const library = buildLibraryFromText(file.name, text);
        if (library) {
          importedLibraries.push(library);
        } else {
          toast.error(`No se pudo leer ${file.name} como biblioteca PGN`);
        }
      } catch {
        toast.error(`Error al abrir ${file.name}`);
      }
    }

    if (importedLibraries.length) {
      setLibraries((previous) => [...importedLibraries, ...previous]);
      setSelectedLibraryId(importedLibraries[0].id);
      setCurrentView('library');
      toast.success(`${importedLibraries.length} biblioteca(s) importada(s)`);
    }

    event.target.value = '';
  }, [buildLibraryFromText, loadNotation]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado al portapapeles`)).catch(() => toast.error(`No se pudo copiar ${label}`));
  };

  const addAnnotation = () => {
    if (viewingMoveIndex === -1) { toast.error('Selecciona un movimiento para anadir una anotacion'); return; }
    try {
      const tempGame = new Chess();
      tempGame.loadPgn(pgn);
      const undoneMoves: Array<Move | null> = [];
      for (let i = 0; i < moveHistory.length - 1 - viewingMoveIndex; i += 1) undoneMoves.push(tempGame.undo());
      tempGame.setComment(annotation);
      for (let i = undoneMoves.length - 1; i >= 0; i -= 1) if (undoneMoves[i]) tempGame.move(undoneMoves[i] as Move);
      syncFromGame(tempGame);
      setParsedPgn((previous) => previous ? normalizeParsedGames(parse(ensurePgnResult(tempGame.pgn())) as any[]) : previous);
      setAnnotation('');
      toast.success('Anotacion anadida');
    } catch {
      toast.error('Error al anadir anotacion');
    }
  };

  const currentComment = useMemo(() => {
    if (parsedPgn?.[0]) {
      if (viewingMoveIndex === -1) {
        return parsedPgn[0].introComments?.map((comment) => comment.text).filter(Boolean).join(' ') || '';
      }

      const activeSequence = currentHistorySans.slice(0, viewingMoveIndex + 1);
      if (!activeSequence.length) return '';

      const location = findMoveLocation(parsedPgn[0].moves || [], activeSequence);
      if (!location) return '';

      return location.line[location.index]?.comments?.map((comment) => comment.text).filter(Boolean).join(' ') || '';
    }

    if (viewingMoveIndex === moveHistory.length - 1) return gameRef.current.getComment() || '';
    try {
      const tempGame = new Chess();
      tempGame.loadPgn(pgn);
      for (let i = 0; i < moveHistory.length - 1 - viewingMoveIndex; i += 1) tempGame.undo();
      return tempGame.getComment() || '';
    } catch {
      return '';
    }
  }, [currentHistorySans, findMoveLocation, moveHistory.length, parsedPgn, pgn, viewingMoveIndex]);

  const renderMoveButton = useCallback((
    move: PgnMove,
    key: string,
    nextHistory: string[],
    fullLineSans: string[],
    currentLinePath: number[],
    index: number,
    isSelected: boolean,
    isWhiteMove: boolean,
    inVariation: boolean,
  ) => (
    <button
      type="button"
      onClick={() => {
        if (suppressHistoryClickRef.current) {
          suppressHistoryClickRef.current = false;
          return;
        }
        goToHistory(nextHistory, fullLineSans);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openContextMenu({
          x: event.clientX,
          y: event.clientY,
          linePath: currentLinePath,
          moveIndex: index,
          historySans: nextHistory,
          isMainLine: currentLinePath.length === 0,
        });
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
          suppressHistoryClickRef.current = true;
          openContextMenu({
            x: event.clientX,
            y: event.clientY,
            linePath: currentLinePath,
            moveIndex: index,
            historySans: nextHistory,
            isMainLine: currentLinePath.length === 0,
          });
        }, 500);
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      className={`rounded px-1 transition-colors ${inVariation ? 'font-normal' : 'font-semibold'} ${isSelected ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-100 hover:bg-zinc-800 hover:text-orange-300'}`}
    >
      {formatSanForDisplay(move.move, isWhiteMove)}
    </button>
  ), [clearLongPress, goToHistory, openContextMenu]);

  const renderMoveMetaInline = useCallback((
    move: PgnMove,
    key: string,
    currentHistory: string[],
    moveNum: number,
    isWhite: boolean,
    currentLinePath: number[],
  ) => (
    <>
      {showNotationComments ? move.comments?.map((comment, commentIndex) => (
        <span key={`${key}-comment-${commentIndex}`} className="text-orange-300">{` {${comment.text}}`}</span>
      )) : null}
      {move.variations?.map((variation, variationIndex) => (
        <React.Fragment key={`${key}-variation-${variationIndex}`}>
          <span className="text-zinc-500"> (</span>
          {renderHistoryInline(variation, currentHistory, moveNum, isWhite, `${key}-v${variationIndex}`, [...currentLinePath, variationIndex], true)}
          <span className="text-zinc-500">)</span>
        </React.Fragment>
      ))}
    </>
  ), [showNotationComments]);

  const renderHistoryInline = useCallback((moves: PgnMove[], historySans: string[] = [], moveNum = 1, isWhite = true, keyPrefix = 'm', linePath: number[] = [], inVariation = false): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let currentHistory = [...historySans];

    moves.forEach((move, index) => {
      const key = `${keyPrefix}-${index}`;
      const prefix = isWhite ? `${moveNum}. ` : index === 0 ? `${moveNum}... ` : '';
      const nextHistory = [...currentHistory, move.move];
      const futureLineSans = moves.slice(index + 1).map((futureMove) => futureMove.move);
      const fullLineSans = [...nextHistory, ...futureLineSans];
      const isSelected = nextHistory.join(' ') === activeHistorySans.join(' ');
      const variationMoveNum = isWhite ? moveNum : moveNum + 1;
      const variationIsWhite = !isWhite;
      const currentLinePath = [...linePath];

      nodes.push(
        <React.Fragment key={`${key}-move`}>
          <span className="text-zinc-500">{prefix}</span>
          {renderMoveButton(move, key, nextHistory, fullLineSans, currentLinePath, index, isSelected, isWhite, inVariation)}
          {move.nags?.map((nag, nagIndex) => (
            <span
              key={`${key}-nag-${nagIndex}`}
              className={`ml-1 ${inVariation ? 'font-normal' : 'font-semibold'} text-amber-300`}
            >
              {NAG_SYMBOLS[nag] || nag}
            </span>
          ))}
          {renderMoveMetaInline(move, key, currentHistory, moveNum, isWhite, [...currentLinePath, index])}
          <span> </span>
        </React.Fragment>
      );

      if (isWhite) {
        isWhite = false;
      } else {
        isWhite = true;
        moveNum += 1;
      }
      currentHistory = nextHistory;
    });

    return nodes;
  }, [activeHistorySans, renderMoveButton, renderMoveMetaInline]);

  const renderVariationOutline = useCallback((moves: PgnMove[], historySans: string[] = [], moveNum = 1, isWhite = true, keyPrefix = 'schema', linePath: number[] = [], depth = 0): React.ReactNode => {
    let currentHistory = [...historySans];
    let currentMoveNum = moveNum;
    let whiteToMove = isWhite;
    const rows: React.ReactNode[] = [];
    let linearItems: React.ReactNode[] = [];

    const flushLinearItems = (suffix: string) => {
      if (!linearItems.length) return;
      rows.push(
        <div key={`${keyPrefix}-linear-${suffix}`} className="flex flex-wrap items-center gap-x-0.5 text-[13px] leading-5">
          {linearItems}
        </div>
      );
      linearItems = [];
    };

    moves.forEach((move, index) => {
      const key = `${keyPrefix}-${index}`;
      const prefix = whiteToMove ? `${currentMoveNum}. ` : index === 0 ? `${currentMoveNum}... ` : '';
      const nextHistory = [...currentHistory, move.move];
      const futureLineSans = moves.slice(index + 1).map((futureMove) => futureMove.move);
      const fullLineSans = [...nextHistory, ...futureLineSans];
      const isSelected = nextHistory.join(' ') === activeHistorySans.join(' ');
      const currentLinePath = [...linePath];
      const moveNode = (
        <React.Fragment key={`${key}-inline`}>
          <span className="text-zinc-500/90">{prefix}</span>
          <span className={`inline-flex items-center ${depth > 0 ? 'pl-0.5' : ''}`}>
            {renderMoveButton(move, key, nextHistory, fullLineSans, currentLinePath, index, isSelected, whiteToMove, true)}
            {move.nags?.map((nag, nagIndex) => (
              <span key={`${key}-nag-${nagIndex}`} className="ml-0.5 text-[13px] text-amber-300">
                {NAG_SYMBOLS[nag] || nag}
              </span>
            ))}
          </span>
          {showNotationComments ? move.comments?.map((comment, commentIndex) => (
            <span key={`${key}-comment-${commentIndex}`} className="ml-1 text-[12px] text-orange-300/85">{`{${comment.text}}`}</span>
          )) : null}
        </React.Fragment>
      );

      if (move.variations?.length) {
        flushLinearItems(`${index}-before`);
        rows.push(
          <div key={`${key}-row`} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-0.5 text-[13px] leading-5">
              {moveNode}
            </div>
            {move.variations.map((variation, variationIndex) => (
              <div
                key={`${key}-variation-${variationIndex}`}
                className={`border-l pl-2 ${depth === 0 ? 'border-zinc-700/65' : depth === 1 ? 'border-zinc-700/45' : 'border-zinc-700/30'}`}
                style={{ marginLeft: `${Math.min(depth + 1, 4) * 10}px` }}
              >
                {renderVariationOutline(
                  variation,
                  currentHistory,
                  currentMoveNum,
                  whiteToMove,
                  `${key}-v${variationIndex}`,
                  [...currentLinePath, index, variationIndex],
                  depth + 1,
                )}
              </div>
            ))}
          </div>
        );
      } else {
        linearItems.push(moveNode);
      }

      currentHistory = nextHistory;
      if (whiteToMove) {
        whiteToMove = false;
      } else {
        whiteToMove = true;
        currentMoveNum += 1;
      }
    });

    flushLinearItems('tail');

    return (
      <div className={`space-y-0.5 ${depth > 0 ? 'mt-0.5' : ''}`}>
        {rows}
      </div>
    );
  }, [activeHistorySans, renderMoveButton, showNotationComments]);

  const renderNotationTable = useCallback((moves: PgnMove[], historySans: string[] = [], moveNum = 1, isWhite = true, keyPrefix = 't', linePath: number[] = []): React.ReactNode => {
    let currentHistory = [...historySans];
    let currentMoveNum = moveNum;
    let whiteToMove = isWhite;
    const rows: React.ReactNode[] = [];

    const renderMoveCell = (move: PgnMove, absoluteIndex: number, moveNumber: number, moveIsWhite: boolean) => {
      const key = `${keyPrefix}-${absoluteIndex}`;
      const nextHistory = [...currentHistory, move.move];
      const futureLineSans = moves.slice(absoluteIndex + 1).map((futureMove) => futureMove.move);
      const fullLineSans = [...nextHistory, ...futureLineSans];
      const isSelected = nextHistory.join(' ') === activeHistorySans.join(' ');
      const currentLinePath = [...linePath, absoluteIndex];

      const cell = (
        <div className="flex flex-col gap-1 py-2">
          <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
            {renderMoveButton(move, key, nextHistory, fullLineSans, currentLinePath, absoluteIndex, isSelected, moveIsWhite, false)}
            {move.nags?.map((nag, nagIndex) => (
              <span
                key={`${key}-nag-${nagIndex}`}
                className="ml-1 font-semibold text-amber-300"
              >
                {NAG_SYMBOLS[nag] || nag}
              </span>
            ))}
          </div>
          {showNotationComments ? move.comments?.map((comment, commentIndex) => (
            <div key={`${key}-comment-${commentIndex}`} className="text-[12px] leading-5 text-orange-300/90">{`{${comment.text}}`}</div>
          )) : null}
        </div>
      );

      currentHistory = nextHistory;
      return cell;
    };

    for (let absoluteIndex = 0; absoluteIndex < moves.length;) {
      const rowMoveNum = currentMoveNum;
      const rowBaseHistory = [...currentHistory];
      const whiteIndex = whiteToMove && absoluteIndex < moves.length ? absoluteIndex : null;
      const blackIndex = absoluteIndex + (whiteIndex !== null ? 1 : 0) < moves.length ? absoluteIndex + (whiteIndex !== null ? 1 : 0) : null;
      const whiteMove = whiteIndex !== null ? moves[whiteIndex] : null;
      const blackMove = blackIndex !== null ? moves[blackIndex] : null;
      let whiteCell: React.ReactNode = null;
      let blackCell: React.ReactNode = null;
      const rowStartsWithBlack = !whiteToMove;

      if (whiteIndex !== null) {
        whiteCell = renderMoveCell(moves[absoluteIndex], absoluteIndex, rowMoveNum, true);
        absoluteIndex += 1;
        whiteToMove = false;
      }

      if (blackIndex !== null) {
        blackCell = renderMoveCell(moves[absoluteIndex], absoluteIndex, rowMoveNum, false);
        absoluteIndex += 1;
        whiteToMove = true;
        currentMoveNum += 1;
      }

      rows.push(
        <React.Fragment key={`${keyPrefix}-row-${rowMoveNum}-${absoluteIndex}`}>
          <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-800/60 bg-transparent">
            <div className="border-r border-zinc-800/60 px-2 py-1.5 text-[11px] font-semibold text-zinc-500">
            {rowStartsWithBlack ? `${rowMoveNum}...` : `${rowMoveNum}`}
            </div>
            <div className="border-r border-zinc-800/70 px-2">{whiteCell}</div>
            <div className="px-2">{blackCell}</div>
          </div>
          {(whiteMove?.variations?.length || blackMove?.variations?.length) ? (
            <div className="border-b border-zinc-800/40 bg-zinc-950/25 px-2 py-1.5">
              <div className="space-y-1">
                {whiteMove?.variations?.map((variation, variationIndex) => (
                  <div key={`${keyPrefix}-white-variation-${rowMoveNum}-${variationIndex}`} className="ml-[42px]">
                    {renderVariationOutline(
                      variation,
                      rowBaseHistory,
                      rowMoveNum,
                      true,
                      `${keyPrefix}-white-v-${rowMoveNum}-${variationIndex}`,
                      [whiteIndex ?? 0, variationIndex],
                      0,
                    )}
                  </div>
                ))}
                {blackMove?.variations?.map((variation, variationIndex) => (
                  <div key={`${keyPrefix}-black-variation-${rowMoveNum}-${variationIndex}`} className="ml-[42px]">
                    {renderVariationOutline(
                      variation,
                      whiteMove ? [...rowBaseHistory, whiteMove.move] : rowBaseHistory,
                      rowMoveNum,
                      false,
                      `${keyPrefix}-black-v-${rowMoveNum}-${variationIndex}`,
                      [blackIndex ?? 0, variationIndex],
                      0,
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </React.Fragment>
      );
    }

    return (
      <div>
        <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-700 bg-zinc-900/90">
          <div className="border-r border-zinc-800/70 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">#</div>
          <div className="border-r border-zinc-800/70 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Blancas</div>
          <div className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Negras</div>
        </div>
        {rows}
      </div>
    );
  }, [activeHistorySans, renderMoveButton, renderVariationOutline, showNotationComments]);

  const notationContent = useMemo(() => {
    if (parsedPgn?.[0]?.moves?.length) {
      return notationView === 'table'
        ? renderNotationTable(parsedPgn[0].moves)
        : renderHistoryInline(parsedPgn[0].moves);
    }

    if (!moveHistory.length) {
      return null;
    }

    if (notationView === 'table') {
      return (
        <div>
          <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-700 bg-zinc-900/90">
            <div className="border-r border-zinc-800/70 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">#</div>
            <div className="border-r border-zinc-800/70 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Blancas</div>
            <div className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Negras</div>
          </div>
          {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, index) => (
            <div key={`fallback-table-${index}`} className="grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-800/70">
              <div className="border-r border-zinc-800/70 px-2 py-2 text-xs font-semibold text-zinc-500">{index + 1}</div>
              <div className="border-r border-zinc-800/70 px-2 py-2">
                {moveHistory[index * 2] ? (
                  <span className={viewingMoveIndex === index * 2 ? 'rounded bg-orange-500/20 px-1 text-orange-400' : 'text-zinc-100'}>
                    {formatSanForDisplay(moveHistory[index * 2].san, true)}
                  </span>
                ) : null}
              </div>
              <div className="px-2 py-2">
                {moveHistory[index * 2 + 1] ? (
                  <span className={viewingMoveIndex === index * 2 + 1 ? 'rounded bg-orange-500/20 px-1 text-orange-400' : 'text-zinc-100'}>
                    {formatSanForDisplay(moveHistory[index * 2 + 1].san, false)}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, index) => (
      <React.Fragment key={`fallback-${index}`}>
        <span className="text-zinc-500">{index + 1}. </span>
        <span className={viewingMoveIndex === index * 2 ? 'text-orange-400' : 'text-zinc-100'}>{formatSanForDisplay(moveHistory[index * 2]?.san || '', true)}</span>
        <span> </span>
        {moveHistory[index * 2 + 1] ? (
          <>
            <span className={viewingMoveIndex === index * 2 + 1 ? 'text-orange-400' : 'text-zinc-100'}>{formatSanForDisplay(moveHistory[index * 2 + 1]?.san || '', false)}</span>
            <span> </span>
          </>
        ) : null}
      </React.Fragment>
    ));
  }, [moveHistory, notationView, parsedPgn, renderHistoryInline, renderNotationTable, viewingMoveIndex]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: '#cfd764' };
    }
    legalTargets.forEach((square) => {
      styles[square] = {
        ...(styles[square] || {}),
        backgroundColor: styles[square]?.backgroundColor || '#d5dc72',
        boxShadow: 'inset 0 0 0 2px rgba(132, 146, 54, 0.45)',
      };
    });
    return styles;
  }, [legalTargets, selectedSquare]);

  const customBoardStyle = useMemo(() => ({
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#17130f',
  }), []);

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === selectedLibraryId) || null,
    [libraries, selectedLibraryId]
  );

  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-orange-500/30">
        <Toaster position="top-center" richColors />
        <input ref={libraryInputRef} type="file" accept=".pgn" multiple className="hidden" onChange={handleLibraryFiles} />
        <main className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(120,53,15,0.22),_transparent_30%)]" />
          <div className="relative max-w-6xl mx-auto px-4 py-10 md:py-16">
            <div className="mb-10 md:mb-14">
              <div className="inline-flex items-center gap-3 rounded-full border border-orange-500/20 bg-zinc-900/80 px-4 py-2 text-sm text-orange-200">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white">
                  <Play className="h-4 w-4 fill-current" />
                </div>
                Chess Naranco
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 md:text-6xl">
                Tu espacio para analizar partidas y construir una biblioteca de posiciones.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
                Empieza en el tablero de analisis o prepara una coleccion de posiciones PGN organizada por criterios de estudio, apertura o tema.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setCurrentView('analysis')}
                className="group rounded-3xl border border-orange-500/20 bg-[linear-gradient(145deg,rgba(39,24,15,0.96),rgba(24,24,27,0.98))] p-7 text-left shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:-translate-y-1 hover:border-orange-400/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-600/90 text-white shadow-lg shadow-orange-950/40">
                    <Play className="h-6 w-6 fill-current" />
                  </div>
                  <ChevronRightCircle className="h-6 w-6 text-orange-300 transition group-hover:translate-x-1" />
                </div>
                <h2 className="mt-8 text-2xl font-semibold text-zinc-50">Tablero de analisis</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Carga PGN o FEN, navega variantes, edita ramas y trabaja sobre posiciones concretas desde un tablero interactivo.
                </p>
                <div className="mt-8 inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-200">
                  Abrir analisis
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('library')}
                className="group rounded-3xl border border-zinc-800 bg-[linear-gradient(145deg,rgba(20,20,22,0.98),rgba(30,27,20,0.96))] p-7 text-left shadow-[0_24px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-amber-200">
                    <LibraryBig className="h-6 w-6" />
                  </div>
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-200">
                    Biblioteca
                  </span>
                </div>
                <h2 className="mt-8 text-2xl font-semibold text-zinc-50">Biblioteca de posiciones</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Acceso futuro a una coleccion PGN clasificada por apertura, estructura, plan estrategico, dificultad o tipo de final.
                </p>
                <div className="mt-8 inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300">
                  Abrir biblioteca
                </div>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (currentView === 'library') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-orange-500/30">
        <Toaster position="top-center" richColors />
        <input ref={libraryInputRef} type="file" accept=".pgn" multiple className="hidden" onChange={handleLibraryFiles} />
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-amber-200">
                <LibraryBig className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight">Biblioteca PGN</h1>
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">colecciones importadas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentView('home')} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
                <Home className="w-4 h-4 mr-2" />
                Inicio
              </Button>
              <Button variant="outline" size="sm" onClick={() => libraryInputRef.current?.click()} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
                <Upload className="w-4 h-4 mr-2" />
                Importar PGN
              </Button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8 grid gap-8 lg:grid-cols-12">
          <Card className="lg:col-span-4 bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Bibliotecas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {libraries.length ? libraries.map((library) => (
                <div
                  key={library.id}
                  className={`w-full rounded-2xl border p-4 transition ${selectedLibraryId === library.id ? 'border-orange-500/40 bg-orange-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedLibraryId(library.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium text-zinc-100">{library.name}</div>
                      <div className="mt-1 text-sm text-zinc-400">{library.games.length} partidas</div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
                      onClick={() => deleteLibrary(library.id)}
                      title="Eliminar biblioteca"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-sm leading-6 text-zinc-400">
                  Importa uno o varios archivos PGN para crear tu biblioteca local de estudio.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-8 bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                {selectedLibrary ? selectedLibrary.name : 'Partidas'}
              </CardTitle>
              {selectedLibrary ? (
                <span className="text-sm text-zinc-500">{selectedLibrary.games.length} partidas</span>
              ) : null}
            </CardHeader>
            <CardContent>
              {selectedLibrary ? (
                <ScrollArea className="h-[520px] pr-4">
                  <div className="space-y-3">
                    {selectedLibrary.games.map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => loadNotation(game.pgn, 'PGN')}
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:border-orange-500/30 hover:bg-zinc-900"
                      >
                        <div className="font-medium text-zinc-100">{game.title}</div>
                        <div className="mt-1 text-sm text-zinc-400">{game.subtitle}</div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-sm leading-6 text-zinc-400">
                  Selecciona una biblioteca de la izquierda o importa un archivo PGN nuevo.
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-orange-500/30">
      <Toaster position="top-center" richColors />
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-900/20"><Play className="text-white fill-current w-5 h-5" /></div>
            <div><h1 className="font-bold text-xl tracking-tight">Chess Analysis</h1><p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">v1.0.0</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentView('home')} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
              <Home className="w-4 h-4 mr-2" />
              Inicio
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentView('library')} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
              <LibraryBig className="w-4 h-4 mr-2" />
              Biblioteca
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger render={<Button variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"><Upload className="w-4 h-4 mr-2" />Importar</Button>} />
              <DialogContent className="max-h-[85vh] overflow-hidden bg-zinc-900 border-zinc-800 text-zinc-100">
                <DialogHeader><DialogTitle>Importar Partida o Posicion</DialogTitle><DialogDescription className="text-zinc-400">Pega un codigo FEN o el contenido de un archivo PGN.</DialogDescription></DialogHeader>
                <div className="space-y-4 overflow-y-auto py-4 pr-2">
                  <div className="flex gap-4 mb-4">
                    <Button variant={importType === 'FEN' ? 'default' : 'outline'} onClick={() => setImportType('FEN')} className={importType === 'FEN' ? 'bg-orange-600 hover:bg-orange-700' : ''}>FEN</Button>
                    <Button variant={importType === 'PGN' ? 'default' : 'outline'} onClick={() => setImportType('PGN')} className={importType === 'PGN' ? 'bg-orange-600 hover:bg-orange-700' : ''}>PGN</Button>
                  </div>
                  <Textarea placeholder={importType === 'FEN' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : '1. e4 e5 2. Nf3 ...'} className="min-h-[150px] bg-zinc-950 border-zinc-800 focus:ring-orange-500" value={importValue} onChange={(event) => setImportValue(event.target.value)} />
                </div>
                <DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button><Button className="bg-orange-600 hover:bg-orange-700" onClick={handleImport}>Cargar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={resetGame} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"><RotateCcw className="w-4 h-4 mr-2" />Reiniciar</Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="chess-board-shell aspect-square w-full max-w-[600px] mx-auto rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-[#473122] bg-[#17130f] p-1.5">
            <Chessboard
              position={currentPositionFen}
              onPieceDrop={onDrop}
              onSquareClick={handleSquareClick}
              boardOrientation="white"
              customBoardStyle={customBoardStyle}
              customDarkSquareStyle={{ backgroundColor: '#bc8c64' }}
              customLightSquareStyle={{ backgroundColor: '#f1ddb0' }}
              customSquareStyles={customSquareStyles}
              boardWidth={592}
            />
          </div>
          <div className="flex items-center justify-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 relative">
            <Button variant="ghost" size="icon" onClick={() => navigateHistory(-1)}><ChevronsLeft className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigateHistory(viewingMoveIndex - 1)}><ChevronLeft className="w-5 h-5" /></Button>
            <div className="px-4 py-1 bg-zinc-800 rounded-md font-mono text-sm min-w-[120px] text-center">{viewingMoveIndex === -1 ? 'Inicio' : `Mov. ${viewingMoveIndex + 1}`}</div>
            <Button variant="ghost" size="icon" onClick={() => navigateHistory(viewingMoveIndex + 1)}><ChevronRight className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigateHistory(moveHistory.length - 1)}><ChevronsRight className="w-5 h-5" /></Button>
          </div>
        </div>
        <div className="lg:col-span-5 space-y-6">
          <Card className="bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-orange-500" />Notacion</CardTitle>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNotationComments((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
                  title={showNotationComments ? 'Ocultar comentarios' : 'Mostrar comentarios'}
                >
                  <span className="font-medium">{showNotationComments ? 'Comentarios on' : 'Comentarios off'}</span>
                  <span className={`relative h-5 w-9 rounded-full transition ${showNotationComments ? 'bg-orange-500/80' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${showNotationComments ? 'left-4' : 'left-0.5'}`} />
                  </span>
                </button>
                <div className="inline-flex rounded-full border border-zinc-700 bg-zinc-950 p-1">
                  <button
                    type="button"
                    onClick={() => setNotationView('inline')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${notationView === 'inline' ? 'bg-orange-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Linea
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotationView('table')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${notationView === 'table' ? 'bg-orange-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Tabla
                  </button>
                </div>
                <div className="flex bg-zinc-800 rounded-md p-1">
                <Dialog open={isHeaderDialogOpen} onOpenChange={setIsHeaderDialogOpen}>
                  <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-zinc-700" title="Editar Info de Partida"><Settings className="w-4 h-4" /></Button>} />
                  <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-[425px]">
                    <DialogHeader><DialogTitle>Informacion de la Partida (PGN Tags)</DialogTitle><DialogDescription>Edita los metadatos que apareceran en el archivo PGN.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                      {HEADER_FIELDS.map(([key, label]) => (
                        <div key={key} className="grid grid-cols-4 items-center gap-4">
                          <label className="text-right text-xs font-bold uppercase text-zinc-500">{label}</label>
                          <Input value={headerForm[key]} onChange={(event) => setHeaderForm({ ...headerForm, [key]: event.target.value })} className="col-span-3 bg-zinc-950 border-zinc-800 h-8" />
                        </div>
                      ))}
                    </div>
                    <DialogFooter><Button variant="ghost" onClick={() => setIsHeaderDialogOpen(false)}>Cancelar</Button><Button className="bg-orange-600 hover:bg-orange-700" onClick={saveHeaders}>Guardar Cambios</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-zinc-700" onClick={() => copyToClipboard(exportPgn, 'PGN')}><Copy className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-zinc-700" onClick={() => { const blob = new Blob([exportPgn], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'partida.pgn'; anchor.click(); URL.revokeObjectURL(url); }}><Download className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <div className="px-6 py-2 bg-zinc-800/30 border-b border-zinc-800 flex flex-col gap-1">
              <div className="flex justify-between text-xs"><div className="flex flex-col"><span className="text-[10px] text-zinc-500 uppercase font-bold">Blancas</span><span className="text-zinc-100 font-medium">{headerForm.White || '?'}</span></div><div className="flex flex-col items-center justify-center"><span className="text-xs font-bold text-orange-500">{headerForm.Result || '*'}</span></div><div className="flex flex-col items-end"><span className="text-[10px] text-zinc-500 uppercase font-bold">Negras</span><span className="text-zinc-100 font-medium">{headerForm.Black || '?'}</span></div></div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-mono border-t border-zinc-800/50 pt-1 mt-1"><span>{headerForm.Event || '?'}</span><span>{headerForm.Date || '????.??.??'}</span></div>
            </div>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                {notationContent ? (
                  <div className={notationView === 'table' ? 'overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 text-zinc-300' : 'text-sm leading-8 font-medium break-words text-zinc-300'}>
                    {notationContent}
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-600 italic">No hay movimientos registrados</div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-semibold flex items-center gap-2"><MessageSquarePlus className="w-5 h-5 text-orange-500" />Anotaciones</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {currentComment && <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-200 italic">"{currentComment}"</div>}
              <div className="flex gap-2"><Input placeholder="Anadir comentario al movimiento seleccionado..." className="bg-zinc-950 border-zinc-800 focus:ring-orange-500" value={annotation} onChange={(event) => setAnnotation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addAnnotation(); }} /><Button className="bg-orange-600 hover:bg-orange-700 shrink-0" onClick={addAnnotation}>Anadir</Button></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl overflow-hidden">
            <div className="p-4 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between"><span className="text-xs font-mono uppercase tracking-widest text-zinc-400">FEN Posicion Actual</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(currentPositionFen, 'FEN')}><Copy className="w-3 h-3" /></Button></div>
            <div className="p-4 font-mono text-[10px] break-all text-zinc-500 leading-relaxed">{currentPositionFen}</div>
          </Card>
        </div>
      </main>
      <footer className="border-t border-zinc-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-sm">
          <p>© 2026 Chess Graph & Analysis. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6"><a href="#" className="hover:text-orange-500 transition-colors">Documentacion</a><a href="#" className="hover:text-orange-500 transition-colors">Privacidad</a><a href="#" className="hover:text-orange-500 transition-colors">Terminos</a></div>
        </div>
      </footer>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[220px] rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.isMainLine ? (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
              onClick={() => truncateMainLine(contextMenu.moveIndex, contextMenu.historySans)}
            >
              Borrar jugadas posteriores
            </button>
          ) : (
            <>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                onClick={() => deleteVariation(contextMenu.linePath, contextMenu.historySans)}
              >
                Borrar variante entera
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                onClick={() => promoteVariation(contextMenu.linePath, contextMenu.historySans)}
              >
                Promocionar a variante principal
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
