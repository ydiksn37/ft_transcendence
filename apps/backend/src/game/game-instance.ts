import { Namespace, Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  GameState,
  TetrominoType,
  AiDifficulty,
  ServerEvent,
  ClientEvent,
  AI_BOT_CONFIGS,
  detectOtherSpin,
  emptyOtherSpins,
  type OtherSpinCounts,
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
import {
  AgentAction,
  AgentDecisionResponse,
  AGENT_ACTIONS,
  boardToAgentRows,
  VISIBLE_ROW_OFFSET,
} from './headless/headless-battle';
import { AiAgentService } from './engine/ai-agent.service';

const LOCK_DELAY_MS = 500;
const GRAVITY_INTERVAL_MS = 1000; // Level 1: 1秒/段
const AI_MATCH_COUNTDOWN_MS = 1000;
const DEFAULT_AI_ACTION_INTERVAL_MS = 50;
const MAX_AI_ACTIONS = 1000;

export interface PlayerState {
  pieceId: number;
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
  lastRotationKickIndex: number;
  lowestY: number;
  lockResetCount: number;
  // APM/PPS 計算
  startTime: number;
  attacksSent: number;
  piecesPlaced: number;
  tSpins: number;
  otherSpins: OtherSpinCounts;
  tetrises: number;
  lastLock?: {
    id: number;
    lines: number;
    tSpinType: 'none' | 't-spin' | 'mini-t-spin';
    perfectClear: boolean;
  };
}

export class GameInstance {
  // Process-wide to avoid reusing IDs when a custom room starts a rematch.
  private static nextPieceId = 0;
  private readonly logger = new Logger(GameInstance.name);
  readonly roomId: string;
  private server: Server | Namespace;
  private bag: BagGenerator;
  private players: Map<string, PlayerState> = new Map();
  private spectators: Set<string> = new Set();
  private gravityTimer: NodeJS.Timeout | null = null;
  private simulationStartTimer: NodeJS.Timeout | null = null;
  private pendingAiStart: (() => void) | null = null;
  private humanReady = false;
  private lockTimer: Map<string, NodeJS.Timeout> = new Map();
  private playerBags: Map<string, BagGenerator> = new Map();
  private isRunning = false;
  private aiDifficulty: AiDifficulty | null = null;
  private aiActionIntervalMs = DEFAULT_AI_ACTION_INTERVAL_MS;
  private aiAgentService?: AiAgentService;

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
        otherSpins: OtherSpinCounts;
        tetrises: number;
        attacksSent: number;
        durationSeconds: number;
      }
    >,
  ) => void | Promise<void>;

  constructor(
    roomId: string,
    server: Server | Namespace,
    private readonly seed: number,
    onGameOver?: (
      roomId: string,
      winnerId: string | null,
      stats: Record<string, any>,
    ) => void | Promise<void>,
    aiAgentService?: AiAgentService,
  ) {
    this.roomId = roomId;
    this.server = server;
    this.bag = new BagGenerator(seed);
    this.onGameOver = onGameOver;
    this.aiAgentService = aiAgentService;
  }

  /** プレイヤーを追加 */
  addPlayer(socketId: string, userId: string | null): void {
    if (!this.playerBags.has(socketId))
      this.playerBags.set(socketId, new BagGenerator(this.seed));
    const firstMino = this.bagFor(socketId).next();
    this.players.set(socketId, {
      pieceId: GameInstance.nextPieceId++,
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
      lastRotationKickIndex: 0,
      lowestY: 18,
      lockResetCount: 0,
      startTime: Date.now(),
      attacksSent: 0,
      piecesPlaced: 0,
      tSpins: 0,
      otherSpins: emptyOtherSpins(),
      tetrises: 0,
    });
  }

  private bagFor(socketId: string): BagGenerator {
    return this.playerBags.get(socketId) ?? this.bag;
  }

  /** 観戦者を追加 */
  addSpectator(socketId: string): void {
    this.spectators.add(socketId);
  }
  removeSpectator(socketId: string): void {
    this.spectators.delete(socketId);
  }

  /** Move an existing player/spectator to a newly connected Socket.IO id. */
  rebindSocket(oldSocketId: string, newSocketId: string): boolean {
    if (oldSocketId === newSocketId) return this.players.has(oldSocketId);
    if (this.players.has(newSocketId)) return false;

    const player = this.players.get(oldSocketId);
    if (player) {
      // A pending lock callback captures the old id. Gravity will schedule a
      // fresh lock after reconnect, so cancel the stale callback here.
      this.clearLockTimer(oldSocketId);
      this.players.delete(oldSocketId);
      player.socketId = newSocketId;
      this.players.set(newSocketId, player);

      const bag = this.playerBags.get(oldSocketId);
      if (bag) {
        this.playerBags.delete(oldSocketId);
        this.playerBags.set(newSocketId, bag);
      }
    }

    if (this.spectators.delete(oldSocketId)) {
      this.spectators.add(newSocketId);
    }

    return !!player;
  }

  broadcastSnapshot(): void {
    this.players.forEach((player, id) => this.broadcastState(id, player));
  }

  /** Publish the exact initial state before READY; start without drawing a
   * new piece or consuming Next again. stop() also cancels this countdown. */
  prepareHumanMatch(countdownMs = 3000): void {
    if (this.isRunning || this.simulationStartTimer) return;
    this.players.forEach((player) => {
      player.activeX = this.spawnColumn(player);
    });
    this.broadcastSnapshot();
    this.simulationStartTimer = setTimeout(() => {
      this.simulationStartTimer = null;
      this.start();
    }, countdownMs);
  }

  /** ゲームスタート */
  start(
    aiDifficulty?: AiDifficulty,
    aiActionIntervalMs = DEFAULT_AI_ACTION_INTERVAL_MS,
  ): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.aiDifficulty = aiDifficulty ?? null;
    this.aiActionIntervalMs = Math.max(
      0,
      Math.min(1000, Math.trunc(aiActionIntervalMs)),
    );

    // 全プレイヤーに game:start を送信
    this.server.to(this.roomId).emit(ServerEvent.GAME_START, {
      roomId: this.roomId,
    });

    // AI戦には盤面を送る第2のブラウザがないため、初期状態もサーバーから配信する。
    this.players.forEach((player, socketId) => {
      player.activeX = this.spawnColumn(player);
      this.broadcastState(socketId, player);
    });

    const beginSimulation = () => {
      this.simulationStartTimer = null;
      if (!this.isRunning) return;

      const startedAt = Date.now();
      this.players.forEach((player) => {
        player.startTime = startedAt;
      });
      this.startGravity();

      // AI が存在する場合は非同期で動かす
      if (this.aiDifficulty) {
        void this.runAiLoop().catch((error: unknown) => {
          if (!this.isRunning) return; // Expected cancellation from stop().
          this.logger.error(
            `AI loop failed in room ${this.roomId}`,
            error instanceof Error ? error.stack : String(error),
          );
          this.server.to(this.roomId).emit(ServerEvent.ERROR, {
            message: 'AI opponent stopped unexpectedly',
          });

          const aiSocketId = `ai_${this.roomId}`;
          const aiPlayer = this.players.get(aiSocketId);
          if (aiPlayer && !aiPlayer.isGameOver) {
            this.handleGameOver(aiSocketId);
          }
        });
      }
    };

    // Minimum countdown plus browser READY acknowledgement: network or tab
    // delays must never let the AI start before the human can use controls.
    if (this.aiDifficulty) {
      this.humanReady = false;
      this.pendingAiStart = beginSimulation;
      this.simulationStartTimer = setTimeout(() => {
        this.simulationStartTimer = null;
        if (this.humanReady) this.beginReadyAiMatch();
      }, AI_MATCH_COUNTDOWN_MS);
    } else {
      beginSimulation();
    }
  }

  /** The browser acknowledges only after its READY/input lock has ended. */
  confirmAiReady(socketId: string): void {
    if (
      !this.isRunning ||
      !this.aiDifficulty ||
      !this.pendingAiStart ||
      !this.players.has(socketId) ||
      socketId === `ai_${this.roomId}`
    )
      return;
    this.humanReady = true;
    if (!this.simulationStartTimer) this.beginReadyAiMatch();
  }

  private beginReadyAiMatch(): void {
    const begin = this.pendingAiStart;
    this.pendingAiStart = null;
    begin?.();
  }

  /** 重力ループ */
  private startGravity(): void {
    this.gravityTimer = setInterval(() => {
      this.players.forEach((player, socketId) => {
        if (player.isGameOver) return;

        // VS_AIモードでは:
        // - AIは自前のロジックで操作を送信するため重力不要
        // - 人間はフロントエンドでシミュレーションするためサーバー側重力による自滅を防ぐ
        if (this.aiDifficulty) return;

        this.applyGravity(socketId);
      });
    }, GRAVITY_INTERVAL_MS);
  }

  /** プレイヤー入力を処理 */
  applyInput(socketId: string, event: string, pieceId?: number): void {
    const player = this.players.get(socketId);
    if (!player || player.isGameOver || !this.isRunning) return;
    if (pieceId !== undefined && pieceId !== player.pieceId) return;

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
          player.lastRotationKickIndex = result.kickIndex;
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
          player.lastMoveWasRotation = false;
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
      if (player.activeY > player.lowestY) {
        player.lowestY = player.activeY;
        player.lockResetCount = 0;
      }

      const isOnGround = !isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY + 1,
        player.activeRotation,
      );
      if (isOnGround) this.scheduleLock(socketId, true);
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
      player.lastMoveWasRotation = false;
      if (player.activeY > player.lowestY) {
        player.lowestY = player.activeY;
        player.lockResetCount = 0;
      }
      this.broadcastState(socketId, player);
    } else {
      this.scheduleLock(socketId);
    }
  }

  /** ハードドロップ */
  private hardDrop(
    socketId: string,
    player: PlayerState,
    deferGarbage?: (lines: number) => void,
  ): void {
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
    if (dropY > player.activeY) player.lastMoveWasRotation = false;
    player.activeY = dropY;
    this.lockPiece(socketId, player, deferGarbage);
  }

  /** ホールド */
  private holdMino(socketId: string, player: PlayerState): void {
    if (!player.canHold) return;

    const prev = player.holdMino;
    player.holdMino = player.activeMino;
    player.activeMino = prev ?? this.bagFor(socketId).next();
    player.canHold = false;
    this.spawnPiece(socketId, player);
    if (!player.isGameOver) {
      this.broadcastState(socketId, player);
    }
  }

  /** ピースをロック（固定） */
  private lockPiece(
    socketId: string,
    player: PlayerState,
    deferGarbage?: (lines: number) => void,
  ): void {
    this.clearLockTimer(socketId);

    // ピースを固定し、消去行数を確定してから T-Spin を分類する。
    const lockedBoard = lockMino(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
    );
    const { board: clearedBoard, linesCleared } = clearLines(lockedBoard);
    const tspin = detectTSpin(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
      player.lastMoveWasRotation,
      player.lastRotationKickIndex,
      linesCleared,
    );

    // Lock Out 判定用 (Vanish Zoneで完全に固定されたか)
    const cells = getMinoCells(
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
    );
    const otherSpin = detectOtherSpin(
      player.activeMino,
      player.lastMoveWasRotation,
      cells,
      (row, col) =>
        col >= 0 &&
        col < 10 &&
        row < 40 &&
        (row < 0 || player.board[row][col] === null),
    );
    let maxLockY = -1;
    for (const [r] of cells) {
      maxLockY = Math.max(maxLockY, r);
    }

    // Clutch ルール：ラインを消せなかった場合、かつピースが完全にVanish Zone(y < 20)に固定されたらLock Out
    if (linesCleared === 0 && maxLockY < 20) {
      this.handleGameOver(socketId);
      return;
    }
    player.board = clearedBoard;
    player.piecesPlaced++;

    const perfectClear = isPerfectClear(player.board);

    player.lastLock = {
      id: player.piecesPlaced,
      lines: linesCleared,
      tSpinType:
        tspin === 'tspin'
          ? 't-spin'
          : tspin === 'tspin_mini'
            ? 'mini-t-spin'
            : 'none',
      perfectClear: perfectClear,
    };

    if (linesCleared > 0) {
      player.combo++;
      player.lines += linesCleared;
      player.level = Math.floor(player.lines / 10) + 1;

      const { garbage, clearType } = calcGarbage(
        linesCleared,
        tspin,
        perfectClear,
        player.b2b > 0,
        player.combo,
      );

      if (clearType === 'tetris') player.tetrises++;
      if (tspin) player.tSpins++;
      if (otherSpin) player.otherSpins[otherSpin]++;

      // B2B カウント更新
      const isB2b = clearType === 'tetris' || (tspin && linesCleared > 0);
      if (isB2b) player.b2b++;
      else if (linesCleared > 0) player.b2b = 0;

      player.score += calcScore(clearType, player.level, player.combo);

      if (garbage > 0) {
        player.attacksSent += garbage;
        if (deferGarbage) deferGarbage(garbage);
        else this.sendGarbageToOpponent(socketId, garbage);
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
    player.activeMino = this.bagFor(socketId).next();
    player.canHold = true;
    this.spawnPiece(socketId, player);
    if (!player.isGameOver) {
      this.broadcastState(socketId, player);
    }
  }

  private spawnColumn(player: PlayerState): number {
    // The local frontend centers the shape's bounding box: O is 2 columns
    // wide, all other spawn matrices are 3 or 4 columns wide. Human matches
    // must use that same origin, rather than spawning O one column left.
    // C++/AI routes retain their existing x=3 Hold/spawn protocol; they are
    // separate from authoritative human multiplayer and are not rebased here.
    if (this.isAiMatch) return 3;
    const width =
      player.activeMino === 'O' ? 2 : player.activeMino === 'I' ? 4 : 3;
    return Math.floor(BOARD_COLS / 2) - Math.ceil(width / 2);
  }

  /** ミノをスポーンさせる (TETR.IO仕様: 1マス上にスポーン後、即時落下可能なら落下) */
  private spawnPiece(socketId: string, player: PlayerState): void {
    player.pieceId = GameInstance.nextPieceId++;
    player.activeX = this.spawnColumn(player);
    player.activeY = 17; // 1マス上にスポーン
    player.activeRotation = 0;
    player.lastMoveWasRotation = false;
    player.lowestY = 17;
    player.lockResetCount = 0;
    player.lastRotationKickIndex = 0;

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
  private scheduleLock(
    socketId: string,
    isMoveOnGround: boolean = false,
  ): void {
    const player = this.players.get(socketId);
    if (!player) return;

    if (isMoveOnGround) {
      if (player.lockResetCount < 15) {
        player.lockResetCount++;
        this.clearLockTimer(socketId);
      } else {
        // Just touched the floor or already running, but reached limit
        if (!this.lockTimer.has(socketId)) {
          this.lockPiece(socketId, player);
        }
        return;
      }
    } else {
      if (this.lockTimer.has(socketId)) {
        return; // Already running and not a move, keep running
      } else {
        // Just touched the floor via gravity
        if (player.lockResetCount >= 15) {
          this.lockPiece(socketId, player);
          return;
        }
      }
    }

    const timer = setTimeout(() => {
      const p = this.players.get(socketId);
      if (p && !p.isGameOver) this.lockPiece(socketId, p);
      this.lockTimer.delete(socketId);
    }, LOCK_DELAY_MS);
    this.lockTimer.set(socketId, timer);
  }

  public get isAiMatch(): boolean {
    return this.aiDifficulty !== null;
  }

  public receiveGarbageFromClient(
    senderSocketId: string,
    lines: number,
    generated?: number,
  ): void {
    const player = this.players.get(senderSocketId);
    if (player) {
      player.attacksSent += generated ?? lines;
    }
    this.sendGarbageToOpponent(senderSocketId, lines);
  }

  public updatePlayerBoard(
    socketId: string,
    frontendStage: any[][],
    score: number,
  ): void {
    const player = this.players.get(socketId);
    if (!player || player.isGameOver) return;

    // frontendStage: [string | 0, string][]
    const backendBoard = createEmptyBoard();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (frontendStage[r] && frontendStage[r][c]) {
          const val = frontendStage[r][c][0];
          const status = frontendStage[r][c][1];
          // Ghost は無視し、実際に置かれたブロックと固定中のブロックを反映
          if (status === 'merged' && val !== 0) {
            backendBoard[r][c] =
              val === 'X' ? 'GARBAGE' : (val as TetrominoType);
          }
        }
      }
    }

    player.board = backendBoard;
    player.score = score;
  }

  public handleClientGameOver(socketId: string): Promise<void> {
    return this.handleGameOver(socketId);
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
    const targets = [...this.players.entries()].filter(
      ([id, p]) => id !== senderSocketId && !p.isGameOver,
    );

    if (targets.length === 0) return;

    // 生存している相手におじゃまを分配する（割り切れない場合は切り捨て等、今回は単純に Math.floor(lines / targets.length) ただし最低1は送る？）
    // ユーザーの要件「半分ずつ送る」に従い、等分する。
    const sentLines =
      targets.length > 1 ? Math.floor(lines / targets.length) : lines;
    if (sentLines === 0) return;

    targets.forEach(([socketId, player]) => {
      player.garbageQueue += sentLines;

      // 相手が人間（AIではない）なら、フロントエンドにせり上がり用のお邪魔ライン数を送信
      if (!socketId.startsWith('ai_')) {
        this.server.to(socketId).emit('receive_garbage', { lines: sentLines });
      }
    });
  }

  /** 状態をブロードキャスト */
  private broadcastState(socketId: string, player: PlayerState): void {
    const elapsed = (Date.now() - player.startTime) / 60000; // 分
    const apm = elapsed > 0 ? player.attacksSent / elapsed : 0;
    const pps = elapsed > 0 ? (player.piecesPlaced / elapsed) * 60 : 0;

    const gameState: GameState = {
      pieceId: player.pieceId,
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
      nextMinos: this.bagFor(socketId).peek(5),
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
      lastLock: player.lastLock,
    };

    // 自分の状態を送信
    this.server.to(socketId).emit(ServerEvent.GAME_STATE, {
      ...gameState,
      roomId: this.roomId,
      started: this.isRunning,
      piecesPlaced: player.piecesPlaced,
      attacksSent: player.attacksSent,
    });

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
      if (sid !== socketId) {
        this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);

        // AIの盤面更新を、フロントエンドの40行ステージ形式に合わせて送信
        if (
          !this.isAiMatch ||
          (socketId === `ai_${this.roomId}` && sid !== `ai_${this.roomId}`)
        ) {
          const frontendStage: [string | 0, 'clear' | 'merged'][][] =
            player.board.map((row) =>
              row.map((cell) => {
                if (cell === null) return [0, 'clear'];
                if (cell === 'GARBAGE') return ['X', 'merged'];
                return [cell, 'merged'];
              }),
            );

          // 固定盤面には含まれない操作中ミノも重ねて、現在のAI状態を表示する。
          if (!player.isGameOver) {
            for (const [row, col] of getMinoCells(
              player.activeMino,
              player.activeX,
              player.activeY,
              player.activeRotation,
            )) {
              if (
                row >= 0 &&
                row < BOARD_ROWS &&
                col >= 0 &&
                col < BOARD_COLS
              ) {
                // GameBoard hides top-buffer stage cells with the "clear"
                // status, so use the solid visual status for this snapshot.
                frontendStage[row][col] = [player.activeMino, 'merged'];
              }
            }
          }
          this.server.to(sid).emit('opponent_board_update', {
            roomId: this.roomId,
            playerId: socketId,
            stage: frontendStage,
            score: player.score,
            next: this.bagFor(socketId).peek(5),
            hold: player.holdMino,
            isGameOver: player.isGameOver,
          });
        }
      }
    });
    this.spectators.forEach((sid) => {
      this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);

      // フロントエンド互換の盤面データをスペクテイターにも送信
      const frontendStage: [string | 0, 'clear' | 'merged'][][] =
        player.board.map((row) =>
          row.map((cell) => {
            if (cell === null) return [0, 'clear'];
            if (cell === 'GARBAGE') return ['X', 'merged'];
            return [cell, 'merged'];
          }),
        );
      // 操作中ミノも重ねる
      if (!player.isGameOver) {
        for (const [row, col] of getMinoCells(
          player.activeMino,
          player.activeX,
          player.activeY,
          player.activeRotation,
        )) {
          if (row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS) {
            frontendStage[row][col] = [player.activeMino, 'merged'];
          }
        }
      }
      this.server.to(sid).emit('opponent_board_update', {
        roomId: this.roomId,
        next: this.bagFor(socketId).peek(5),
        hold: player.holdMino,
        playerId: socketId,
        stage: frontendStage,
        score: player.score,
        isGameOver: player.isGameOver,
      });
    });
  }

  /** ゲームオーバー処理 */
  public async handleGameOver(socketId: string): Promise<void> {
    const player = this.players.get(socketId);
    if (!player || player.isGameOver) return;

    player.isGameOver = true;

    // ゲームオーバーになった最新の盤面（お邪魔のせり上がり等）を必ずフロントエンドに送る
    this.broadcastState(socketId, player);

    // AIマッチでAIがゲームオーバーになった場合、クライアントにせり上がり演出等を見せるための猶予を設ける
    if (this.isAiMatch && socketId === `ai_${this.roomId}`) {
      await new Promise((r) => setTimeout(r, 1500));
    }

    const survivors = [...this.players.values()].filter((p) => !p.isGameOver);
    const winner = survivors.length === 1 ? survivors[0] : null;

    const gameOverPayload = {
      roomId: this.roomId,
      loserId: socketId,
      winnerId: winner?.socketId ?? null,
    };
    this.server.to(this.roomId).emit(ServerEvent.GAME_OVER, gameOverPayload);

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
            otherSpins: p.otherSpins,
            tetrises: p.tetrises,
            attacksSent: p.attacksSent,
            durationSeconds: duration,
          };
        });
        void Promise.resolve(
          this.onGameOver(this.roomId, winner?.socketId ?? null, stats),
        ).catch((error: unknown) =>
          this.logger.error('onGameOver callback failed', error),
        );
      }
      await this.stop();
    }
  }

  /** AI ループ */
  private async runAiLoop(): Promise<void> {
    const aiSocketId = `ai_${this.roomId}`;
    const aiPlayer = this.players.get(aiSocketId);
    if (!aiPlayer || !this.aiDifficulty || !this.aiAgentService) return;

    while (this.isRunning && !aiPlayer.isGameOver) {
      const opponent = [...this.players.values()].find(
        (player) => player.socketId !== aiSocketId,
      );
      const decision = await this.aiAgentService.getDecision(
        this.aiDifficulty,
        {
          matchId: this.roomId,
          playerId: aiSocketId,
          board: boardToAgentRows(aiPlayer.board),
          piece: aiPlayer.activeMino,
          next: this.bagFor(aiSocketId).peek(5),
          hold: aiPlayer.holdMino,
          canHold: aiPlayer.canHold,
          b2b: aiPlayer.b2b,
          combo: aiPlayer.combo,
          garbageQueue: aiPlayer.garbageQueue,
          spawn: {
            x: aiPlayer.activeX,
            y: aiPlayer.activeY - VISIBLE_ROW_OFFSET,
            rotation: aiPlayer.activeRotation,
          },
          opponent: {
            board: boardToAgentRows(opponent?.board ?? createEmptyBoard()),
            garbageQueue: opponent?.garbageQueue ?? 0,
            attacksSent: opponent?.attacksSent ?? 0,
            piecesPlaced: opponent?.piecesPlaced ?? 0,
          },
        },
      );

      if (!this.isRunning || aiPlayer.isGameOver) break;

      const delay = AI_BOT_CONFIGS[this.aiDifficulty].thinkDelayMs;
      await new Promise((r) => setTimeout(r, delay));
      if (!this.isRunning || aiPlayer.isGameOver) break;

      if (decision.gameOver) {
        // AIがおじゃまブロックによって死んだことを見せるため、
        // キューに残っているお邪魔ブロックを強制的に適用してからゲームオーバーを宣言する
        if (aiPlayer.garbageQueue > 0) {
          aiPlayer.board = addGarbageLines(
            aiPlayer.board,
            aiPlayer.garbageQueue,
          );
          aiPlayer.garbageQueue = 0;
        }

        this.handleGameOver(aiSocketId);
        break;
      }

      this.validateCppDecision(aiPlayer, decision, false);
      for (let index = 0; index < decision.actions.length; index++) {
        if (!this.isRunning || aiPlayer.isGameOver) return;
        const action = decision.actions[index];
        this.applyInput(aiSocketId, this.agentActionToClientEvent(action));

        // Socketの連続更新が1描画にまとめられないよう、操作を短い間隔で再生する。
        // 最終操作の後は次の探索へそのまま進む。
        const replayDelayMs = this.aiReplayDelayMs(
          action,
          decision.actions[index + 1],
          this.aiActionIntervalMs,
        );
        if (index < decision.actions.length - 1 && replayDelayMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, replayDelayMs),
          );
        }
      }
    }
  }

  private aiReplayDelayMs(
    action: AgentAction,
    nextAction: AgentAction | undefined,
    normalDelayMs: number,
  ): number {
    // AI SDF is infinite: consecutive soft-drop cells are applied without a
    // timer. Keep the normal pause after the final cell so the reached
    // position is still visible before a rotation, movement, or lock.
    if (action === 'soft_drop' && nextAction === 'soft_drop') return 0;
    return normalDelayMs;
  }

  private validateCppDecision(
    player: PlayerState,
    decision: AgentDecisionResponse,
    requirePlacement = true,
  ): void {
    if (
      decision.actions.length === 0 ||
      decision.actions.length > MAX_AI_ACTIONS ||
      decision.actions.some(
        (action) => !(AGENT_ACTIONS as readonly string[]).includes(action),
      ) ||
      decision.actions.at(-1) !== 'hard_drop' ||
      decision.actions.slice(0, -1).includes('hard_drop')
    ) {
      throw new Error('C++ AI returned an invalid action sequence');
    }

    // hard_drop より前の操作を一時状態で再現し、C++の placement と照合する。
    // C++ main は placement を常に返すため、TSとのルール差もここで検出できる。
    if (!decision.placement && requirePlacement) {
      throw new Error('C++ AI response has no placement');
    }
    if (!decision.placement) return;

    const simulated = { ...player };
    for (const action of decision.actions.slice(0, -1)) {
      this.applyAgentActionToState(simulated, action);
    }
    const expectedY = calcGhostY(
      simulated.board,
      simulated.activeMino,
      simulated.activeX,
      simulated.activeY,
      simulated.activeRotation,
    );
    if (
      decision.placement.piece !== simulated.activeMino ||
      decision.placement.x !== simulated.activeX ||
      decision.placement.y !== expectedY - VISIBLE_ROW_OFFSET ||
      decision.placement.rotation !== simulated.activeRotation
    ) {
      throw new Error(
        `C++/TS placement mismatch: C++=${JSON.stringify(decision.placement)} ` +
          `TS=${JSON.stringify({
            piece: simulated.activeMino,
            x: simulated.activeX,
            y: expectedY - VISIBLE_ROW_OFFSET,
            rotation: simulated.activeRotation,
          })} actions=${JSON.stringify(decision.actions)}`,
      );
    }
  }

  private applyAgentActionToState(
    player: PlayerState,
    action: AgentAction,
  ): void {
    if (action === 'move_left' || action === 'move_right') {
      const dx = action === 'move_left' ? -1 : 1;
      if (
        isValidPosition(
          player.board,
          player.activeMino,
          player.activeX + dx,
          player.activeY,
          player.activeRotation,
        )
      ) {
        player.activeX += dx;
      }
      return;
    }
    if (
      action === 'rotate_cw' ||
      action === 'rotate_ccw' ||
      action === 'rotate_180'
    ) {
      const direction =
        action === 'rotate_cw' ? 'CW' : action === 'rotate_ccw' ? 'CCW' : '180';
      const rotated = tryRotate(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY,
        player.activeRotation,
        direction,
      );
      if (rotated) {
        player.activeX = rotated.x;
        player.activeY = rotated.y;
        player.activeRotation = rotated.rotation;
      }
      return;
    }
    if (action === 'soft_drop') {
      if (
        isValidPosition(
          player.board,
          player.activeMino,
          player.activeX,
          player.activeY + 1,
          player.activeRotation,
        )
      ) {
        player.activeY++;
      }
      return;
    }
    if (action === 'hold' && player.canHold) {
      const previousHold = player.holdMino;
      player.holdMino = player.activeMino;
      player.activeMino =
        previousHold ?? this.bagFor(player.socketId).peek(1)[0];
      player.activeX = 3;
      player.activeY = 18;
      player.activeRotation = 0;
      player.canHold = false;
    }
  }

  private agentActionToClientEvent(action: AgentAction): string {
    const events: Record<AgentAction, string> = {
      move_left: ClientEvent.MOVE_LEFT,
      move_right: ClientEvent.MOVE_RIGHT,
      rotate_cw: ClientEvent.ROTATE_CW,
      rotate_ccw: ClientEvent.ROTATE_CCW,
      rotate_180: ClientEvent.ROTATE_180,
      soft_drop: ClientEvent.SOFT_DROP,
      hard_drop: ClientEvent.HARD_DROP,
      hold: ClientEvent.HOLD,
    };
    return events[action];
  }

  /** ゲーム停止 */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.pendingAiStart = null;
    this.humanReady = false;
    this.aiAgentService?.releaseMatch(this.roomId);
    if (this.simulationStartTimer) clearTimeout(this.simulationStartTimer);
    this.simulationStartTimer = null;
    if (this.gravityTimer) clearInterval(this.gravityTimer);
    this.gravityTimer = null;
    this.lockTimer.forEach((t) => clearTimeout(t));
    this.lockTimer.clear();
  }

  getPlayers(): Map<string, PlayerState> {
    return this.players;
  }

  isActive(): boolean {
    return this.isRunning || this.simulationStartTimer !== null;
  }

  get isStarted(): boolean {
    return this.isRunning;
  }

  get gameSeed(): number {
    return this.seed;
  }
}
