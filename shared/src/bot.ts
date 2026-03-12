import type { Color, Role } from 'chessops/types';

import { applyMoveToSnapshot } from './rules';
import type { BoardPiece, GameSnapshot, LobbySettings } from './types';

export type BotDifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface BotDifficultyProfile {
  level: BotDifficultyLevel;
  name: string;
  summary: string;
  searchDepth: number;
  branchLimit: number;
  thinkTimeMs: number;
  choiceWindow: number;
}

const BOT_DIFFICULTIES: BotDifficultyProfile[] = [
  { level: 1, name: 'Starter', summary: 'Fast and loose. It sees only the most obvious reply.', searchDepth: 1, branchLimit: 5, thinkTimeMs: 120, choiceWindow: 4 },
  { level: 2, name: 'Casual', summary: 'Still blunders, but it stops dropping pieces quite so freely.', searchDepth: 1, branchLimit: 7, thinkTimeMs: 160, choiceWindow: 4 },
  { level: 3, name: 'Apprentice', summary: 'Begins spotting simple tactics and cleaner captures.', searchDepth: 2, branchLimit: 6, thinkTimeMs: 210, choiceWindow: 3 },
  { level: 4, name: 'Challenger', summary: 'Keeps a steadier opening and punishes obvious mistakes.', searchDepth: 2, branchLimit: 8, thinkTimeMs: 280, choiceWindow: 3 },
  { level: 5, name: 'Planner', summary: 'Balances material, center control, and straightforward threats.', searchDepth: 2, branchLimit: 10, thinkTimeMs: 360, choiceWindow: 2 },
  { level: 6, name: 'Tactician', summary: 'Searches deeper and starts converting advantages reliably.', searchDepth: 3, branchLimit: 10, thinkTimeMs: 480, choiceWindow: 2 },
  { level: 7, name: 'Veteran', summary: 'Sharper calculation with fewer casual blunders.', searchDepth: 3, branchLimit: 12, thinkTimeMs: 620, choiceWindow: 2 },
  { level: 8, name: 'Expert', summary: 'Good tactical vision and more disciplined move ordering.', searchDepth: 3, branchLimit: 16, thinkTimeMs: 800, choiceWindow: 1 },
  { level: 9, name: 'Master', summary: 'Deep enough to punish loose play and finish forcing lines.', searchDepth: 4, branchLimit: 16, thinkTimeMs: 980, choiceWindow: 1 },
  { level: 10, name: 'Apex', summary: 'The strongest local search this build can sustain without freezing the UI.', searchDepth: 4, branchLimit: 20, thinkTimeMs: 1250, choiceWindow: 1 }
];

const PIECE_VALUES: Record<Role, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0
};

const CENTER_SQUARES = new Set(['d4', 'e4', 'd5', 'e5']);
const EXTENDED_CENTER = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);

export const botDifficultyProfiles = BOT_DIFFICULTIES;

export function getBotDifficulty(level: number): BotDifficultyProfile {
  return BOT_DIFFICULTIES.find((entry) => entry.level === level) ?? BOT_DIFFICULTIES[4];
}

