import { Server } from 'socket.io';
import {
  GameState,
  TetrominoType,
  AiDifficulty,
  ServerEvent,
  ClientEvent,
} from '@transcendence/shared';
import { BagGenerator } from './engine/bag-generator';
import {
  getMinoCells,
  createEmptyBoard,
  isValidPosition,
  lockMino,
  clearLines,
  calcGhostY,
  tryRotate,
  addGarbageLines,
  detectTSpin,
  BOARD_ROWS,
  BOARD_COLS,
} from './engine/board';
import { calcGarbage, calcScore, isPerfectClear } from './engine/garbage';
import { calcAiMove } from './engine/ai-bot';

const LOCK_DELAY_MS = 500;
const GRAVITY_INTERVAL_MS = 1000; // Level 1: 1秒/段

export interface PlayerState {
  socketId: string;
  userId: string | null; // AI の場合は null
  board: any[][];
  activeMino: TetrominoType;
  activeX: number;
  activeY: number;
  activeRotation: 0 | 1 | 2 | 3;
  holdMino: TetrominoType | null;
  canHold: boolean;
  garbageQueue: number;
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: number;
  isGameOver: boolean;
  lastMoveWasRotation: boolean;
  // APM/PPS 計算
  startTime: number;
  attacksSent: number;
  piecesPlaced: number;
  tSpins: number;
  tetrises: number;
}

export class GameInstance {
  readonly roomId: string;
  private server: Server;
  private bag: BagGenerator;
  private players: Map<string, PlayerState> = new Map();
  private spectators: Set<string> = new Set();
  private gravityTimer: NodeJS.Timeout | null = null;
  private lockTimer: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private aiDifficulty: AiDifficulty | null = null;

  private onGameOver?: (
    roomId: string,
    winnerId: string | null,
    stats: Record<
      string,
      {
        userId: string | null;
        apm: number;
        pps: number;
        linesCleared: number;
        tSpins: number;
        tetrises: number;
        attacksSent: number;
        durationSeconds: number;
      }
    >,
  ) => void;

  constructor(
    roomId: string,
    server: Server,
    seed: number,
    onGameOver?: (
      roomId: string,
      winnerId: string | null,
      stats: Record<string, any>,
    ) => void,
  ) {
    this.roomId = roomId;
    this.server = server;
    this.bag = new BagGenerator(seed);
    this.onGameOver = onGameOver;
  }

  /** プレイヤーを追加 */
  addPlayer(socketId: string, userId: string | null): void {
    const firstMino = this.bag.next();
    this.players.set(socketId, {
      socketId,
      userId,
      board: createEmptyBoard(),
      activeMino: firstMino,
      activeX: 3,
      activeY: 18,
      activeRotation: 0,
      holdMino: null,
      canHold: true,
      garbageQueue: 0,
      score: 0,
      lines: 0,
      level: 1,
      combo: -1,
      b2b: 0,
      isGameOver: false,
      lastMoveWasRotation: false,
      startTime: Date.now(),
      attacksSent: 0,
      piecesPlaced: 0,
      tSpins: 0,
      tetrises: 0,
    });
  }

  /** 観戦者を追加 */
  addSpectator(socketId: string): void {
    this.spectators.add(socketId);
  }

  /** ゲームスタート */
  start(aiDifficulty?: AiDifficulty): void {
    this.isRunning = true;
    this.aiDifficulty = aiDifficulty ?? null;

    // 全プレイヤーに game:start を送信
    this.server.to(this.roomId).emit(ServerEvent.GAME_START, {
      roomId: this.roomId,
    });

    // 重力タイマー開始
    this.startGravity();

    // AI が存在する場合は非同期で動かす
    if (this.aiDifficulty) {
      this.runAiLoop();
    }
  }

  /** 重力ループ */
  private startGravity(): void {
    this.gravityTimer = setInterval(() => {
      this.players.forEach((player, socketId) => {
        if (player.isGameOver || (this.aiDifficulty && player.userId === null))
          return;
        this.applyGravity(socketId);
      });
    }, GRAVITY_INTERVAL_MS);
  }

