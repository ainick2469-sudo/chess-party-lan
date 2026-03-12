import { randomUUID } from 'node:crypto';

import type { Color } from 'chessops/types';
import { WebSocket } from 'ws';

import {
  applyMoveToSnapshot,
  createInitialSnapshot,
  defaultLobbySettings,
  getClockPreset,
  replayHistory,
  sideToColorName,
  type ClockState,
  type ClientMessage,
  type GameSnapshot,
  type LobbySettings,
  type RematchOption,
  type RoomState,
  type ServerMessage,
  type ServerPrompt
} from '../../shared/src';

const RECONNECT_WINDOW_MS = 60_000;
const ROOM_CODE_ATTEMPTS = 500;
const VARIANT_ROTATION: LobbySettings['variant'][] = [
  'standard',
  'chess960',
  'king_of_the_hill',
  'three_check',
  'atomic'
];

interface InternalPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  sessionToken: string;
  socket?: WebSocket;
  seatColor?: Color;
  disconnectedAt?: number;
}

interface LiveClocks {
  lightMs: number | null;
  darkMs: number | null;
  incrementMs: number;
  activeColor?: Color;
  lastTickAt: number;
  history: Array<{ lightMs: number | null; darkMs: number | null; activeColor?: Color }>;
}

interface MatchState {
  snapshot: GameSnapshot;
  clocks: LiveClocks;
}

interface InternalRoom {
  roomCode: string;
  createdAt: number;
  hostPlayerId: string;
  phase: RoomState['phase'];
  settings: LobbySettings;
  players: InternalPlayer[];
  game?: MatchState;
  pendingTakeback?: ServerPrompt;
  pendingRematch?: ServerPrompt;
}