export function chooseBotMove(snapshot: GameSnapshot, settings: LobbySettings, level: number): string | undefined {
  if (snapshot.status !== 'active') return undefined;

  const difficulty = getBotDifficulty(level);
  const deadline = Date.now() + difficulty.thinkTimeMs;
  const allRootMoves = buildLegalMoves(snapshot);
  if (allRootMoves.length === 0) return undefined;

  for (const move of allRootMoves) {
    const nextSnapshot = applyMoveToSnapshot(snapshot, settings, move, snapshot.clocks).snapshot;
    if (nextSnapshot.status !== 'active' && nextSnapshot.winner === snapshot.turn) {
      return move;
    }
  }

  const rootMoves = allRootMoves
    .map((move) => ({ move, quick: quickMoveScore(snapshot, move, snapshot.turn) }))
    .sort((left, right) => right.quick - left.quick)
    .slice(0, Math.min(difficulty.branchLimit, allRootMoves.length))
    .map((entry) => entry.move);

  const scored = rootMoves.map((move) => {
    const nextSnapshot = applyMoveToSnapshot(snapshot, settings, move, snapshot.clocks).snapshot;
    const score = -searchPosition(
      nextSnapshot,
      settings,
      difficulty.searchDepth - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      snapshot.turn,
      deadline,
      Math.max(4, difficulty.branchLimit - 2),
      1
    );

    return { move, score };
  });

  scored.sort((left, right) => right.score - left.score);
  const choicePool = scored.slice(0, Math.min(scored.length, difficulty.choiceWindow));
  if (choicePool.length === 1) return choicePool[0].move;

  const bestScore = choicePool[0].score;
  const weighted = choicePool.map((entry, index) => ({
    ...entry,
    weight: Math.max(1, Math.round((bestScore - entry.score) * -0.04 + (choicePool.length - index) * 2))
  }));

  let total = 0;
  for (const entry of weighted) total += entry.weight;
  let needle = Math.random() * total;
  for (const entry of weighted) {
    needle -= entry.weight;
    if (needle <= 0) return entry.move;
  }

  return weighted[0].move;
}

