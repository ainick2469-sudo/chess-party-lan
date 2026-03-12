import type {
  BoardTheme,
  ClockPreset,
  LobbySettings,
  PieceSet,
  PieceGuide,
  PiecePalette,
  ScenePreset,
  VariantDefinition
} from './types';

export const variantDefinitions: VariantDefinition[] = [
  {
    id: 'standard',
    label: 'Standard',
    shortDescription: 'Classic chess with the familiar goal: trap the enemy king.',
    rulesSummary: [
      'Checkmate wins immediately.',
      'Stalemate, insufficient material, and repetition-style dead positions are draws.',
      'Great baseline if you want the real rules.'
    ]
  },
  {
    id: 'chess960',
    label: 'Chess960',
    shortDescription: 'Same rules as standard chess, but the back rank is shuffled.',
    rulesSummary: [
      'Pawns stay in their normal places.',
      'Both bishops start on opposite colors, and the king starts between the rooks.',
      'Castling still exists, but the starting layout is different each round.'
    ]
  },
  {
    id: 'king_of_the_hill',
    label: 'King of the Hill',
    shortDescription: 'You can win by marching your king into the center.',
    rulesSummary: [
      'Checkmate still wins.',
      'You also win if your king reaches d4, e4, d5, or e5.',
      'Center control matters much more than in regular chess.'
    ]
  },
  {
    id: 'three_check',
    label: 'Three-Check',
    shortDescription: 'Every check matters because the third one wins the game.',
    rulesSummary: [
      'Checkmate still wins.',
      'Deliver three total checks to win, even without checkmating.',
      'The HUD shows how many checks each side still needs.'
    ]
  },
  {
    id: 'atomic',
    label: 'Atomic',
    shortDescription: 'Captures explode and can wipe out nearby pieces.',
    rulesSummary: [
      'Any capture causes an explosion around the captured square.',
      'Kings cannot stand next to each other because explosions matter.',
      'A king caught in an explosion loses immediately.'
    ]
  }
];

export const clockPresets: ClockPreset[] = [
  { id: 'untimed', label: 'Untimed', initialMs: null, incrementMs: 0 },
  { id: '5+0', label: '5 + 0', initialMs: 5 * 60_000, incrementMs: 0 },
  { id: '10+0', label: '10 + 0', initialMs: 10 * 60_000, incrementMs: 0 },
  { id: '10+5', label: '10 + 5', initialMs: 10 * 60_000, incrementMs: 5_000 },
  { id: '15+10', label: '15 + 10', initialMs: 15 * 60_000, incrementMs: 10_000 }
];

export const themePresets: BoardTheme[] = [
  {
    id: 'study',
    name: 'Warm Wood Study',
    lightSquare: '#f1ddbc',
    darkSquare: '#8a5e45',
    border: '#3f291f',
    innerBorder: '#8b654c',
    tableTop: '#2f4338',
    tableEdge: '#21150f',
    felt: '#18251e',
    accent: '#e5b368',
    ambient: '#f8ecd7',
    glow: '#ffdca1',
    backgroundTop: '#31261f',
    backgroundBottom: '#0f141d',
    roomGlow: '#d58d52',
    floor: '#151b22',
    floorAccent: '#2c3c37',
    uiBackground: '#0d1218',
    uiPanel: 'rgba(18, 23, 31, 0.76)',
    uiPanelElevated: 'rgba(28, 34, 43, 0.84)',
    uiSurface: 'rgba(12, 17, 24, 0.82)',
    uiBorder: 'rgba(255, 223, 177, 0.14)',
    uiText: '#f6ecdc',
    uiMuted: '#d8ccb7',
    uiButton: '#efc57a',
    uiButtonText: '#23170f',
    uiSecondary: 'rgba(255, 255, 255, 0.1)',
    uiInput: 'rgba(7, 11, 17, 0.72)',
    uiShadow: 'rgba(0, 0, 0, 0.42)',
    uiHighlight: 'rgba(255, 211, 138, 0.2)'
  },
  {
    id: 'neon',
    name: 'Neon Strategy',
    lightSquare: '#b7f3ff',
    darkSquare: '#26506a',
    border: '#061422',
    innerBorder: '#0f3144',
    tableTop: '#081928',
    tableEdge: '#030b11',
    felt: '#091624',
    accent: '#78ffd6',
    ambient: '#17324a',
    glow: '#8cfffc',
    backgroundTop: '#071929',
    backgroundBottom: '#02060d',
    roomGlow: '#35d9ff',
    floor: '#040b13',
    floorAccent: '#102538',
    uiBackground: '#040912',
    uiPanel: 'rgba(7, 16, 25, 0.8)',
    uiPanelElevated: 'rgba(11, 22, 35, 0.9)',
    uiSurface: 'rgba(5, 11, 19, 0.82)',
    uiBorder: 'rgba(136, 255, 244, 0.18)',
    uiText: '#eafcff',
    uiMuted: '#b7d9e0',
    uiButton: '#7effdf',
    uiButtonText: '#042019',
    uiSecondary: 'rgba(117, 219, 255, 0.1)',
    uiInput: 'rgba(3, 9, 16, 0.82)',
    uiShadow: 'rgba(0, 8, 18, 0.56)',
    uiHighlight: 'rgba(115, 255, 222, 0.18)'
  },
  {
    id: 'marble',
    name: 'Fantasy Marble',
    lightSquare: '#f1e5da',
    darkSquare: '#7a6172',
    border: '#2d1f2b',
    innerBorder: '#5a4052',
    tableTop: '#4f2435',
    tableEdge: '#27111c',
    felt: '#3f1e2a',
    accent: '#f6ce71',
    ambient: '#f3d8cb',
    glow: '#ffe7a8',
    backgroundTop: '#281925',
    backgroundBottom: '#0e1016',
    roomGlow: '#f3b46e',
    floor: '#161219',
    floorAccent: '#372232',
    uiBackground: '#0d1018',
    uiPanel: 'rgba(25, 20, 32, 0.8)',
    uiPanelElevated: 'rgba(36, 28, 45, 0.9)',
    uiSurface: 'rgba(18, 14, 24, 0.84)',
    uiBorder: 'rgba(255, 225, 168, 0.16)',
    uiText: '#f7ece3',
    uiMuted: '#d7c8c1',
    uiButton: '#f0c86d',
    uiButtonText: '#2a1707',
    uiSecondary: 'rgba(255, 255, 255, 0.08)',
    uiInput: 'rgba(12, 9, 18, 0.8)',
    uiShadow: 'rgba(0, 0, 0, 0.46)',
    uiHighlight: 'rgba(255, 217, 134, 0.16)'
  }
];

