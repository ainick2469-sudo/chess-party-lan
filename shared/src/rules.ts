import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { defaultSetup, type Setup } from 'chessops/setup';
import { Color, Move, Role } from 'chessops/types';
import { makeSquare, parseSquare, parseUci, squareFromCoords } from 'chessops/util';
import { Atomic, Chess, KingOfTheHill, Position, ThreeCheck } from 'chessops/variant';
import { SquareSet } from 'chessops/squareSet';

import { getClockPreset } from './presets';
import type { BoardPiece, ClockState, GameSnapshot, LobbySettings, VariantId } from './types';

type RulesPosition = Position;

export interface AppliedMoveResult {
  snapshot: GameSnapshot;
  san: string;
}

function variantToRulesId(variant: VariantId): 'chess' | 'kingofthehill' | '3check' | 'atomic' {
  switch (variant) {
    case 'standard':
    case 'chess960':
      return 'chess';
    case 'king_of_the_hill':
      return 'kingofthehill';
    case 'three_check':
      return '3check';
    case 'atomic':
      return 'atomic';
  }
}

function createChess960Setup(seed: number) {
  const rng = mulberry32(seed);
  const backRank: Role[] = new Array(8).fill('pawn');
  const remaining = [0, 1, 2, 3, 4, 5, 6, 7];

  const darkSquares = [0, 2, 4, 6];
  const lightSquares = [1, 3, 5, 7];
  const bishopA = darkSquares[Math.floor(rng() * darkSquares.length)];
  const bishopB = lightSquares[Math.floor(rng() * lightSquares.length)];
  backRank[bishopA] = 'bishop';
  backRank[bishopB] = 'bishop';

  removeIndex(remaining, bishopA);
  removeIndex(remaining, bishopB);

  const queenSquare = remaining.splice(Math.floor(rng() * remaining.length), 1)[0];
  backRank[queenSquare] = 'queen';

  const knightSquareA = remaining.splice(Math.floor(rng() * remaining.length), 1)[0];
  const knightSquareB = remaining.splice(Math.floor(rng() * remaining.length), 1)[0];
  backRank[knightSquareA] = 'knight';
  backRank[knightSquareB] = 'knight';

  remaining.sort((left, right) => left - right);
  backRank[remaining[0]] = 'rook';
  backRank[remaining[1]] = 'king';
  backRank[remaining[2]] = 'rook';

  const setup = defaultSetup();
  setup.board.clear();
  setup.castlingRights = SquareSet.empty();

  for (let file = 0; file < 8; file += 1) {
    const whiteBackSquare = squareFromCoords(file, 0);
    const whitePawnSquare = squareFromCoords(file, 1);
    const blackPawnSquare = squareFromCoords(file, 6);
    const blackBackSquare = squareFromCoords(file, 7);
    const role = backRank[file];

    if (
      whiteBackSquare === undefined ||
      whitePawnSquare === undefined ||
      blackPawnSquare === undefined ||
      blackBackSquare === undefined
    ) {
      throw new Error('Failed to generate Chess960 board coordinates.');
    }

    setup.board.set(whiteBackSquare, { color: 'white', role });
    setup.board.set(whitePawnSquare, { color: 'white', role: 'pawn' });
    setup.board.set(blackPawnSquare, { color: 'black', role: 'pawn' });
    setup.board.set(blackBackSquare, { color: 'black', role });

    if (role === 'rook') {
      setup.castlingRights = setup.castlingRights.with(whiteBackSquare).with(blackBackSquare);
    }
  }

  return setup;
}

