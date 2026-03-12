import type { Color, Role } from 'chessops/types';

export type VariantId = 'standard' | 'chess960' | 'king_of_the_hill' | 'three_check' | 'atomic';
export type ThemePreset = 'study' | 'neon' | 'marble';
export type ClockPresetId = 'untimed' | '5+0' | '10+0' | '10+5' | '15+10';
export type SideAssignment = 'host_light' | 'host_dark' | 'random';
export type TakebackPolicy = 'off' | 'mutual';
export type AssistPreset = 'medium';
export type CameraPreset = 'cozy' | 'competitive' | 'dramatic';
export type AnimationIntensity = 'reduced' | 'normal' | 'lively';
export type PieceSetId = 'stevenalbert';
export type ScenePresetId = 'parlor' | 'skyline' | 'vault';
export type RoomPhase = 'landing' | 'lobby' | 'playing' | 'finished';
export type GameStatus = 'waiting' | 'active' | 'checkmate' | 'stalemate' | 'draw' | 'variant_win' | 'timeout';
export type RematchOption = 'same' | 'swap' | 'next_variant';
export type PromptKind = 'takeback_request' | 'rematch_request';

export interface LobbySettings {
  variant: VariantId;
  clockPreset: ClockPresetId;
  sideAssignment: SideAssignment;
  takebackPolicy: TakebackPolicy;
  assistPreset: AssistPreset;
  themePreset: ThemePreset;
  boardSwatchId: string;
  piecePaletteId: string;
  pieceSetId: PieceSetId;
  scenePresetId: ScenePresetId;
  cameraPreset: CameraPreset;
  animationIntensity: AnimationIntensity;
}

export interface BoardTheme {
  id: string;
  name: string;
  lightSquare: string;
  darkSquare: string;
  border: string;
  innerBorder: string;
  tableTop: string;
  tableEdge: string;
  felt: string;
  accent: string;
  ambient: string;
  glow: string;
  backgroundTop: string;
  backgroundBottom: string;
  roomGlow: string;
  floor: string;
  floorAccent: string;
  uiBackground: string;
  uiPanel: string;
  uiPanelElevated: string;
  uiSurface: string;
  uiBorder: string;
  uiText: string;
  uiMuted: string;
  uiButton: string;
  uiButtonText: string;
  uiSecondary: string;
  uiInput: string;
  uiShadow: string;
  uiHighlight: string;
}

export interface PiecePalette {
  id: string;
  name: string;
  lightBase: string;
  lightAccent: string;
  darkBase: string;
  darkAccent: string;
  metal: string;
}

export interface PieceSet {
  id: PieceSetId;
  name: string;
  source: string;
  license: string;
  assetType: 'obj';
  basePath: string;
  files: Record<Role, string>;
  targetHeights: Record<Role, number>;
  importRotation: [number, number, number];
  rotationY: number;
}

export interface ScenePreset {
  id: ScenePresetId;
  name: string;
  tableGlow: string;
  fillLight: string;
  rimLight: string;
  fogColor: string;
  wallColor: string;
  wallAccent: string;
}

export interface ClockPreset {
  id: ClockPresetId;
  label: string;
  initialMs: number | null;
  incrementMs: number;
}

export interface VariantDefinition {
  id: VariantId;
  label: string;
  shortDescription: string;
  rulesSummary: string[];
}

export interface PlayerPresence {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  seatColor?: Color;
}

export interface PublicLobbySummary {
  lobbyId: string;
  title: string;
  hostName: string;
  variant: VariantId;
  phase: RoomPhase;
  seatsFilled: number;
  seatsMax: number;
  createdAt: number;
  locked: boolean;
}

export interface RoomState {
  lobbyId: string;
  title: string;
  isPublic: boolean;
  createdAt: number;
  hostPlayerId: string;
  phase: RoomPhase;
  players: PlayerPresence[];
  settings: LobbySettings;
  readyStates: Record<string, boolean>;
  localPlayerId?: string;
  localSeatColor?: Color;
}

export interface BoardPiece {
  square: string;
  role: Role;
  color: Color;
  promoted?: boolean;
}

export interface CheckCounter {
  light: number;
  dark: number;
}

export interface ClockState {
  lightMs: number | null;
  darkMs: number | null;
  activeColor?: Color;
}

export interface GameSnapshot {
  variant: VariantId;
  initialFen: string;
  fen: string;
  turn: Color;
  moveHistory: string[];
  sanHistory: string[];
  legalDestinations: Record<string, string[]>;
  lastMove?: string;
  lastMoveSquares?: [string, string];
  pieces: BoardPiece[];
  status: GameStatus;
  winner?: Color;
  outcomeText: string;
  checksRemaining?: CheckCounter;
  clocks: ClockState;
  inCheck: boolean;
}

export interface SessionInfo {
  sessionToken: string;
  playerId?: string;
  playerName?: string;
  lobbyId?: string;
  hostJoinPin?: string;
}

export interface ServerPrompt {
  id: string;
  kind: PromptKind;
  fromPlayerId: string;
  option?: RematchOption;
  text: string;
}

export type ClientMessage =
  | {
      type: 'create_room';
      playerName: string;
      roomTitle: string;
      sessionToken?: string;
    }
  | {
      type: 'join_room';
      playerName: string;
      lobbyId: string;
      joinPin?: string;
      sessionToken?: string;
    }
  | {
      type: 'subscribe_lobbies';
    }
  | {
      type: 'update_settings';
      settings: Partial<LobbySettings>;
    }
  | {
      type: 'set_ready';
      ready: boolean;
    }
  | {
      type: 'start_match';
    }
  | {
      type: 'submit_move';
      move: string;
    }
  | {
      type: 'request_takeback';
    }
  | {
      type: 'regenerate_pin';
    }
  | {
      type: 'respond_takeback';
      promptId: string;
      accept: boolean;
    }
  | {
      type: 'request_rematch';
      option: RematchOption;
      action?: 'request' | 'accept' | 'decline';
      promptId?: string;
    }
  | {
      type: 'leave_room';
    };

export type ServerMessage =
  | {
      type: 'lobby_list';
      lobbies: PublicLobbySummary[];
    }
  | {
      type: 'session';
      session: SessionInfo;
    }
  | {
      type: 'room_state';
      room: RoomState;
    }
  | {
      type: 'game_state';
      game: GameSnapshot;
    }
  | {
      type: 'prompt';
      prompt: ServerPrompt;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'room_closed';
      message: string;
    };

export interface PieceGuide {
  role: Role;
  title: string;
  summary: string;
}