export class ClientFacingError extends Error {}

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly socketIndex = new Map<WebSocket, { roomCode: string; playerId: string }>();

  createRoom(playerName: string, socket: WebSocket, sessionToken?: string) {
    const normalizedName = sanitizeName(playerName);
    const roomCode = this.generateRoomCode();
    const playerId = randomUUID();
    const token = sessionToken && sessionToken.trim() ? sessionToken : randomUUID();
    const room: InternalRoom = {
      roomCode,
      createdAt: Date.now(),
      hostPlayerId: playerId,
      phase: 'lobby',
      settings: { ...defaultLobbySettings },
      players: [
        {
          id: playerId,
          name: normalizedName,
          isHost: true,
          ready: false,
          connected: true,
          sessionToken: token,
          socket
        }
      ]
    };

    this.rooms.set(roomCode, room);
    this.socketIndex.set(socket, { roomCode, playerId });
    this.pushSession(room, room.players[0]);
    this.broadcastRoom(room);
  }

  joinRoom(roomCode: string, playerName: string, socket: WebSocket, sessionToken?: string) {
    const room = this.mustGetRoom(roomCode);
    const normalizedName = sanitizeName(playerName);
    const existing = sessionToken ? room.players.find((player) => player.sessionToken === sessionToken) : undefined;

    if (existing) {
      existing.name = normalizedName;
      existing.connected = true;
      existing.disconnectedAt = undefined;
      existing.socket = socket;
      this.socketIndex.set(socket, { roomCode: room.roomCode, playerId: existing.id });
      this.pushSession(room, existing);
      this.broadcastRoom(room);
      if (room.game) this.broadcastGame(room);
      return;
    }

    if (room.players.length >= 2) {
      throw new ClientFacingError('That lobby is already full.');
    }

    const playerId = randomUUID();
    const token = sessionToken && sessionToken.trim() ? sessionToken : randomUUID();
    const player: InternalPlayer = {
      id: playerId,
      name: normalizedName,
      isHost: false,
      ready: false,
      connected: true,
      sessionToken: token,
      socket
    };

    room.players.push(player);
    this.socketIndex.set(socket, { roomCode: room.roomCode, playerId: player.id });
    this.pushSession(room, player);
    this.broadcastRoom(room);
    if (room.game) this.broadcastGame(room);
  }

  handleMessage(socket: WebSocket, message: ClientMessage) {
    switch (message.type) {
      case 'create_room':
        this.createRoom(message.playerName, socket, message.sessionToken);
        return;
      case 'join_room':
        this.joinRoom(message.roomCode, message.playerName, socket, message.sessionToken);
        return;
      default:
        break;
    }

    const context = this.socketIndex.get(socket);
    if (!context) {
      throw new ClientFacingError('You need to create or join a room first.');
    }

    const room = this.mustGetRoom(context.roomCode);
    const player = this.mustGetPlayer(room, context.playerId);

    switch (message.type) {
      case 'update_settings':
        this.updateSettings(room, player.id, message.settings);
        return;
      case 'set_ready':
        this.setReady(room, player.id, message.ready);
        return;
      case 'start_match':
        this.startMatch(room, 'same');
        return;
      case 'submit_move':
        this.submitMove(room, player.id, message.move);
        return;
      case 'request_takeback':
        this.requestTakeback(room, player.id);
        return;
      case 'respond_takeback':
        this.respondTakeback(room, player.id, message.promptId, message.accept);
        return;
      case 'request_rematch':
        this.handleRematch(room, player.id, message.option, message.action ?? 'request', message.promptId);
        return;
      case 'leave_room':
        this.leaveRoom(room, player.id, 'Player left the room.');
        return;
      default:
        return;
    }
  }

  handleDisconnect(socket: WebSocket) {
    const context = this.socketIndex.get(socket);
    if (!context) return;

    this.socketIndex.delete(socket);
    const room = this.rooms.get(context.roomCode);
    if (!room) return;

    const player = room.players.find((entry) => entry.id === context.playerId);
    if (!player) return;

    player.connected = false;
    player.socket = undefined;
    player.disconnectedAt = Date.now();

    this.broadcastRoom(room);
  }

  shutdown() {
    for (const room of this.rooms.values()) {
      this.broadcast(room, { type: 'room_closed', message: 'The host server shut down.' });
    }
    this.rooms.clear();
    this.socketIndex.clear();
  }

  tick() {
    const now = Date.now();

    for (const room of [...this.rooms.values()]) {
      this.expireDisconnectedPlayers(room, now);

      if (!room.game || room.phase !== 'playing') continue;

      const current = this.currentClocks(room.game, now);
      const expiredColor =
        current.lightMs !== null && current.lightMs <= 0
          ? 'white'
          : current.darkMs !== null && current.darkMs <= 0
            ? 'black'
            : undefined;

      if (expiredColor) {
        room.game.clocks.lightMs = current.lightMs;
        room.game.clocks.darkMs = current.darkMs;
        room.game.clocks.activeColor = undefined;
        room.game.clocks.lastTickAt = now;
        room.phase = 'finished';
        room.game.snapshot = {
          ...room.game.snapshot,
          status: 'timeout',
          winner: expiredColor === 'white' ? 'black' : 'white',
          clocks: { ...current, activeColor: undefined },
          outcomeText: `${sideToColorName(expiredColor === 'white' ? 'black' : 'white')} wins on time.`
        };
        this.broadcastRoom(room);
        this.broadcastGame(room);
        continue;
      }

      room.game.snapshot = {
        ...room.game.snapshot,
        clocks: current
      };
      this.broadcastGame(room);
    }
  }

  private updateSettings(room: InternalRoom, playerId: string, patch: Partial<LobbySettings>) {
    if (room.phase !== 'lobby') {
      throw new ClientFacingError('Settings can only be changed while the game is in the lobby.');
    }

    room.settings = {
      ...room.settings,
      ...patch
    };
    room.players.forEach((player) => {
      player.ready = false;
    });
    this.broadcastRoom(room);
  }

  private setReady(room: InternalRoom, playerId: string, ready: boolean) {
    if (room.phase !== 'lobby') {
      throw new ClientFacingError('Ready-up only works in the lobby.');
    }

    const player = this.mustGetPlayer(room, playerId);
    player.ready = ready;
    this.broadcastRoom(room);
  }

  private startMatch(room: InternalRoom, option: RematchOption) {
    if (room.players.length < 2) {
      throw new ClientFacingError('You need two players to start a match.');
    }

    if (room.phase === 'lobby' && room.players.some((player) => !player.ready)) {
      throw new ClientFacingError('Both players must be ready first.');
    }

    if (option === 'next_variant') {
      room.settings.variant = nextVariant(room.settings.variant);
    }

    const host = this.mustGetPlayer(room, room.hostPlayerId);
    const guest = room.players.find((player) => player.id !== room.hostPlayerId);
    if (!guest) {
      throw new ClientFacingError('A guest player has not joined yet.');
    }

    let hostColor: Color;
    if (option === 'swap' && host.seatColor) {
      hostColor = host.seatColor === 'white' ? 'black' : 'white';
    } else {
      hostColor = resolveHostColor(room.settings.sideAssignment);
    }

    host.seatColor = hostColor;
    guest.seatColor = hostColor === 'white' ? 'black' : 'white';

    const snapshot = createInitialSnapshot(room.settings, Date.now());
    const preset = getClockPreset(room.settings.clockPreset);
    const liveClocks: LiveClocks = {
      lightMs: snapshot.clocks.lightMs,
      darkMs: snapshot.clocks.darkMs,
      incrementMs: preset.incrementMs,
      activeColor: snapshot.clocks.activeColor,
      lastTickAt: Date.now(),
      history: [
        {
          lightMs: snapshot.clocks.lightMs,
          darkMs: snapshot.clocks.darkMs,
          activeColor: snapshot.clocks.activeColor
        }
      ]
    };

    room.phase = 'playing';
    room.pendingTakeback = undefined;
    room.pendingRematch = undefined;
    room.players.forEach((player) => {
      player.ready = false;
    });
    room.game = {
      snapshot,
      clocks: liveClocks
    };

    this.broadcastRoom(room);
    this.broadcastGame(room);
  }

  private submitMove(room: InternalRoom, playerId: string, move: string) {
    if (!room.game || room.phase !== 'playing') {
      throw new ClientFacingError('The match has not started yet.');
    }

    const player = this.mustGetPlayer(room, playerId);
    if (!player.seatColor || player.seatColor !== room.game.snapshot.turn) {
      throw new ClientFacingError('It is not your turn.');
    }

    const settled = this.settleClocks(room.game, Date.now());
    const expiredColor =
      settled.lightMs !== null && settled.lightMs <= 0
        ? 'white'
        : settled.darkMs !== null && settled.darkMs <= 0
          ? 'black'
          : undefined;

    if (expiredColor) {
      this.tick();
      return;
    }

    const applied = applyMoveToSnapshot(room.game.snapshot, room.settings, move, settled);
    const nextActiveColor = applied.snapshot.turn;
    const nextClocks = { ...settled, activeColor: nextActiveColor };

    if (nextActiveColor === 'white' && nextClocks.darkMs !== null) {
      nextClocks.darkMs += room.game.clocks.incrementMs;
    }
    if (nextActiveColor === 'black' && nextClocks.lightMs !== null) {
      nextClocks.lightMs += room.game.clocks.incrementMs;
    }

    room.game.clocks.lightMs = nextClocks.lightMs;
    room.game.clocks.darkMs = nextClocks.darkMs;
    room.game.clocks.activeColor = nextActiveColor;
    room.game.clocks.lastTickAt = Date.now();
    room.game.clocks.history.push({
      lightMs: nextClocks.lightMs,
      darkMs: nextClocks.darkMs,
      activeColor: nextActiveColor
    });

    room.game.snapshot = {
      ...applied.snapshot,
      clocks: nextClocks
    };

    if (room.game.snapshot.status !== 'active') {
      room.phase = 'finished';
      room.game.clocks.activeColor = undefined;
      room.game.snapshot = {
        ...room.game.snapshot,
        clocks: {
          lightMs: nextClocks.lightMs,
          darkMs: nextClocks.darkMs,
          activeColor: undefined
        }
      };
      this.broadcastRoom(room);
    }

    this.broadcastGame(room);
  }

  private requestTakeback(room: InternalRoom, playerId: string) {
    if (!room.game || room.phase !== 'playing') {
      throw new ClientFacingError('There is no active match to take back.');
    }
    if (room.settings.takebackPolicy === 'off') {
      throw new ClientFacingError('Takebacks are disabled in this lobby.');
    }
    if (room.game.snapshot.moveHistory.length === 0) {
      throw new ClientFacingError('No moves have been played yet.');
    }

    const opponent = room.players.find((player) => player.id !== playerId);
    if (!opponent || !opponent.socket) {
      throw new ClientFacingError('Your opponent is not connected right now.');
    }

    const requester = this.mustGetPlayer(room, playerId);
    const prompt: ServerPrompt = {
      id: randomUUID(),
      kind: 'takeback_request',
      fromPlayerId: requester.id,
      text: `${requester.name} wants to take back the last move.`
    };

    room.pendingTakeback = prompt;
    this.send(opponent.socket, { type: 'prompt', prompt });
  }

  private respondTakeback(room: InternalRoom, playerId: string, promptId: string, accept: boolean) {
    if (!room.game || !room.pendingTakeback) {
      throw new ClientFacingError('There is no takeback request to answer.');
    }
    if (room.pendingTakeback.id !== promptId) {
      throw new ClientFacingError('That takeback request is no longer active.');
    }
    if (room.pendingTakeback.fromPlayerId === playerId) {
      throw new ClientFacingError('You cannot answer your own takeback request.');
    }

    const requester = this.mustGetPlayer(room, room.pendingTakeback.fromPlayerId);
    const responder = this.mustGetPlayer(room, playerId);
    const pending = room.pendingTakeback;
    room.pendingTakeback = undefined;

    if (!accept) {
      if (requester.socket) {
        this.send(requester.socket, {
          type: 'error',
          message: `${responder.name} declined the takeback request.`
        });
      }
      return;
    }

    const moveHistory = room.game.snapshot.moveHistory.slice(0, -1);
    const sanHistory = room.game.snapshot.sanHistory.slice(0, -1);
    const previousClocks =
      room.game.clocks.history[Math.max(0, room.game.clocks.history.length - 2)] ??
      room.game.clocks.history[0];

    room.game.clocks.history.pop();
    room.game.clocks.lightMs = previousClocks.lightMs;
    room.game.clocks.darkMs = previousClocks.darkMs;
    room.game.clocks.activeColor = previousClocks.activeColor;
    room.game.clocks.lastTickAt = Date.now();

    const rebuilt = replayHistory(
      room.settings.variant,
      room.game.snapshot.initialFen,
      moveHistory,
      room.settings,
      previousClocks
    );

    room.phase = rebuilt.status === 'active' ? 'playing' : 'finished';
    room.game.snapshot = {
      ...rebuilt,
      sanHistory
    };

    if (requester.socket) {
      this.send(requester.socket, {
        type: 'error',
        message: `${responder.name} accepted the takeback.`
      });
    }

    this.broadcastRoom(room);
    this.broadcastGame(room);
  }

  private handleRematch(
    room: InternalRoom,
    playerId: string,
    option: RematchOption,
    action: 'request' | 'accept' | 'decline',
    promptId?: string
  ) {
    if (room.phase !== 'finished') {
      throw new ClientFacingError('Rematches become available after a round ends.');
    }

    const player = this.mustGetPlayer(room, playerId);
    const opponent = room.players.find((entry) => entry.id !== playerId);
    if (!opponent) {
      throw new ClientFacingError('An opponent is required for a rematch.');
    }

    if (action === 'request') {
      const prompt: ServerPrompt = {
        id: randomUUID(),
        kind: 'rematch_request',
        fromPlayerId: playerId,
        option,
        text: `${player.name} wants a ${rematchLabel(option)} rematch.`
      };
      room.pendingRematch = prompt;
      if (opponent.socket) {
        this.send(opponent.socket, { type: 'prompt', prompt });
      }
      return;
    }

    if (!room.pendingRematch || room.pendingRematch.id !== promptId) {
      throw new ClientFacingError('That rematch request is no longer active.');
    }

    if (action === 'decline') {
      room.pendingRematch = undefined;
      if (opponent.socket) {
        this.send(opponent.socket, {
          type: 'error',
          message: `${player.name} declined the rematch.`
        });
      }
      return;
    }

    const acceptedOption = room.pendingRematch.option ?? option;
    room.pendingRematch = undefined;
    this.startMatch(room, acceptedOption);
  }

  private leaveRoom(room: InternalRoom, playerId: string, message: string) {
    const player = this.mustGetPlayer(room, playerId);
    if (player.isHost) {
      this.broadcast(room, { type: 'room_closed', message });
      this.rooms.delete(room.roomCode);
      return;
    }

    room.players = room.players.filter((entry) => entry.id !== playerId);
    room.phase = 'lobby';
    room.game = undefined;
    room.pendingTakeback = undefined;
    room.pendingRematch = undefined;
    this.broadcastRoom(room);
  }

  private expireDisconnectedPlayers(room: InternalRoom, now: number) {
    const host = room.players.find((player) => player.isHost);
    const disconnected = room.players.filter(
      (player) => !player.connected && player.disconnectedAt !== undefined && now - player.disconnectedAt > RECONNECT_WINDOW_MS
    );

    if (disconnected.length === 0) return;

    if (host && disconnected.some((player) => player.id === host.id)) {
      this.broadcast(room, { type: 'room_closed', message: 'The host did not reconnect in time.' });
      this.rooms.delete(room.roomCode);
      return;
    }

    const guestExpired = disconnected.find((player) => !player.isHost);
    if (!guestExpired) return;

    this.broadcast(room, { type: 'room_closed', message: `${guestExpired.name} did not reconnect in time.` });
    this.rooms.delete(room.roomCode);
  }

  private currentClocks(game: MatchState, now: number): ClockState {
    if (game.clocks.activeColor === undefined) {
      return {
        lightMs: game.clocks.lightMs,
        darkMs: game.clocks.darkMs,
        activeColor: undefined
      };
    }

    if (game.clocks.lightMs === null || game.clocks.darkMs === null) {
      return {
        lightMs: game.clocks.lightMs,
        darkMs: game.clocks.darkMs,
        activeColor: undefined
      };
    }

    const elapsed = Math.max(0, now - game.clocks.lastTickAt);
    if (game.clocks.activeColor === 'white') {
      return {
        lightMs: Math.max(0, game.clocks.lightMs - elapsed),
        darkMs: game.clocks.darkMs,
        activeColor: 'white'
      };
    }

    return {
      lightMs: game.clocks.lightMs,
      darkMs: Math.max(0, game.clocks.darkMs - elapsed),
      activeColor: 'black'
    };
  }

  private settleClocks(game: MatchState, now: number) {
    const current = this.currentClocks(game, now);
    game.clocks.lightMs = current.lightMs;
    game.clocks.darkMs = current.darkMs;
    game.clocks.activeColor = current.activeColor;
    game.clocks.lastTickAt = now;
    return current;
  }

  private serializeRoom(room: InternalRoom): RoomState {
    return {
      roomCode: room.roomCode,
      createdAt: room.createdAt,
      hostPlayerId: room.hostPlayerId,
      phase: room.phase,
      settings: room.settings,
      readyStates: Object.fromEntries(room.players.map((player) => [player.id, player.ready])),
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        connected: player.connected,
        isHost: player.isHost,
        seatColor: player.seatColor
      }))
    };
  }

  private broadcastRoom(room: InternalRoom) {
    for (const player of room.players) {
      if (!player.socket) continue;
      this.send(player.socket, {
        type: 'room_state',
        room: {
          ...this.serializeRoom(room),
          localPlayerId: player.id,
          localSeatColor: player.seatColor
        }
      });
    }
  }

  private broadcastGame(room: InternalRoom) {
    if (!room.game) return;
    this.broadcast(room, { type: 'game_state', game: room.game.snapshot });
  }

  private broadcast(room: InternalRoom, message: ServerMessage) {
    for (const player of room.players) {
      if (!player.socket) continue;
      this.send(player.socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private pushSession(room: InternalRoom, player: InternalPlayer) {
    if (!player.socket) return;
    this.send(player.socket, {
      type: 'session',
      session: {
        sessionToken: player.sessionToken,
        playerId: player.id,
        playerName: player.name,
        roomCode: room.roomCode
      }
    });
  }

  private mustGetRoom(roomCode: string) {
    const room = this.rooms.get(roomCode.trim());
    if (!room) {
      throw new ClientFacingError('That room code does not exist on this host.');
    }
    return room;
  }

  private mustGetPlayer(room: InternalRoom, playerId: string) {
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new ClientFacingError('That player is no longer in the room.');
    }
    return player;
  }

  private generateRoomCode() {
    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Unable to generate a unique room code.');
  }
}

function resolveHostColor(sideAssignment: LobbySettings['sideAssignment']): Color {
  if (sideAssignment === 'host_light') return 'white';
  if (sideAssignment === 'host_dark') return 'black';
  return Math.random() > 0.5 ? 'white' : 'black';
}

function nextVariant(current: LobbySettings['variant']): LobbySettings['variant'] {
  const index = VARIANT_ROTATION.indexOf(current);
  return VARIANT_ROTATION[(index + 1) % VARIANT_ROTATION.length];
}

function sanitizeName(value: string) {
  const trimmed = value.trim().slice(0, 20);
  return trimmed || 'Player';
}

function rematchLabel(option: RematchOption) {
  if (option === 'swap') return 'side-swap';
  if (option === 'next_variant') return 'next-variant';
  return 'same-settings';
}