function removeIndex(values: number[], target: number) {
  const index = values.indexOf(target);
  if (index >= 0) values.splice(index, 1);
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createInitialSnapshot(settings: LobbySettings, seed = Date.now()): GameSnapshot {
  const position = createInitialPosition(settings.variant, seed);
  const initialFen = makeFen(position.toSetup());
  return serializeGame(position, settings, {
    initialFen,
    moveHistory: [],
    sanHistory: []
  });
}

export function restorePosition(snapshot: Pick<GameSnapshot, 'variant' | 'fen'>): RulesPosition {
  const parsed = parseFen(snapshot.fen);
  if (parsed.isErr) {
    throw parsed.error;
  }

  const setup = parsed.value;

  switch (snapshot.variant) {
    case 'standard':
    case 'chess960': {
      const result = Chess.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'king_of_the_hill': {
      const result = KingOfTheHill.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'three_check': {
      const result = ThreeCheck.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'atomic': {
      const result = Atomic.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
  }
}

function createInitialPosition(variant: VariantId, seed: number): RulesPosition {
  switch (variant) {
    case 'standard':
      return Chess.default();
    case 'chess960': {
      const result = Chess.fromSetup(createChess960Setup(seed));
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'king_of_the_hill':
      return KingOfTheHill.default();
    case 'three_check':
      return ThreeCheck.default();
    case 'atomic':
      return Atomic.default();
  }
}

export function serializeGame(
  position: RulesPosition,
  settings: LobbySettings,
  history: {
    initialFen: string;
    moveHistory: string[];
    sanHistory: string[];
    lastMove?: string;
    clocks?: { lightMs: number | null; darkMs: number | null; activeColor?: Color };
  }
): GameSnapshot {
  const legalDestinations: Record<string, string[]> = {};
  const allDests = position.allDests();

  for (const [square, dests] of allDests.entries()) {
    legalDestinations[makeSquare(square)] = [...dests].map((dest) => makeSquare(dest));
  }

  const pieces: BoardPiece[] = [];
  for (const [square, piece] of position.board) {
    pieces.push({
      square: makeSquare(square),
      role: piece.role,
      color: piece.color,
      promoted: piece.promoted
    });
  }

  const outcome = position.outcome();
  const isVariantEnd = position.isVariantEnd();
  const isCheckmate = position.isCheckmate();
  const isStalemate = position.isStalemate();
  const clocks: ClockState = history.clocks ?? defaultClockState(settings.clockPreset);
  const status = resolveStatus(position, clocks);
  const winner =
    status === 'timeout'
      ? clocks.activeColor === 'white'
        ? 'black'
        : 'white'
      : outcome?.winner;

  return {
    variant: settings.variant,
    initialFen: history.initialFen,
    fen: makeFen(position.toSetup()),
    turn: position.turn,
    moveHistory: [...history.moveHistory],
    sanHistory: [...history.sanHistory],
    legalDestinations,
    lastMove: history.lastMove,
    lastMoveSquares: history.lastMove ? uciToSquares(history.lastMove) : undefined,
    pieces,
    status,
    winner,
    outcomeText: makeOutcomeText({
      status,
      winner,
      isCheckmate,
      isStalemate,
      isVariantEnd,
      variant: settings.variant
    }),
    checksRemaining: position.remainingChecks
      ? {
          light: position.remainingChecks.white,
          dark: position.remainingChecks.black
        }
      : undefined,
    clocks,
    inCheck: position.isCheck()
  };
}

function defaultClockState(clockPreset: LobbySettings['clockPreset']): ClockState {
  const preset = getClockPreset(clockPreset);
  return {
    lightMs: preset.initialMs,
    darkMs: preset.initialMs,
    activeColor: preset.initialMs === null ? undefined : 'white'
  };
}

function resolveStatus(
  position: RulesPosition,
  clocks: { lightMs: number | null; darkMs: number | null; activeColor?: Color }
): GameSnapshot['status'] {
  if (clocks.lightMs !== null && clocks.lightMs <= 0) return 'timeout';
  if (clocks.darkMs !== null && clocks.darkMs <= 0) return 'timeout';
  if (!position.isEnd()) return 'active';
  if (position.isCheckmate()) return 'checkmate';
  if (position.isStalemate()) return 'stalemate';
  if (position.isVariantEnd()) return 'variant_win';
  return 'draw';
}

function makeOutcomeText({
  status,
  winner,
  isCheckmate,
  isStalemate,
  isVariantEnd,
  variant
}: {
  status: GameSnapshot['status'];
  winner?: Color;
  isCheckmate: boolean;
  isStalemate: boolean;
  isVariantEnd: boolean;
  variant: VariantId;
}) {
  if (status === 'timeout') {
    return `${sideLabel(winner)} wins on time.`;
  }

  if (isCheckmate) {
    return `${sideLabel(winner)} wins by checkmate.`;
  }

  if (isStalemate) {
    return 'Draw by stalemate.';
  }

  if (isVariantEnd) {
    if (variant === 'king_of_the_hill') return `${sideLabel(winner)} reached the hill.`;
    if (variant === 'three_check') return `${sideLabel(winner)} landed the final check.`;
    if (variant === 'atomic') return `${sideLabel(winner)} detonated the king.`;
  }

  if (status === 'draw') {
    return 'Draw.';
  }

  return `${sideLabel('white')} to move.`;
}

function sideLabel(color?: Color) {
  if (color === 'black') return 'Dark side';
  return 'Light side';
}

export function applyMoveToSnapshot(
  snapshot: GameSnapshot,
  settings: LobbySettings,
  moveUci: string,
  clocks?: { lightMs: number | null; darkMs: number | null; activeColor?: Color }
): AppliedMoveResult {
  const position = restorePosition(snapshot);
  const move = parseUci(moveUci);

  if (!move) {
    throw new Error('That move format did not make sense.');
  }

  if (!position.isLegal(move)) {
    throw new Error('That move is illegal in the current position.');
  }

  const san = makeSanAndPlay(position, move);
  const nextSnapshot = serializeGame(position, settings, {
    initialFen: snapshot.initialFen,
    moveHistory: [...snapshot.moveHistory, moveUci],
    sanHistory: [...snapshot.sanHistory, san],
    lastMove: moveUci,
    clocks
  });

  return {
    snapshot: nextSnapshot,
    san
  };
}

export function replayHistory(
  variant: VariantId,
  initialFen: string,
  moves: string[],
  settings: LobbySettings,
  clocks?: { lightMs: number | null; darkMs: number | null; activeColor?: Color }
): GameSnapshot {
  const parsed = parseFen(initialFen);
  if (parsed.isErr) throw parsed.error;

  let snapshot = serializeGame(positionFromVariantAndSetup(variant, parsed.value), settings, {
    initialFen,
    moveHistory: [],
    sanHistory: [],
    clocks
  });

  for (const move of moves) {
    snapshot = applyMoveToSnapshot(snapshot, settings, move, snapshot.clocks).snapshot;
  }

  return snapshot;
}

function positionFromVariantAndSetup(variant: VariantId, setup: Setup): RulesPosition {
  switch (variant) {
    case 'standard':
    case 'chess960': {
      const result = Chess.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'king_of_the_hill': {
      const result = KingOfTheHill.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'three_check': {
      const result = ThreeCheck.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
    case 'atomic': {
      const result = Atomic.fromSetup(setup);
      if (result.isErr) throw result.error;
      return result.value;
    }
  }
}

export function getPieceGuideText(role: Role) {
  switch (role) {
    case 'pawn':
      return 'Pawns move forward, capture diagonally, and promote when they reach the far edge.';
    case 'knight':
      return 'Knights jump in an L-shape and ignore blocking pieces.';
    case 'bishop':
      return 'Bishops slide diagonally across the board.';
    case 'rook':
      return 'Rooks slide straight along ranks and files.';
    case 'queen':
      return 'The queen combines rook and bishop movement.';
    case 'king':
      return 'The king moves one square in any direction and must stay safe.';
  }
}

export function sideToColorName(color: Color) {
  return color === 'white' ? 'Light side' : 'Dark side';
}

export function uciToSquares(moveUci: string): [string, string] | undefined {
  if (moveUci.length < 4) return undefined;
  return [moveUci.slice(0, 2), moveUci.slice(2, 4)];
}

export function squareNameToCoords(square: string) {
  const parsed = parseSquare(square);
  if (parsed === undefined) return undefined;
  return {
    file: parsed % 8,
    rank: Math.floor(parsed / 8)
  };
}
