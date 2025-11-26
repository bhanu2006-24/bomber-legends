import { Theme, ThemeType, TileType } from './types';

export const TILE_SIZE = 48; // px
export const GRID_ROWS = 13;
export const GRID_COLS = 15;
export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE;

export const PLAYER_SPEED = 3;
export const ENEMY_SPEED_SLOW = 1.5;
export const ENEMY_SPEED_FAST = 2.5;

export const BOMB_TIMER = 180; // frames (~3 seconds)
export const EXPLOSION_TIMER = 30; // frames (~0.5 seconds)
export const INVINCIBILITY_TIME = 120; // frames

// Base colors kept for fallbacks, but themes will override specific map colors
export const COLORS = {
  PLAYER_SKIN: '#38bdf8', // Cyan
  PLAYER_CLOTH: '#facc15', // Yellow
  BOMB: '#fb923c', // Orange
  EXPLOSION_CORE: '#ffffff',
  EXPLOSION_OUTER: '#f59e0b', 
  UI_BG: 'rgba(0, 0, 0, 0.85)',
};

export const THEMES: Theme[] = [
  {
    name: 'Whispering Woods',
    type: ThemeType.FOREST,
    colors: {
      bg: '#2d8f3e', 
      wallHard: '#5c5c5c',
      wallHardHighlight: '#787878',
      wallSoft: '#d2691e',
      wallSoftHighlight: '#e9967a',
      uiTitle: '#22c55e'
    }
  },
  {
    name: 'Crystal River',
    type: ThemeType.RIVER,
    colors: {
      bg: '#1e40af', // Deep Blue
      wallHard: '#1e293b', // Dark Slate
      wallHardHighlight: '#334155',
      wallSoft: '#92400e', // Muddy banks
      wallSoftHighlight: '#b45309',
      uiTitle: '#3b82f6'
    }
  },
  {
    name: 'Granite Peaks',
    type: ThemeType.MOUNTAIN,
    colors: {
      bg: '#4b5563', // Grey Rocky
      wallHard: '#111827', // Black Rock
      wallHardHighlight: '#374151',
      wallSoft: '#78350f', // Dirt/Rock
      wallSoftHighlight: '#a16207',
      uiTitle: '#9ca3af'
    }
  },
  {
    name: 'Brick Town',
    type: ThemeType.VILLAGE,
    colors: {
      bg: '#713f12', // Earthy Floor
      wallHard: '#7f1d1d', // Brick Red
      wallHardHighlight: '#991b1b',
      wallSoft: '#d97706', // Hay/Wood
      wallSoftHighlight: '#f59e0b',
      uiTitle: '#f59e0b'
    }
  }
];

// Default Template is now just a fallback, actual generation happens in Game.tsx
export const INITIAL_GRID_TEMPLATE: TileType[][] = Array.from({ length: GRID_ROWS }, (_, y) =>
  Array.from({ length: GRID_COLS }, (_, x) => {
    if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) return TileType.WALL_HARD;
    if (x % 2 === 0 && y % 2 === 0) return TileType.WALL_HARD;
    return TileType.EMPTY;
  })
);