  /** プレイヤー入力を処理 */
  applyInput(socketId: string, event: string): void {
    const player = this.players.get(socketId);
    if (!player || player.isGameOver || !this.isRunning) return;

    let moved = false;

    switch (event) {
      case ClientEvent.MOVE_LEFT:
        if (
          isValidPosition(
            player.board,
            player.activeMino,
            player.activeX - 1,
            player.activeY,
            player.activeRotation,
          )
        ) {
          player.activeX -= 1;
          player.lastMoveWasRotation = false;
          moved = true;
        }
        break;

      case ClientEvent.MOVE_RIGHT:
        if (
          isValidPosition(
            player.board,
            player.activeMino,
            player.activeX + 1,
            player.activeY,
            player.activeRotation,
          )
        ) {
          player.activeX += 1;
          player.lastMoveWasRotation = false;
          moved = true;
        }
        break;

      case ClientEvent.ROTATE_CW:
      case ClientEvent.ROTATE_CCW:
      case ClientEvent.ROTATE_180: {
        const dir =
          event === ClientEvent.ROTATE_CW
            ? 'CW'
            : event === ClientEvent.ROTATE_CCW
              ? 'CCW'
              : '180';
        const result = tryRotate(
          player.board,
          player.activeMino,
          player.activeX,
          player.activeY,
          player.activeRotation,
          dir,
        );
        if (result) {
          player.activeX = result.x;
          player.activeY = result.y;
          player.activeRotation = result.rotation;
          player.lastMoveWasRotation = true;
          moved = true;
        }
        break;
      }

      case ClientEvent.SOFT_DROP:
        if (
          isValidPosition(
            player.board,
            player.activeMino,
            player.activeX,
            player.activeY + 1,
            player.activeRotation,
          )
        ) {
          player.activeY += 1;
          player.score += 1;
          moved = true;
        }
        break;

      case ClientEvent.HARD_DROP:
        this.hardDrop(socketId, player);
        return;

      case ClientEvent.HOLD:
        this.holdMino(socketId, player);
        return;
    }

    if (moved) {
      // ロックタイマーリセット
      const isOnGround = !isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY + 1,
        player.activeRotation,
      );
      if (isOnGround) this.scheduleLock(socketId);
      else this.clearLockTimer(socketId);

      this.broadcastState(socketId, player);
    }
  }

  /** 重力落下 */
  private applyGravity(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    if (
      isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY + 1,
        player.activeRotation,
      )
    ) {
      player.activeY += 1;
      this.broadcastState(socketId, player);
    } else {
      this.scheduleLock(socketId);
    }
  }

  /** ハードドロップ */
  private hardDrop(socketId: string, player: PlayerState): void {
    let dropY = player.activeY;
    while (
      isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        dropY + 1,
        player.activeRotation,
      )
    ) {
      dropY++;
      player.score += 2;
    }
    player.activeY = dropY;
    this.lockPiece(socketId, player);
  }

  /** ホールド */
  private holdMino(socketId: string, player: PlayerState): void {
    if (!player.canHold) return;

    const prev = player.holdMino;
    player.holdMino = player.activeMino;
    player.activeMino = prev ?? this.bag.next();
    player.canHold = false;
    this.spawnPiece(socketId, player);
    if (!player.isGameOver) {
      this.broadcastState(socketId, player);
    }
  }

  /** ピースをロック（固定） */
  private lockPiece(socketId: string, player: PlayerState): void {
    this.clearLockTimer(socketId);

    // T-Spin 判定
    const tspin = detectTSpin(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
      player.lastMoveWasRotation,
    );

    // Lock Out 判定用 (Vanish Zoneで完全に固定されたか)
    const cells = getMinoCells(
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
    );
    let maxLockY = -1;
    for (const [r, c] of cells) {
      maxLockY = Math.max(maxLockY, r);
    }

    // ピースを固定
    player.board = lockMino(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
    );
    const { board: clearedBoard, linesCleared } = clearLines(player.board);

    // Clutch ルール：ラインを消せなかった場合、かつピースが完全にVanish Zone(y < 20)に固定されたらLock Out
    if (linesCleared === 0 && maxLockY < 20) {
      this.handleGameOver(socketId);
      return;
    }
    player.board = clearedBoard;
    player.piecesPlaced++;

    if (linesCleared > 0) {
      player.combo++;
      player.lines += linesCleared;
      player.level = Math.floor(player.lines / 10) + 1;

      const perfectClear = isPerfectClear(player.board);
      const { garbage, clearType } = calcGarbage(
        linesCleared,
        tspin,
        perfectClear,
        player.b2b > 0,
      );

      if (clearType === 'tetris') player.tetrises++;
      if (tspin) player.tSpins++;

      // B2B カウント更新
      const isB2b = clearType === 'tetris' || (tspin && linesCleared > 0);
      if (isB2b) player.b2b++;
      else if (linesCleared > 0) player.b2b = 0;

      player.score += calcScore(clearType, player.level, player.combo);

      if (garbage > 0) {
        player.attacksSent += garbage;
        this.sendGarbageToOpponent(socketId, garbage);
      }
    } else {
      player.combo = -1;
    }

    // 蓄積おじゃまを適用
    if (player.garbageQueue > 0) {
      player.board = addGarbageLines(player.board, player.garbageQueue);
      this.server
        .to(socketId)
        .emit(ServerEvent.GARBAGE_INCOMING, { lines: player.garbageQueue });
      player.garbageQueue = 0;
    }

    // 次のミノを取得
    player.activeMino = this.bag.next();
    player.canHold = true;
    this.spawnPiece(socketId, player);
    if (!player.isGameOver) {
      this.broadcastState(socketId, player);
    }
  }

  /** ミノをスポーンさせる (TETR.IO仕様: 1マス上にスポーン後、即時落下可能なら落下) */
  private spawnPiece(socketId: string, player: PlayerState): void {
    player.activeX = 3;
    player.activeY = 17; // 1マス上にスポーン
    player.activeRotation = 0;
    player.lastMoveWasRotation = false;

    // ゲームオーバー判定 (y=17 でブロックされていたら Block Out)
    if (
      !isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY,
        player.activeRotation,
      )
    ) {
      this.handleGameOver(socketId);
      return;
    }

    // もし y=18 が空いていれば、即座に重力を適用して1マス下げる
    if (
      isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY + 1,
        player.activeRotation,
      )
    ) {
      player.activeY += 1;
    }
  }

  /** ロック遅延タイマー */
  private scheduleLock(socketId: string): void {
    if (this.lockTimer.has(socketId)) return;
    const timer = setTimeout(() => {
      const player = this.players.get(socketId);
      if (player && !player.isGameOver) this.lockPiece(socketId, player);
      this.lockTimer.delete(socketId);
    }, LOCK_DELAY_MS);
    this.lockTimer.set(socketId, timer);
  }

  private clearLockTimer(socketId: string): void {
    const t = this.lockTimer.get(socketId);
    if (t) {
      clearTimeout(t);
      this.lockTimer.delete(socketId);
    }
  }

  /** おじゃまを相手に送信 */
  private sendGarbageToOpponent(senderSocketId: string, lines: number): void {
    this.players.forEach((player, socketId) => {
      if (socketId !== senderSocketId && !player.isGameOver) {
        player.garbageQueue += lines;
      }
    });
  }

  /** 状態をブロードキャスト */
  private broadcastState(socketId: string, player: PlayerState): void {
    const elapsed = (Date.now() - player.startTime) / 60000; // 分
    const apm = elapsed > 0 ? player.attacksSent / elapsed : 0;
    const pps = elapsed > 0 ? (player.piecesPlaced / elapsed) * 60 : 0;

    const gameState: GameState = {
      board: player.board,
      activeMino: {
        type: player.activeMino,
        x: player.activeX,
        y: player.activeY,
        rotation: player.activeRotation,
      },
      ghostY: calcGhostY(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY,
        player.activeRotation,
      ),
      nextMinos: this.bag.peek(5),
      holdMino: player.holdMino,
      canHold: player.canHold,
      garbageQueue: player.garbageQueue,
      score: player.score,
      lines: player.lines,
      level: player.level,
      combo: player.combo,
      b2b: player.b2b,
      isGameOver: player.isGameOver,
      apm: Math.round(apm * 10) / 10,
      pps: Math.round(pps * 100) / 100,
    };

    // 自分の状態を送信
    this.server.to(socketId).emit(ServerEvent.GAME_STATE, gameState);

    // 相手と観戦者に自分の盤面を送信
    const opponentState = {
      playerId: socketId,
      board: player.board,
      garbageQueue: player.garbageQueue,
      isGameOver: player.isGameOver,
      apm: gameState.apm,
      pps: gameState.pps,
    };

    this.players.forEach((_, sid) => {
      if (sid !== socketId)
        this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);
    });
    this.spectators.forEach((sid) => {
      this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);
    });
  }

  /** ゲームオーバー処理 */
  public handleGameOver(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player || player.isGameOver) return;
    
    player.isGameOver = true;

    const survivors = [...this.players.values()].filter((p) => !p.isGameOver);
    const winner = survivors.length === 1 ? survivors[0] : null;

    this.server.to(this.roomId).emit(ServerEvent.GAME_OVER, {
      loserId: socketId,
      winnerId: winner?.socketId ?? null,
    });

    if (winner || survivors.length === 0) {
      if (this.onGameOver) {
        const stats: Record<string, any> = {};
        const now = Date.now();
        this.players.forEach((p, sid) => {
          const duration = (now - p.startTime) / 1000;
          const durationMinutes = duration / 60;
          stats[sid] = {
            userId: p.userId,
            apm: durationMinutes > 0 ? p.attacksSent / durationMinutes : 0,
            pps: durationMinutes > 0 ? p.piecesPlaced / duration : 0,
            linesCleared: p.lines,
            tSpins: p.tSpins,
            tetrises: p.tetrises,
            attacksSent: p.attacksSent,
            durationSeconds: duration,
          };
        });
        this.onGameOver(this.roomId, winner?.socketId ?? null, stats);
      }
      this.stop();
    }
  }

  /** AI ループ */
  private async runAiLoop(): Promise<void> {
    const aiEntry = [...this.players.entries()].find(
      ([, p]) => p.userId === null,
    );
    if (!aiEntry || !this.aiDifficulty) return;
    const [aiSocketId, aiPlayer] = aiEntry;

    while (this.isRunning && !aiPlayer.isGameOver) {
      const move = await calcAiMove(
        aiPlayer.board,
        aiPlayer.activeMino,
        this.aiDifficulty,
      );

      if (!this.isRunning) break;

      // AI の移動を適用
      const rotations = move.rotation - aiPlayer.activeRotation;
      for (let i = 0; i < Math.abs(rotations); i++) {
        this.applyInput(
          aiSocketId,
          rotations > 0 ? ClientEvent.ROTATE_CW : ClientEvent.ROTATE_CCW,
        );
      }
      const dx = move.x - aiPlayer.activeX;
      for (let i = 0; i < Math.abs(dx); i++) {
        this.applyInput(
          aiSocketId,
          dx > 0 ? ClientEvent.MOVE_RIGHT : ClientEvent.MOVE_LEFT,
        );
      }
      this.applyInput(aiSocketId, ClientEvent.HARD_DROP);
    }
  }

  /** ゲーム停止 */
  stop(): void {
    this.isRunning = false;
    if (this.gravityTimer) clearInterval(this.gravityTimer);
    this.lockTimer.forEach((t) => clearTimeout(t));
    this.lockTimer.clear();
  }

  getPlayers(): Map<string, PlayerState> {
    return this.players;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
