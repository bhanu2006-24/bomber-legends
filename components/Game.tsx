
import React, { useEffect, useRef, useState } from 'react';
import { 
  TILE_SIZE, GRID_ROWS, GRID_COLS, CANVAS_WIDTH, CANVAS_HEIGHT, 
  COLORS, INITIAL_GRID_TEMPLATE, PLAYER_SPEED, BOMB_TIMER, EXPLOSION_TIMER, 
  INVINCIBILITY_TIME, ENEMY_SPEED_SLOW, ENEMY_SPEED_FAST, THEMES 
} from '../constants';
import { 
  GameState, TileType, Entity, EntityType, Player, Position, Direction, Theme, ThemeType 
} from '../types';
import { 
  Play, Pause, Bot, Shield, Zap, Bomb, Footprints, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wind, Volume2, VolumeX
} from 'lucide-react';
import SageModal from './SageModal';
import { audioService } from '../services/audio';

// --- Utility Functions ---

interface Rect { x: number; y: number; w: number; h: number; }

const getOverlap = (r1: Rect, r2: Rect): boolean => {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
};

// Updated collision to accept optional ignoreSoftWalls flag
const isCollidingWithTile = (rect: Rect, grid: TileType[][], ignoreSoftWalls: boolean = false): boolean => {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x, y: rect.y + rect.h },
    { x: rect.x + rect.w, y: rect.y + rect.h }
  ];

  for (const c of corners) {
    const gx = Math.floor(c.x / TILE_SIZE);
    const gy = Math.floor(c.y / TILE_SIZE);
    
    // Bounds check
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return true;
    
    const tile = grid[gy][gx];
    // Wall check
    if (tile === TileType.WALL_HARD) return true;
    if (tile === TileType.WALL_SOFT && !ignoreSoftWalls) return true;
  }
  return false;
};

// --- Map Generation Logic ---

const generateMap = (themeType: ThemeType, level: number): TileType[][] => {
    // Start with empty grid with outer border
    const grid: TileType[][] = Array.from({ length: GRID_ROWS }, (_, y) =>
      Array.from({ length: GRID_COLS }, (_, x) => {
        if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) return TileType.WALL_HARD;
        return TileType.EMPTY;
      })
    );

    // Hard Wall Layouts based on Theme
    if (themeType === ThemeType.FOREST) {
        // Classic Checkerboard
        for (let y = 2; y < GRID_ROWS - 2; y += 2) {
            for (let x = 2; x < GRID_COLS - 2; x += 2) {
                grid[y][x] = TileType.WALL_HARD;
            }
        }
    } else if (themeType === ThemeType.RIVER) {
        // Horizontal Lines (Flow)
        for (let y = 2; y < GRID_ROWS - 2; y += 2) {
             for (let x = 1; x < GRID_COLS - 1; x++) {
                 // Gaps in the lines for movement
                 if (x % 4 !== 0) { 
                    if (Math.random() > 0.1) grid[y][x] = TileType.WALL_HARD;
                 }
             }
        }
    } else if (themeType === ThemeType.MOUNTAIN) {
        // Random Boulders
        const boulderCount = 20;
        for (let i = 0; i < boulderCount; i++) {
            const bx = Math.floor(Math.random() * (GRID_COLS - 2)) + 1;
            const by = Math.floor(Math.random() * (GRID_ROWS - 2)) + 1;
            // Keep center somewhat clear and don't block start
            if ((bx > 3 || by > 3) && grid[by][bx] === TileType.EMPTY) {
                grid[by][bx] = TileType.WALL_HARD;
            }
        }
    } else if (themeType === ThemeType.VILLAGE) {
        // Rooms / Boxes
         for (let y = 2; y < GRID_ROWS - 2; y += 3) {
            for (let x = 2; x < GRID_COLS - 2; x += 3) {
                grid[y][x] = TileType.WALL_HARD;
                grid[y][x+1] = TileType.WALL_HARD;
                if (y+1 < GRID_ROWS-1) {
                    grid[y+1][x] = TileType.WALL_HARD;
                    grid[y+1][x+1] = TileType.WALL_HARD;
                }
            }
        }
    }

    // Place Soft Walls
    const wallDensity = Math.min(0.4 + (level * 0.02), 0.75); // Cap at 75%
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        // Safe Zone
        if ((x < 3 && y < 3)) continue;
        
        // Skip Hard Walls
        if (grid[y][x] === TileType.WALL_HARD) continue;

        if (Math.random() < wallDensity) {
          grid[y][x] = TileType.WALL_SOFT;
        }
      }
    }

    return grid;
};

