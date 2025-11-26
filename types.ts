
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Position {
  x: number;
  y: number;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY_SNAKE = 'ENEMY_SNAKE', 
  ENEMY_BULL = 'ENEMY_BULL',   
  ENEMY_DEMON = 'ENEMY_DEMON', // Ghost type that passes walls
  BOMB = 'BOMB',
  EXPLOSION = 'EXPLOSION',
  POWERUP_BLAST = 'POWERUP_BLAST',
  POWERUP_SPEED = 'POWERUP_SPEED',
  POWERUP_BOMB = 'POWERUP_BOMB',
  POWERUP_SHIELD = 'POWERUP_SHIELD',
  POWERUP_KICK = 'POWERUP_KICK',
}

export interface Entity {
  id: string;
  type: EntityType;
  pos: Position;
  velocity?: Position;
  direction?: Direction;
  state?: 'IDLE' | 'MOVING' | 'DYING' | 'CHARGING';
  timer?: number; // For bombs or explosions
  range?: number; // For bombs
  ownerId?: string; // Who placed the bomb
}

export interface Player extends Entity {
  lives: number;
  bombCount: number;
  maxBombs: number;
  bombRange: number;
  speed: number;
  isInvincible: boolean;
  invincibleTimer: number;
  hasKick: boolean;
  // New Abilities
  dashCooldown: number;
  isDashing: boolean;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  alpha?: number;
}

export enum TileType {
  EMPTY = 0,
  WALL_HARD = 1, // Indestructible
  WALL_SOFT = 2, // Destructible
}

export enum ThemeType {
  FOREST = 'FOREST',
  RIVER = 'RIVER',
  MOUNTAIN = 'MOUNTAIN',
  VILLAGE = 'VILLAGE'
}

export interface Theme {
  name: string;
  type: ThemeType;
  colors: {
    bg: string;
    wallHard: string;
    wallHardHighlight: string;
    wallSoft: string;
    wallSoftHighlight: string;
    uiTitle: string;
  };
}

export interface GameState {
  grid: TileType[][];
  entities: Entity[];
  player: Player;
  particles: Particle[];
  score: number;
  level: number;
  theme: Theme;
  status: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'VICTORY';
  timeRemaining: number;
  shakeTimer: number; // For screen shake
}