export const boardSwatches: BoardTheme[] = [...themePresets];

export const piecePalettes: PiecePalette[] = [
  {
    id: 'classic',
    name: 'Classic Ivory',
    lightBase: '#f6f0e6',
    lightAccent: '#d6b889',
    darkBase: '#2b2c33',
    darkAccent: '#5f697d',
    metal: '#be8b42'
  },
  {
    id: 'mint-onyx',
    name: 'Mint + Onyx',
    lightBase: '#d3fff3',
    lightAccent: '#76e9c8',
    darkBase: '#12151d',
    darkAccent: '#4a5974',
    metal: '#a7fff0'
  },
  {
    id: 'rose-stone',
    name: 'Rose + Stone',
    lightBase: '#f8e2e7',
    lightAccent: '#d49ba7',
    darkBase: '#433945',
    darkAccent: '#837487',
    metal: '#f6d36c'
  }
];

export const pieceSets: PieceSet[] = [
  {
    id: 'stevenalbert',
    name: 'Classic Tournament',
    source: 'stevenalbert/3d-chess-opengl',
    license: 'MIT',
    assetType: 'obj',
    basePath: '/assets/pieces/stevenalbert',
    files: {
      pawn: 'Pawn.obj',
      rook: 'Rook.obj',
      knight: 'Knight.obj',
      bishop: 'Bishop.obj',
      queen: 'Queen.obj',
      king: 'King.obj'
    },
    targetHeights: {
      pawn: 0.88,
      rook: 0.98,
      knight: 1.08,
      bishop: 1.14,
      queen: 1.24,
      king: 1.34
    },
    rotationY: 0
  }
];

export const scenePresets: ScenePreset[] = [
  {
    id: 'parlor',
    name: 'Parlor Glow',
    tableGlow: '#d3a066',
    fillLight: '#ffd8ac',
    rimLight: '#ffe7b9',
    fogColor: '#11161d',
    wallColor: '#141b22',
    wallAccent: '#3d2e25'
  },
  {
    id: 'skyline',
    name: 'Skyline Loft',
    tableGlow: '#6fd6ff',
    fillLight: '#b4f2ff',
    rimLight: '#8fffe8',
    fogColor: '#070d16',
    wallColor: '#0d1621',
    wallAccent: '#143244'
  },
  {
    id: 'vault',
    name: 'Velvet Vault',
    tableGlow: '#f0b26d',
    fillLight: '#ffd8b3',
    rimLight: '#ffe9ba',
    fogColor: '#110f17',
    wallColor: '#16111a',
    wallAccent: '#4b2737'
  }
];

export const defaultLobbySettings: LobbySettings = {
  variant: 'standard',
  clockPreset: 'untimed',
  sideAssignment: 'host_light',
  takebackPolicy: 'mutual',
  assistPreset: 'medium',
  themePreset: 'study',
  boardSwatchId: 'study',
  piecePaletteId: 'classic',
  pieceSetId: 'stevenalbert',
  scenePresetId: 'parlor',
  cameraPreset: 'cozy',
  animationIntensity: 'normal'
};

export const pieceGuides: PieceGuide[] = [
  { role: 'pawn', title: 'Pawn', summary: 'Moves forward one square, captures diagonally, and can jump two squares from its starting rank.' },
  { role: 'knight', title: 'Knight', summary: 'Moves in an L-shape and can hop over other pieces.' },
  { role: 'bishop', title: 'Bishop', summary: 'Slides diagonally as far as the path stays clear.' },
  { role: 'rook', title: 'Rook', summary: 'Slides horizontally or vertically and helps with castling.' },
  { role: 'queen', title: 'Queen', summary: 'Combines rook and bishop movement, making it the strongest piece.' },
  { role: 'king', title: 'King', summary: 'Moves one square in any direction. Protect it at all costs.' }
];

export function getVariantDefinition(id: LobbySettings['variant']): VariantDefinition {
  return variantDefinitions.find((variant) => variant.id === id) ?? variantDefinitions[0];
}

export function getClockPreset(id: LobbySettings['clockPreset']): ClockPreset {
  return clockPresets.find((preset) => preset.id === id) ?? clockPresets[0];
}

export function getBoardTheme(id: string): BoardTheme {
  return boardSwatches.find((swatch) => swatch.id === id) ?? themePresets[0];
}

export function getPiecePalette(id: string): PiecePalette {
  return piecePalettes.find((palette) => palette.id === id) ?? piecePalettes[0];
}

export function getPieceSet(id: string): PieceSet {
  return pieceSets.find((pieceSet) => pieceSet.id === id) ?? pieceSets[0];
}

export function getScenePreset(id: string): ScenePreset {
  return scenePresets.find((scenePreset) => scenePreset.id === id) ?? scenePresets[0];
}