// --- Game Component ---

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [sageOpen, setSageOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Game State Refs
  const stateRef = useRef<GameState>({
    grid: INITIAL_GRID_TEMPLATE.map(row => [...row]),
    entities: [],
    particles: [],
    player: {
      id: 'player',
      type: EntityType.PLAYER,
      pos: { x: TILE_SIZE, y: TILE_SIZE },
      direction: 'DOWN',
      lives: 3,
      bombCount: 0,
      maxBombs: 1,
      bombRange: 2,
      speed: PLAYER_SPEED,
      isInvincible: false,
      invincibleTimer: 0,
      hasKick: false,
      dashCooldown: 0,
      isDashing: false
    },
    score: 0,
    level: 1,
    theme: THEMES[0],
    status: 'MENU',
    timeRemaining: 300,
    shakeTimer: 0
  });

  const [uiState, setUiState] = useState<{
    score: number, 
    lives: number, 
    time: number, 
    status: string, 
    maxBombs: number, 
    range: number, 
    level: number, 
    themeName: string,
    hasKick: boolean,
    dashReady: boolean
  }>({
    score: 0, lives: 3, time: 300, status: 'MENU', maxBombs: 1, range: 2, level: 1, themeName: THEMES[0].name, hasKick: false, dashReady: true
  });

  const keysRef = useRef<Set<string>>(new Set());

  // --- Initialization ---

  const initLevel = (level: number) => {
    const themeIndex = (level - 1) % THEMES.length;
    const theme = THEMES[themeIndex];
    stateRef.current.theme = theme;

    const grid = generateMap(theme.type, level);
    const entities: Entity[] = [];

    const baseEnemyCount = 3 + Math.floor(level / 2);
    const enemyCount = Math.min(baseEnemyCount, 15); 
    
    let spawned = 0;
    while (spawned < enemyCount) {
      const x = Math.floor(Math.random() * (GRID_COLS - 2)) + 1;
      const y = Math.floor(Math.random() * (GRID_ROWS - 2)) + 1;
      
      if ((x > 5 || y > 5) && grid[y][x] === TileType.EMPTY) {
        const rand = Math.random();
        let type = EntityType.ENEMY_SNAKE;

        if (level >= 4 && rand > 0.7) {
            type = EntityType.ENEMY_DEMON;
        } else if (level >= 2 && rand > 0.5) {
            type = EntityType.ENEMY_BULL;
        }
        
        entities.push({
          id: `enemy_${spawned}`,
          type: type,
          pos: { x: x * TILE_SIZE, y: y * TILE_SIZE },
          direction: ['UP', 'DOWN', 'LEFT', 'RIGHT'][Math.floor(Math.random() * 4)] as Direction,
          state: 'MOVING'
        });
        spawned++;
      }
    }

    stateRef.current.grid = grid;
    stateRef.current.entities = entities;
    stateRef.current.player.pos = { x: TILE_SIZE, y: TILE_SIZE };
    stateRef.current.player.direction = 'DOWN';
    stateRef.current.player.isInvincible = true;
    stateRef.current.player.invincibleTimer = INVINCIBILITY_TIME;
    stateRef.current.player.bombCount = 0;
    stateRef.current.player.dashCooldown = 0;
    stateRef.current.particles = [];
    
    stateRef.current.timeRemaining = Math.max(150, 300 - (level * 5));
    
    setUiState(prev => ({ ...prev, themeName: theme.name }));
    audioService.playBgm();
  };

  const startGame = () => {
    audioService.init(); // Ensure context is running
    audioService.playPlaceBomb(); // Sound check
    
    stateRef.current.score = 0;
    stateRef.current.level = 1;
    stateRef.current.player.lives = 3;
    stateRef.current.player.maxBombs = 1;
    stateRef.current.player.bombRange = 2;
    stateRef.current.player.speed = PLAYER_SPEED;
    stateRef.current.player.hasKick = false;
    stateRef.current.player.dashCooldown = 0;
    stateRef.current.status = 'PLAYING';
    initLevel(1);
    lastTimeRef.current = performance.now();
    
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
  };

  const togglePause = () => {
    if (stateRef.current.status === 'PLAYING') {
      stateRef.current.status = 'PAUSED';
      audioService.stopBgm();
    } else if (stateRef.current.status === 'PAUSED') {
      stateRef.current.status = 'PLAYING';
      lastTimeRef.current = performance.now();
      audioService.playBgm();
    }
    setUiState(prev => ({ ...prev, status: stateRef.current.status }));
  };

  const toggleMute = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  // --- Input ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        placeBomb();
      }
      if (e.code === 'KeyP') togglePause();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeBomb = () => {
    const state = stateRef.current;
    if (state.status !== 'PLAYING') return;
    if (state.player.bombCount >= state.player.maxBombs) return;

    const centerX = state.player.pos.x + TILE_SIZE / 2;
    const centerY = state.player.pos.y + TILE_SIZE / 2;
    const gx = Math.floor(centerX / TILE_SIZE);
    const gy = Math.floor(centerY / TILE_SIZE);

    const existingBomb = state.entities.find(e => 
      e.type === EntityType.BOMB && 
      Math.floor(e.pos.x / TILE_SIZE) === gx && 
      Math.floor(e.pos.y / TILE_SIZE) === gy
    );

    if (!existingBomb && state.grid[gy][gx] !== TileType.WALL_HARD) {
      state.entities.push({
        id: `bomb_${Date.now()}_${Math.random()}`,
        type: EntityType.BOMB,
        pos: { x: gx * TILE_SIZE, y: gy * TILE_SIZE },
        timer: BOMB_TIMER,
        range: state.player.bombRange,
        ownerId: state.player.id
      });
      state.player.bombCount++;
      audioService.playPlaceBomb();
    }
  };

  const activateDash = () => {
      const p = stateRef.current.player;
      if (p.dashCooldown <= 0) {
          p.isDashing = true;
          p.dashCooldown = 120; // 2 seconds
          setUiState(prev => ({...prev, dashReady: false}));
          audioService.playPlaceBomb(); // Reuse distinct sound in future
      }
  };

  // --- Core Game Logic ---

  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  const update = (dt: number) => {
    const state = stateRef.current;
    if (state.status !== 'PLAYING') return;

    // Timer
    frameCountRef.current++;
    if (frameCountRef.current % 60 === 0) {
      state.timeRemaining--;
      if (state.timeRemaining <= 0) handlePlayerDeath();
      
      setUiState({
        score: state.score,
        lives: state.player.lives,
        time: state.timeRemaining,
        status: state.status,
        maxBombs: state.player.maxBombs,
        range: state.player.bombRange,
        level: state.level,
        themeName: state.theme.name,
        hasKick: state.player.hasKick,
        dashReady: state.player.dashCooldown <= 0
      });
    }

    if (state.shakeTimer > 0) state.shakeTimer--;

    // --- Player Movement & Collision ---
    movePlayer(state);

    // Dash Cooldown
    if (state.player.dashCooldown > 0) {
        state.player.dashCooldown--;
        if (state.player.dashCooldown <= 0) {
            setUiState(prev => ({...prev, dashReady: true}));
        }
    }
    
    // Dash duration check
    if (state.player.dashCooldown > 110) { 
        state.player.speed = PLAYER_SPEED * 2.5; // Temp burst
        if (frameCountRef.current % 3 === 0) createParticles(state.player.pos.x + TILE_SIZE/2, state.player.pos.y + TILE_SIZE/2, '#60a5fa', 2);
    } else {
        // Reset speed if speed powerup logic allows, simpler here to just reset base movement logic handles speed variable
    }

    // Invincibility
    if (state.player.isInvincible) {
      state.player.invincibleTimer--;
      if (state.player.invincibleTimer <= 0) state.player.isInvincible = false;
    }

    // --- Entities Update ---
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const ent = state.entities[i];

      if (ent.type === EntityType.BOMB) {
        ent.timer = (ent.timer || 0) - 1;
        if (ent.timer <= 0) explodeBomb(i);
        
        // Bomb Sliding
        if (ent.velocity && (ent.velocity.x !== 0 || ent.velocity.y !== 0)) {
           const nextX = ent.pos.x + ent.velocity.x;
           const nextY = ent.pos.y + ent.velocity.y;
           const hitBox = { x: nextX, y: nextY, w: TILE_SIZE, h: TILE_SIZE };
           
           if (isCollidingWithTile(hitBox, state.grid) || 
               state.entities.some(e => e !== ent && e.type === EntityType.BOMB && getOverlap(hitBox, {x:e.pos.x, y:e.pos.y, w:TILE_SIZE, h:TILE_SIZE})) ||
               state.entities.some(e => (e.type === EntityType.ENEMY_SNAKE || e.type === EntityType.ENEMY_BULL || e.type === EntityType.ENEMY_DEMON) && getOverlap(hitBox, getHitbox(e)))
               ) 
            {
               ent.velocity = { x: 0, y: 0 };
               ent.pos.x = Math.round(ent.pos.x / TILE_SIZE) * TILE_SIZE;
               ent.pos.y = Math.round(ent.pos.y / TILE_SIZE) * TILE_SIZE;
           } else {
               ent.pos.x = nextX;
               ent.pos.y = nextY;
           }
        }
      } 
      else if (ent.type === EntityType.EXPLOSION) {
        ent.timer = (ent.timer || 0) - 1;
        if (ent.timer <= 0) {
          state.entities.splice(i, 1);
        } else {
          // Player hit by explosion
          if (!state.player.isInvincible && getOverlap(getHitbox(state.player), {x: ent.pos.x + 4, y: ent.pos.y + 4, w: TILE_SIZE - 8, h: TILE_SIZE - 8})) {
            handlePlayerDeath();
          }
        }
      }
      else if (ent.type === EntityType.ENEMY_SNAKE || ent.type === EntityType.ENEMY_BULL || ent.type === EntityType.ENEMY_DEMON) {
        updateEnemy(ent, state);
        if (!state.player.isInvincible && getOverlap(getHitbox(state.player), getHitbox(ent))) {
          handlePlayerDeath();
        }
      }
      else if (ent.type.startsWith('POWERUP')) {
        if (getOverlap(getHitbox(state.player), {x: ent.pos.x + 10, y: ent.pos.y + 10, w: TILE_SIZE - 20, h: TILE_SIZE - 20})) {
            if (ent.type === EntityType.POWERUP_BLAST) state.player.bombRange++;
            if (ent.type === EntityType.POWERUP_SPEED) state.player.speed = Math.min(state.player.speed + 0.5, 6.5);
            if (ent.type === EntityType.POWERUP_BOMB) state.player.maxBombs++;
            if (ent.type === EntityType.POWERUP_SHIELD) {
                state.player.isInvincible = true;
                state.player.invincibleTimer = 600; 
            }
            if (ent.type === EntityType.POWERUP_KICK) state.player.hasKick = true;
            
            audioService.playPowerup();
            state.score += 200;
            state.entities.splice(i, 1);
            setUiState(prev => ({ 
              ...prev, 
              maxBombs: state.player.maxBombs, 
              range: state.player.bombRange,
              hasKick: state.player.hasKick
            }));
        }
      }
    }
    
    // Check Victory
    const enemiesAlive = state.entities.some(e => e.type === EntityType.ENEMY_SNAKE || e.type === EntityType.ENEMY_BULL || e.type === EntityType.ENEMY_DEMON);
    if (!enemiesAlive && state.status === 'PLAYING') {
       state.level++;
       state.score += 1000 + (state.timeRemaining * 10);
       audioService.playWin();
       initLevel(state.level);
    }

    updateParticles();
  };

  const getHitbox = (ent: Entity): Rect => {
    const padding = 10;
    return {
      x: ent.pos.x + padding,
      y: ent.pos.y + padding,
      w: TILE_SIZE - (padding * 2),
      h: TILE_SIZE - (padding * 2)
    };
  };

  const movePlayer = (state: GameState) => {
    const player = state.player;
    
    // Dash Logic
    if (keysRef.current.has('ShiftLeft') || keysRef.current.has('ShiftRight')) {
        activateDash();
    }

    let speed = player.speed;
    if (player.dashCooldown > 110) speed = player.speed * 2.5;

    let dx = 0;
    let dy = 0;

    if (keysRef.current.has('ArrowUp') || keysRef.current.has('KeyW')) dy -= speed;
    if (keysRef.current.has('ArrowDown') || keysRef.current.has('KeyS')) dy += speed;
    if (keysRef.current.has('ArrowLeft') || keysRef.current.has('KeyA')) dx -= speed;
    if (keysRef.current.has('ArrowRight') || keysRef.current.has('KeyD')) dx += speed;

    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }

    if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) > Math.abs(dy)) {
        player.direction = dx > 0 ? 'RIGHT' : 'LEFT';
      } else if (dy !== 0) {
        player.direction = dy > 0 ? 'DOWN' : 'UP';
      }

      const checkAndMove = (newX: number, newY: number, moveDx: number, moveDy: number): boolean => {
         const nextHitbox = { ...getHitbox(player), x: newX + 10, y: newY + 10 };
         
         const bombCollision = getCollidingBomb(nextHitbox, getHitbox(player), state.entities);
         const tileCollision = isCollidingWithTile(nextHitbox, state.grid);

         if (!tileCollision && !bombCollision) {
            return true;
         }

         if (player.hasKick && bombCollision) {
             const bomb = state.entities.find(e => 
               e.type === EntityType.BOMB && 
               getOverlap(nextHitbox, {x: e.pos.x, y: e.pos.y, w: TILE_SIZE, h: TILE_SIZE}) &&
               !getOverlap(getHitbox(player), {x: e.pos.x, y: e.pos.y, w: TILE_SIZE, h: TILE_SIZE})
             );
             
             if (bomb && (!bomb.velocity || (bomb.velocity.x === 0 && bomb.velocity.y === 0))) {
                 const kSpeed = 6;
                 if (Math.abs(moveDx) > Math.abs(moveDy)) {
                     bomb.velocity = { x: moveDx > 0 ? kSpeed : -kSpeed, y: 0 };
                 } else {
                     bomb.velocity = { x: 0, y: moveDy > 0 ? kSpeed : -kSpeed };
                 }
                 audioService.playPlaceBomb(); 
             }
         }
         return false;
      };

      if (dx !== 0) {
        const nextX = player.pos.x + dx;
        if (checkAndMove(nextX, player.pos.y, dx, 0)) {
            player.pos.x = nextX;
        } else {
          const gridY = Math.round(player.pos.y / TILE_SIZE) * TILE_SIZE;
          const diff = player.pos.y - gridY;
          const SLIDE_THRESHOLD = 18;
          if (Math.abs(diff) < SLIDE_THRESHOLD && Math.abs(diff) > 0) {
             if (checkAndMove(nextX, gridY, dx, 0)) {
                const slideSpeed = 2;
                if (diff > 0) player.pos.y -= slideSpeed;
                else player.pos.y += slideSpeed;
                player.pos.x += dx * 0.5; 
             }
          }
        }
      }

      if (dy !== 0) {
        const nextY = player.pos.y + dy;
        if (checkAndMove(player.pos.x, nextY, 0, dy)) {
            player.pos.y = nextY;
        } else {
           const gridX = Math.round(player.pos.x / TILE_SIZE) * TILE_SIZE;
           const diff = player.pos.x - gridX;
           const SLIDE_THRESHOLD = 18;
           if (Math.abs(diff) < SLIDE_THRESHOLD && Math.abs(diff) > 0) {
              if (checkAndMove(gridX, nextY, 0, dy)) {
                const slideSpeed = 2;
                if (diff > 0) player.pos.x -= slideSpeed;
                else player.pos.x += slideSpeed;
                player.pos.y += dy * 0.5;
              }
           }
        }
      }
    }
  };

  const getCollidingBomb = (targetRect: Rect, currentRect: Rect, entities: Entity[]): boolean => {
    for (const ent of entities) {
      if (ent.type === EntityType.BOMB) {
        const bombRect = { x: ent.pos.x, y: ent.pos.y, w: TILE_SIZE, h: TILE_SIZE };
        if (getOverlap(currentRect, bombRect)) continue; 
        if (getOverlap(targetRect, bombRect)) return true;
      }
    }
    return false;
  };

  const updateEnemy = (enemy: Entity, state: GameState) => {
    const levelBonus = Math.floor(state.level / 2) * 0.2;
    let baseSpeed = ENEMY_SPEED_SLOW;
    
    if (enemy.type === EntityType.ENEMY_BULL) baseSpeed = ENEMY_SPEED_FAST;
    if (enemy.type === EntityType.ENEMY_DEMON) baseSpeed = ENEMY_SPEED_SLOW * 0.8; 

    let speed = Math.min(baseSpeed + levelBonus, 5);
    
    if (enemy.type === EntityType.ENEMY_BULL) {
        const margin = 20;
        const player = state.player;
        const ex = enemy.pos.x;
        const ey = enemy.pos.y;
        
        const alignedX = Math.abs(player.pos.x - ex) < margin;
        const alignedY = Math.abs(player.pos.y - ey) < margin;

        if (alignedX || alignedY) {
            enemy.state = 'CHARGING';
            speed *= 1.8;
            if (alignedX) {
                if (player.pos.y > ey) enemy.direction = 'DOWN';
                else enemy.direction = 'UP';
            } else {
                if (player.pos.x > ex) enemy.direction = 'RIGHT';
                else enemy.direction = 'LEFT';
            }
        } else {
            enemy.state = 'MOVING';
        }
    }

    let dx = 0;
    let dy = 0;

    if (enemy.direction === 'UP') dy = -speed;
    if (enemy.direction === 'DOWN') dy = speed;
    if (enemy.direction === 'LEFT') dx = -speed;
    if (enemy.direction === 'RIGHT') dx = speed;

    const nextX = enemy.pos.x + dx;
    const nextY = enemy.pos.y + dy;
    const hitBox = { x: nextX + 2, y: nextY + 2, w: TILE_SIZE - 4, h: TILE_SIZE - 4 };

    const ignoreSoft = enemy.type === EntityType.ENEMY_DEMON;
    const bombCollision = state.entities.some(e => 
      e.type === EntityType.BOMB && getOverlap(hitBox, {x: e.pos.x, y: e.pos.y, w: TILE_SIZE, h: TILE_SIZE})
    );

    if (isCollidingWithTile(hitBox, state.grid, ignoreSoft) || bombCollision) {
      if (enemy.type === EntityType.ENEMY_BULL && enemy.state === 'CHARGING') {
          enemy.state = 'MOVING';
      }

      const availableDirs: Direction[] = [];
      const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      
      dirs.forEach(d => {
         if ((d === 'UP' && enemy.direction === 'DOWN') || 
             (d === 'DOWN' && enemy.direction === 'UP') ||
             (d === 'LEFT' && enemy.direction === 'RIGHT') ||
             (d === 'RIGHT' && enemy.direction === 'LEFT')) return;
         availableDirs.push(d);
      });
      
      if (availableDirs.length > 0) {
          enemy.direction = availableDirs[Math.floor(Math.random() * availableDirs.length)];
      } else {
          enemy.direction = dirs[Math.floor(Math.random() * 4)];
      }
      
      enemy.pos.x = Math.round(enemy.pos.x / TILE_SIZE) * TILE_SIZE;
      enemy.pos.y = Math.round(enemy.pos.y / TILE_SIZE) * TILE_SIZE;
    } else {
      enemy.pos.x = nextX;
      enemy.pos.y = nextY;
    }
  };

  const explodeBomb = (index: number) => {
    const state = stateRef.current;
    if (index >= state.entities.length) return;
    
    const bomb = state.entities[index];
    state.entities.splice(index, 1);
    state.player.bombCount--;
    state.shakeTimer = 10; // Trigger Shake
    
    createExplosion(bomb.pos.x, bomb.pos.y);
    audioService.playExplosion();

    const range = bomb.range || 2;
    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];

    dirs.forEach(d => {
      for (let i = 1; i <= range; i++) {
        const tx = Math.floor(bomb.pos.x / TILE_SIZE) + d.x * i;
        const ty = Math.floor(bomb.pos.y / TILE_SIZE) + d.y * i;
        
        if (tx < 0 || tx >= GRID_COLS || ty < 0 || ty >= GRID_ROWS) break;

        const tile = state.grid[ty][tx];
        if (tile === TileType.WALL_HARD) break;
        
        createExplosion(tx * TILE_SIZE, ty * TILE_SIZE);

        const otherBombIdx = state.entities.findIndex(e => 
          e.type === EntityType.BOMB && 
          Math.abs(e.pos.x - tx * TILE_SIZE) < 5 && 
          Math.abs(e.pos.y - ty * TILE_SIZE) < 5
        );
        
        if (otherBombIdx !== -1) {
            explodeBomb(otherBombIdx);
        }

        if (tile === TileType.WALL_SOFT) {
          state.grid[ty][tx] = TileType.EMPTY;
          state.score += 10;
          createParticles(tx * TILE_SIZE + TILE_SIZE/2, ty * TILE_SIZE + TILE_SIZE/2, state.theme.colors.wallSoft);
          
          if (Math.random() < 0.4) {
            const r = Math.random();
            let pType = EntityType.POWERUP_BLAST;
            if (r > 0.3) pType = EntityType.POWERUP_SPEED;
            if (r > 0.6) pType = EntityType.POWERUP_BOMB;
            if (r > 0.8) pType = EntityType.POWERUP_SHIELD;
            if (r > 0.92) pType = EntityType.POWERUP_KICK; 

            state.entities.push({
              id: `powerup_${Date.now()}_${i}`,
              type: pType,
              pos: { x: tx * TILE_SIZE, y: ty * TILE_SIZE }
            });
          }
          break; 
        }

        for (let ei = state.entities.length - 1; ei >= 0; ei--) {
          const ent = state.entities[ei];
          const isEnemy = ent.type === EntityType.ENEMY_SNAKE || ent.type === EntityType.ENEMY_BULL || ent.type === EntityType.ENEMY_DEMON;
          
          if (isEnemy && getOverlap({x: tx*TILE_SIZE, y: ty*TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE}, getHitbox(ent))) {
                  state.entities.splice(ei, 1);
                  state.score += 100 * state.level;
                  if (ent.type === EntityType.ENEMY_DEMON) state.score += 200;
                  createParticles(ent.pos.x + TILE_SIZE/2, ent.pos.y + TILE_SIZE/2, '#ef4444');
                  audioService.playDeath();
          }
        }
      }
    });
  };

  const createExplosion = (x: number, y: number) => {
    stateRef.current.entities.push({
      id: `exp_${Date.now()}_${Math.random()}`,
      type: EntityType.EXPLOSION,
      pos: { x, y },
      timer: EXPLOSION_TIMER
    });
  };

  const createParticles = (x: number, y: number, color: string, count: number = 8) => {
    for (let i = 0; i < count; i++) {
      stateRef.current.particles.push({
        id: Math.random().toString(),
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 20 + Math.random() * 20,
        color
      });
    }
  };

  const updateParticles = () => {
    const parts = stateRef.current.particles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) parts.splice(i, 1);
    }
  };

  const handlePlayerDeath = () => {
    stateRef.current.player.lives--;
    setUiState(prev => ({...prev, lives: stateRef.current.player.lives}));
    audioService.playDeath();
    
    if (stateRef.current.player.lives <= 0) {
      stateRef.current.status = 'GAME_OVER';
      setUiState(prev => ({...prev, status: 'GAME_OVER'}));
      audioService.stopBgm();
    } else {
      stateRef.current.player.pos = { x: TILE_SIZE, y: TILE_SIZE };
      stateRef.current.player.direction = 'DOWN';
      stateRef.current.player.isInvincible = true;
      stateRef.current.player.invincibleTimer = INVINCIBILITY_TIME;
      stateRef.current.player.hasKick = false;
      setUiState(prev => ({...prev, hasKick: false}));
    }
  };

  // --- Rendering ---

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = stateRef.current;
    const theme = state.theme;

    ctx.save();
    
    // Screen Shake
    if (state.shakeTimer > 0) {
        const dx = (Math.random() - 0.5) * 10;
        const dy = (Math.random() - 0.5) * 10;
        ctx.translate(dx, dy);
    }

    // BG
    ctx.fillStyle = theme.colors.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Walls
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const type = state.grid[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (type === TileType.WALL_HARD) {
          ctx.fillStyle = theme.colors.wallHard;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = theme.colors.wallHardHighlight;
          ctx.fillRect(px, py, TILE_SIZE, 4);
          ctx.fillRect(px, py, 4, TILE_SIZE);
        } else if (type === TileType.WALL_SOFT) {
          ctx.fillStyle = theme.colors.wallSoft;
          ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          // Detail
          ctx.fillStyle = theme.colors.wallSoftHighlight;
          ctx.fillRect(px + 5, py + 5, 12, 6);
          ctx.fillRect(px + 24, py + 5, 12, 6);
        }
      }
    }

    // Shadows
    state.entities.forEach(ent => {
       ctx.fillStyle = 'rgba(0,0,0,0.3)';
       ctx.beginPath();
       ctx.ellipse(ent.pos.x + TILE_SIZE/2, ent.pos.y + TILE_SIZE - 4, 12, 5, 0, 0, Math.PI * 2);
       ctx.fill();
    });

    // Powerups
    state.entities.forEach(ent => {
      if (ent.type.startsWith('POWERUP')) {
          const cx = ent.pos.x + TILE_SIZE/2;
          const cy = ent.pos.y + TILE_SIZE/2;
          
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fff';
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 10px "Inter"';
          
          let label = '?';
          let color = '#000';
          if (ent.type === EntityType.POWERUP_BLAST) { label = 'POW'; color = '#ef4444'; }
          if (ent.type === EntityType.POWERUP_SPEED) { label = 'SPD'; color = '#3b82f6'; }
          if (ent.type === EntityType.POWERUP_BOMB) { label = 'BOMB'; color = '#000'; }
          if (ent.type === EntityType.POWERUP_SHIELD) { label = 'SHLD'; color = '#8b5cf6'; }
          if (ent.type === EntityType.POWERUP_KICK) { label = 'KICK'; color = '#15803d'; }

          ctx.fillStyle = color;
          ctx.fillText(label, cx, cy);
      }
    });

    // Bombs
    state.entities.forEach(ent => {
      if (ent.type === EntityType.BOMB) {
        const cx = ent.pos.x + TILE_SIZE / 2;
        const cy = ent.pos.y + TILE_SIZE / 2;
        const scale = 1 + Math.sin(Date.now() / 150) * 0.05;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        
        ctx.fillStyle = COLORS.BOMB;
        ctx.beginPath();
        ctx.arc(0, 4, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#334155'; // Metallic Cap
        ctx.beginPath();
        ctx.ellipse(0, -6, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444'; // Red fuse light
        ctx.beginPath();
        ctx.arc(0, -10, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });

    // Enemies
    state.entities.forEach(ent => {
      if (ent.type === EntityType.ENEMY_SNAKE || ent.type === EntityType.ENEMY_BULL || ent.type === EntityType.ENEMY_DEMON) {
        const cx = ent.pos.x + TILE_SIZE / 2;
        const cy = ent.pos.y + TILE_SIZE / 2;
        ctx.save();
        ctx.translate(cx, cy);
        
        if (ent.direction === 'LEFT') ctx.scale(-1, 1);

        if (ent.type === EntityType.ENEMY_SNAKE) { // Green Viper
           ctx.fillStyle = '#16a34a';
           ctx.beginPath();
           ctx.ellipse(0, 8, 14, 8, 0, 0, Math.PI * 2);
           ctx.fill();
           ctx.fillStyle = '#14532d';
           ctx.beginPath();
           ctx.arc(0, -6, 12, 0, Math.PI * 2);
           ctx.fill();
           ctx.fillStyle = '#ef4444';
           ctx.beginPath();
           ctx.arc(4, -8, 3, 0, Math.PI * 2);
           ctx.fill();
        } else if (ent.type === EntityType.ENEMY_BULL) { // Red Charger
           ctx.fillStyle = ent.state === 'CHARGING' ? '#dc2626' : '#991b1b'; 
           ctx.beginPath();
           ctx.roundRect(-14, -10, 28, 24, 4);
           ctx.fill();
           // Horns
           ctx.fillStyle = '#f5f5f4';
           ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-18, -20); ctx.lineTo(-8, -12); ctx.fill();
           ctx.beginPath(); ctx.moveTo(12, -10); ctx.lineTo(18, -20); ctx.lineTo(8, -12); ctx.fill();
           // Eyes
           ctx.strokeStyle = '#fbbf24';
           ctx.lineWidth = 2;
           ctx.beginPath(); ctx.arc(0, 6, 3, 0, Math.PI * 2); ctx.stroke();
        } else if (ent.type === EntityType.ENEMY_DEMON) { // Phantom
           ctx.globalAlpha = 0.8;
           ctx.fillStyle = '#581c87'; 
           ctx.beginPath();
           ctx.moveTo(0, -14);
           ctx.bezierCurveTo(15, -14, 15, 10, 0, 14);
           ctx.bezierCurveTo(-15, 10, -15, -14, 0, -14);
           ctx.fill();
           // Glowing eyes
           ctx.shadowColor = '#d8b4fe';
           ctx.shadowBlur = 5;
           ctx.fillStyle = '#d8b4fe';
           ctx.beginPath();
           ctx.arc(-4, -4, 2, 0, Math.PI * 2);
           ctx.arc(4, -4, 2, 0, Math.PI * 2);
           ctx.fill();
           ctx.shadowBlur = 0;
           ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    });

    // Player
    const p = state.player;
    const pcx = p.pos.x + TILE_SIZE / 2;
    const pcy = p.pos.y + TILE_SIZE / 2;
    
    ctx.save();
    ctx.translate(pcx, pcy);
    
    if (p.isInvincible) {
       ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 50) * 0.2;
       ctx.strokeStyle = '#38bdf8';
       ctx.lineWidth = 3;
       ctx.beginPath();
       ctx.arc(0, 0, 20, 0, Math.PI * 2);
       ctx.stroke();
       ctx.globalAlpha = 1;
    }

    if (p.direction === 'LEFT') ctx.scale(-1, 1);

    // Body
    ctx.fillStyle = '#0369a1'; 
    ctx.beginPath();
    ctx.roundRect(-10, 2, 20, 14, 4);
    ctx.fill();

    // Head
    ctx.fillStyle = '#bae6fd'; 
    ctx.beginPath();
    ctx.arc(0, -8, 11, 0, Math.PI * 2);
    ctx.fill();

    // Helmet / Cap
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, -14, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.rect(-12, -14, 24, 4);
    ctx.fill();

    ctx.fillStyle = '#000';
    if (p.direction !== 'UP') {
        ctx.beginPath();
        ctx.arc(4, -8, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();

    // Explosions
    state.entities.forEach(ent => {
      if (ent.type === EntityType.EXPLOSION) {
         const ecx = ent.pos.x + TILE_SIZE / 2;
         const ecy = ent.pos.y + TILE_SIZE / 2;
         const progress = ent.timer! / EXPLOSION_TIMER;
         
         ctx.fillStyle = COLORS.EXPLOSION_OUTER;
         ctx.beginPath();
         ctx.arc(ecx, ecy, (TILE_SIZE / 1.5) * progress, 0, Math.PI * 2);
         ctx.fill();
         
         ctx.fillStyle = COLORS.EXPLOSION_CORE;
         ctx.beginPath();
         ctx.arc(ecx, ecy, (TILE_SIZE / 3) * progress, 0, Math.PI * 2);
         ctx.fill();
      }
    });

    // Particles
    state.particles.forEach(part => {
        ctx.globalAlpha = part.life / 40;
        ctx.fillStyle = part.color;
        ctx.fillRect(part.x, part.y, 4, 4);
    });
    ctx.globalAlpha = 1;

    ctx.restore(); // Restore Shake

    // Overlays
    if (state.status === 'MENU') {
        drawOverlay(ctx, 'BOMBER LEGENDS', 'Press SPACE or Tap BOMB to Start', theme.colors.uiTitle);
    }
    else if (state.status === 'GAME_OVER') {
        drawOverlay(ctx, 'GAME OVER', `Lvl: ${state.level}  Score: ${state.score}`, '#ef4444');
    }
    else if (state.status === 'PAUSED') {
        drawOverlay(ctx, 'PAUSED', 'Press P to Resume', '#eab308');
    }
    else if (state.status === 'VICTORY') {
        drawOverlay(ctx, 'VICTORY!', 'Loading next level...', '#fbbf24');
    }
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D, title: string, subtitle: string, color: string) => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0,0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.font = '32px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText(title, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 20);
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(subtitle, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 40);
  };

  const gameLoop = (time: number) => {
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    
    update(dt);
    
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx);

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  useEffect(() => {
    const handleMenuKeys = (e: KeyboardEvent) => {
        if ((stateRef.current.status === 'MENU' || stateRef.current.status === 'GAME_OVER') && e.code === 'Space') {
            startGame();
        }
    };
    window.addEventListener('keydown', handleMenuKeys);
    return () => window.removeEventListener('keydown', handleMenuKeys);
  }, []);

  const openSage = () => {
    if (stateRef.current.status === 'PLAYING') togglePause();
    setSageOpen(true);
  };

  // --- Mobile Controls Helpers ---
  const bindTouch = (key: string) => ({
    onTouchStart: (e: React.TouchEvent) => { 
        e.preventDefault(); 
        keysRef.current.add(key); 
    },
    onTouchEnd: (e: React.TouchEvent) => { 
        e.preventDefault(); 
        keysRef.current.delete(key); 
    },
    onMouseDown: (e: React.MouseEvent) => {
         e.preventDefault();
         keysRef.current.add(key);
    },
    onMouseUp: (e: React.MouseEvent) => {
         e.preventDefault();
         keysRef.current.delete(key);
    },
    onMouseLeave: (e: React.MouseEvent) => {
         keysRef.current.delete(key);
    }
  });

  const handleMobileStart = (e: React.TouchEvent) => {
      e.preventDefault();
      if (stateRef.current.status === 'MENU' || stateRef.current.status === 'GAME_OVER') {
          startGame();
      } else {
          placeBomb();
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-2 sm:p-4 touch-none">
      {/* UI HUD */}
      <div className="w-full max-w-[720px] bg-slate-800 p-3 rounded-t-lg flex flex-wrap gap-4 justify-between items-center border-b-4 border-slate-700 shadow-lg">
        <div className="flex flex-col">
          <span className="text-yellow-400 font-bold text-[10px] uppercase tracking-wider">
             Lvl {uiState.level} • {uiState.themeName}
          </span>
          <span className="font-retro text-lg">{uiState.score.toString().padStart(6, '0')}</span>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="flex flex-col items-center">
              <span className="text-red-400 font-bold text-[10px] uppercase tracking-wider">Lives</span>
              <span className="font-retro text-lg">{uiState.lives}</span>
           </div>
           <div className="flex flex-col items-center">
              <span className="text-blue-400 font-bold text-[10px] uppercase tracking-wider">Time</span>
              <span className="font-retro text-lg">{uiState.time}</span>
           </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-slate-400 border-l border-slate-600 pl-4 hidden sm:flex">
             <div className="flex items-center gap-1" title="Max Bombs">
                 <Bomb size={12} className="text-orange-400"/>
                 <span className="text-white">{uiState.maxBombs}</span>
             </div>
             <div className="flex items-center gap-1" title="Explosion Range">
                 <Zap size={12} className="text-red-400"/>
                 <span className="text-white">{uiState.range}</span>
             </div>
             {uiState.hasKick && (
                <div className="flex items-center gap-1" title="Kick Ability">
                    <Footprints size={12} className="text-green-400"/>
                </div>
             )}
             <div className={`flex items-center gap-1 ${uiState.dashReady ? 'opacity-100' : 'opacity-30'}`} title="Dash Ready">
                <Wind size={12} className="text-blue-400"/>
             </div>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={toggleMute}
                className="bg-slate-700 hover:bg-slate-600 p-2 rounded text-white transition"
            >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button 
                onClick={openSage}
                className="bg-blue-600 hover:bg-blue-500 p-2 rounded text-white flex items-center gap-2 transition shadow-lg shadow-blue-900/50"
            >
                <Bot size={18} />
                <span className="hidden sm:inline font-bold text-xs">AI HELP</span>
            </button>
            <button 
                onClick={togglePause}
                className="bg-slate-700 hover:bg-slate-600 p-2 rounded text-white transition"
            >
                {uiState.status === 'PAUSED' ? <Play size={18} /> : <Pause size={18} />}
            </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative border-4 border-slate-700 bg-black shadow-2xl">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block max-w-full h-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* PC Controls Hint */}
      <div className="mt-4 text-slate-400 text-xs sm:text-sm flex flex-wrap justify-center gap-4 sm:gap-6 hidden md:flex">
        <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-slate-700 rounded border border-slate-600 font-retro text-[10px]">ARROWS</span>
            <span>Move</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-slate-700 rounded border border-slate-600 font-retro text-[10px]">SPACE</span>
            <span>Bomb</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-slate-700 rounded border border-slate-600 font-retro text-[10px]">SHIFT</span>
            <span>Dash</span>
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="flex w-full max-w-[450px] justify-between items-end mt-4 md:hidden px-4 pb-6 select-none touch-none">
         {/* D-Pad */}
         <div className="grid grid-cols-3 gap-2">
            <div></div>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-lg flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all"
                {...bindTouch('ArrowUp')}
            >
                <ArrowUp className="text-slate-400" size={32} />
            </button>
            <div></div>

            <button 
                className="w-14 h-14 bg-slate-800 rounded-lg flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all"
                {...bindTouch('ArrowLeft')}
            >
                <ArrowLeft className="text-slate-400" size={32} />
            </button>
            <div className="w-14 h-14 flex items-center justify-center">
                 <div className="w-4 h-4 rounded-full bg-slate-800"></div>
            </div>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-lg flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all"
                {...bindTouch('ArrowRight')}
            >
                <ArrowRight className="text-slate-400" size={32} />
            </button>

            <div></div>
            <button 
                className="w-14 h-14 bg-slate-800 rounded-lg flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all"
                {...bindTouch('ArrowDown')}
            >
                <ArrowDown className="text-slate-400" size={32} />
            </button>
            <div></div>
         </div>

         {/* Action Buttons */}
         <div className="flex flex-col gap-4">
             <button 
                className={`w-16 h-16 rounded-full flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1 transition-all ${uiState.dashReady ? 'bg-blue-600 border-blue-900 shadow-blue-900/50' : 'bg-slate-700 border-slate-900 opacity-50'}`}
                onTouchStart={(e) => { e.preventDefault(); activateDash(); }}
             >
                <Wind className="text-white" size={24} />
             </button>

             <button 
                className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center border-b-8 border-red-900 active:border-b-0 active:translate-y-2 transition-all shadow-lg shadow-red-900/50"
                onTouchStart={handleMobileStart}
                onMouseDown={(e) => { e.preventDefault(); if(stateRef.current.status !== 'PLAYING') startGame(); else placeBomb(); }}
             >
                <Bomb className="text-white" size={32} />
             </button>
         </div>
      </div>

      <SageModal 
        isOpen={sageOpen} 
        onClose={() => { setSageOpen(false); if (stateRef.current.status === 'PAUSED') togglePause(); }} 
        gameState={stateRef.current}
      />
    </div>
  );
};

export default Game;