function searchPosition(
  snapshot: GameSnapshot,
  settings: LobbySettings,
  depth: number,
  alpha: number,
  beta: number,
  maximizingColor: Color,
  deadline: number,
  branchLimit: number,
  ply: number
): number {
  if (snapshot.status !== 'active') {
    return terminalScore(snapshot, maximizingColor, ply);
  }

  if (depth <= 0 || Date.now() >= deadline) {
    return evaluatePosition(snapshot, maximizingColor);
  }

  const candidateMoves = rankMoves(snapshot, settings, maximizingColor, branchLimit);
  if (candidateMoves.length === 0) {
    return evaluatePosition(snapshot, maximizingColor);
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let localAlpha = alpha;

  for (const move of candidateMoves) {
    if (Date.now() >= deadline) break;

    const nextSnapshot = applyMoveToSnapshot(snapshot, settings, move, snapshot.clocks).snapshot;
    const score = -searchPosition(
      nextSnapshot,
      settings,
      depth - 1,
      -beta,
      -localAlpha,
      maximizingColor,
      deadline,
      Math.max(4, branchLimit - 1),
      ply + 1
    );

    if (score > bestScore) bestScore = score;
    if (score > localAlpha) localAlpha = score;
    if (localAlpha >= beta) break;
  }

  if (bestScore === Number.NEGATIVE_INFINITY) {
    return evaluatePosition(snapshot, maximizingColor);
  }

  return bestScore;
}

function rankMoves(snapshot: GameSnapshot, settings: LobbySettings, maximizingColor: Color, branchLimit: number) {
  const candidates = buildLegalMoves(snapshot).map((move) => {
    const quick = quickMoveScore(snapshot, move, maximizingColor);
    return { move, quick };
  });

  candidates.sort((left, right) => right.quick - left.quick);
  return candidates.slice(0, Math.min(branchLimit, candidates.length)).map((entry) => entry.move);
}

function buildLegalMoves(snapshot: GameSnapshot) {
  const moves: string[] = [];

  for (const piece of snapshot.pieces) {
    if (piece.color !== snapshot.turn) continue;

    const destinations = snapshot.legalDestinations[piece.square] ?? [];
    for (const destination of destinations) {
      moves.push(buildMove(snapshot, piece.square, destination));
    }
  }

  return moves;
}

function buildMove(snapshot: GameSnapshot, from: string, to: string) {
  const piece = snapshot.pieces.find((entry) => entry.square === from);
  if (piece?.role === 'pawn') {
    if ((piece.color === 'white' && to.endsWith('8')) || (piece.color === 'black' && to.endsWith('1'))) {
      return `${from}${to}q`;
    }
  }
  return `${from}${to}`;
}

function quickMoveScore(snapshot: GameSnapshot, move: string, maximizingColor: Color) {
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const mover = snapshot.pieces.find((piece) => piece.square === from);
  const captured = snapshot.pieces.find((piece) => piece.square === to);
  let score = 0;

  if (captured) {
    score += PIECE_VALUES[captured.role] * 4 - (mover ? PIECE_VALUES[mover.role] : 0);
  }
  if (move.length === 5) score += 380;
  if (CENTER_SQUARES.has(to)) score += 60;
  if (EXTENDED_CENTER.has(to)) score += 24;
  if (mover?.role === 'king' && isKingHillVariant(snapshot)) score += kingDistanceBonus(to) * 18;
  if (snapshot.turn === maximizingColor) score += 8;

  return score;
}

function evaluatePosition(snapshot: GameSnapshot, maximizingColor: Color) {
  if (snapshot.status !== 'active') {
    return terminalScore(snapshot, maximizingColor, 0);
  }

  let score = 0;
  let maximizingKingSquare = '';
  let minimizingKingSquare = '';

  for (const piece of snapshot.pieces) {
    const sign = piece.color === maximizingColor ? 1 : -1;
    score += PIECE_VALUES[piece.role] * sign;
    score += positionalBonus(piece) * sign;

    if (piece.role === 'king') {
      if (piece.color === maximizingColor) maximizingKingSquare = piece.square;
      else minimizingKingSquare = piece.square;
    }
  }

  const mobility = Object.values(snapshot.legalDestinations).reduce((total, destinations) => total + destinations.length, 0);
  score += (snapshot.turn === maximizingColor ? 1 : -1) * mobility * 1.5;

  if (snapshot.inCheck) {
    score += snapshot.turn === maximizingColor ? -42 : 42;
  }

  if (snapshot.checksRemaining) {
    const selfRemaining = maximizingColor === 'white' ? snapshot.checksRemaining.light : snapshot.checksRemaining.dark;
    const oppRemaining = maximizingColor === 'white' ? snapshot.checksRemaining.dark : snapshot.checksRemaining.light;
    score += (oppRemaining - selfRemaining) * 85;
  }

  if (snapshot.variant === 'king_of_the_hill') {
    score += kingDistanceBonus(maximizingKingSquare) * 22;
    score -= kingDistanceBonus(minimizingKingSquare) * 22;
  }

  if (snapshot.variant === 'atomic') {
    score += explosionPressure(snapshot, maximizingColor);
  }

  return score;
}

function positionalBonus(piece: BoardPiece) {
  let bonus = 0;
  if (CENTER_SQUARES.has(piece.square)) bonus += 24;
  else if (EXTENDED_CENTER.has(piece.square)) bonus += 10;

  if (piece.role === 'pawn') {
    const rank = Number(piece.square[1]);
    bonus += piece.color === 'white' ? (rank - 2) * 8 : (7 - rank) * 8;
  }

  return bonus;
}

function explosionPressure(snapshot: GameSnapshot, maximizingColor: Color) {
  let score = 0;
  for (const piece of snapshot.pieces) {
    if (piece.role === 'king') continue;
    const sign = piece.color === maximizingColor ? 1 : -1;
    if (CENTER_SQUARES.has(piece.square)) score += sign * 12;
  }
  return score;
}

function terminalScore(snapshot: GameSnapshot, maximizingColor: Color, ply: number) {
  if (!snapshot.winner) return 0;
  const signed = snapshot.winner === maximizingColor ? 1 : -1;
  return signed * (100_000 - ply * 240);
}

function isKingHillVariant(snapshot: GameSnapshot) {
  return snapshot.variant === 'king_of_the_hill';
}

function kingDistanceBonus(square: string) {
  if (!square) return 0;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const distance = Math.abs(file - 3.5) + Math.abs(rank - 3.5);
  return Math.max(0, 7 - distance);
}
