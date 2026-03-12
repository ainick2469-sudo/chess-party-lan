import { describe, expect, it } from 'vitest';

import { applyMoveToSnapshot, chooseBotMove, createInitialSnapshot, defaultLobbySettings, replayHistory } from '../shared/src';

describe('shared rules adapter', () => {
  it('creates a standard opening position with legal pawn pushes', () => {
    const snapshot = createInitialSnapshot(defaultLobbySettings, 1);
    expect(snapshot.variant).toBe('standard');
    expect(snapshot.legalDestinations.e2).toContain('e4');
  });

  it('creates a valid chess960 back rank', () => {
    const snapshot = createInitialSnapshot({ ...defaultLobbySettings, variant: 'chess960' }, 42);
    const backRank = snapshot.pieces.filter((piece) => piece.color === 'white' && piece.square.endsWith('1'));
    const bishops = backRank.filter((piece) => piece.role === 'bishop');
    const king = backRank.find((piece) => piece.role === 'king');
    const rooks = backRank.filter((piece) => piece.role === 'rook');

    expect(backRank).toHaveLength(8);
    expect(bishops).toHaveLength(2);
    expect(rooks).toHaveLength(2);
    expect(king).toBeTruthy();
  });

  it('tracks three-check counters', () => {
    const snapshot = createInitialSnapshot({ ...defaultLobbySettings, variant: 'three_check' }, 7);
    expect(snapshot.checksRemaining).toEqual({ light: 3, dark: 3 });
  });

  it('replays history back to the same position', () => {
    const first = createInitialSnapshot(defaultLobbySettings, 1);
    const second = applyMoveToSnapshot(first, defaultLobbySettings, 'e2e4').snapshot;
    const third = applyMoveToSnapshot(second, defaultLobbySettings, 'e7e5').snapshot;
    const replayed = replayHistory('standard', first.initialFen, third.moveHistory, defaultLobbySettings, third.clocks);

    expect(replayed.fen).toBe(third.fen);
    expect(replayed.moveHistory).toEqual(third.moveHistory);
  });

  it('lets the strongest bot finish a forced mate in one', () => {
    const first = createInitialSnapshot(defaultLobbySettings, 1);
    const second = applyMoveToSnapshot(first, defaultLobbySettings, 'f2f3').snapshot;
    const third = applyMoveToSnapshot(second, defaultLobbySettings, 'e7e5').snapshot;
    const fourth = applyMoveToSnapshot(third, defaultLobbySettings, 'g2g4').snapshot;

    const move = chooseBotMove(fourth, defaultLobbySettings, 10);

    expect(move).toBe('d8h4');
  });
});
