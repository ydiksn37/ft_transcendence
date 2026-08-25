import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  GameState,
  TetrominoType,
  AiDifficulty,
  AiAgentModel,
  AiPreviewStatus,
  ServerEvent,
  ClientEvent,
  AI_BOT_CONFIGS,
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
import { CppAgentProcess } from './headless/cpp-agent-process';
import {
  AgentAction,
  AgentDecisionRequest,
  AgentDecisionResponse,
  AGENT_ACTIONS,
  boardToAgentRows,
  VISIBLE_ROW_OFFSET,
} from './headless/headless-battle';
import { AiAgentService } from './engine/ai-agent.service';

const LOCK_DELAY_MS = 500;
const GRAVITY_INTERVAL_MS = 1000; // Level 1: 1秒/段
const AI_MATCH_COUNTDOWN_MS = 1000;
const AI_ACTION_INTERVAL_MS = 50;
const MAX_AI_ACTIONS = 1000;

export interface CppAiPreviewOptions {
  executable: string;
  model: AiAgentModel;
  thinkTimeMs: number;
  responseTimeoutMs: number;
  actionDelayMs: number;
}

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
  lastRotationKickIndex: number;
  // APM/PPS 計算
  startTime: number;
  attacksSent: number;
  piecesPlaced: number;
  tSpins: number;
  tetrises: number;
}

export class GameInstance {
  private readonly logger = new Logger(GameInstance.name);
  readonly roomId: string;
  private server: Server;
  private bag: BagGenerator;
  private players: Map<string, PlayerState> = new Map();
  private spectators: Set<string> = new Set();
  private gravityTimer: NodeJS.Timeout | null = null;
  private simulationStartTimer: NodeJS.Timeout | null = null;
  private lockTimer: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private aiDifficulty: AiDifficulty | null = null;
  private cppAgent: CppAgentProcess | null = null;
  private cppPreviewOptions: CppAiPreviewOptions | null = null;
  private cppDecisionSequence = 0;
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
      lastRotationKickIndex: 0,
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

    // AI戦には盤面を送る第2のブラウザがないため、初期状態もサーバーから配信する。
    this.players.forEach((player, socketId) => {
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

    // VS AIではブラウザ側のREADY表示と同じ1秒後にシミュレーションを始める。
    if (this.aiDifficulty) {
      this.simulationStartTimer = setTimeout(
        beginSimulation,
        AI_MATCH_COUNTDOWN_MS,
      );
    } else {
      beginSimulation();
    }
  }

  /** C++ は探索だけを行い、返された操作はこのTSエンジンで再生する。 */
  async startCppPreview(options: CppAiPreviewOptions): Promise<void> {
    if (this.isRunning) this.stop();
    this.isRunning = true;
    this.aiDifficulty = null;
    this.cppPreviewOptions = { ...options };
    this.cppDecisionSequence = 0;
    this.emitCppPreviewStatus('starting');

    const agent = new CppAgentProcess({
      executable: options.executable,
      model: options.model,
      thinkTimeMs: options.thinkTimeMs,
      responseTimeoutMs: options.responseTimeoutMs,
    });
    this.cppAgent = agent;

    try {
      await agent.ready();
      if (!this.isRunning || this.cppAgent !== agent) return;

      this.server.to(this.roomId).emit(ServerEvent.GAME_START, {
        roomId: this.roomId,
        aiPreview: true,
        model: options.model,
      });
      this.players.forEach((player, socketId) => {
        player.startTime = Date.now();
        this.broadcastState(socketId, player);
      });
      await this.runCppPreviewLoop(agent);
    } catch (error) {
      if (!this.isRunning || this.cppAgent !== agent) return;
      const message = error instanceof Error ? error.message : String(error);
      this.emitCppPreviewStatus('error', { message });
      this.server.to(this.roomId).emit(ServerEvent.ERROR, { message });
      this.stop();
    }
  }

  setCppPreviewActionDelay(actionDelayMs: number): void {
    if (!this.cppPreviewOptions) return;
    this.cppPreviewOptions.actionDelayMs = Math.max(
      0,
      Math.min(1000, Math.trunc(actionDelayMs)),
    );
    this.emitCppPreviewStatus('executing');
  }

  /** 重力ループ */
  private startGravity(): void {
    this.gravityTimer = setInterval(() => {
      this.players.forEach((player, socketId) => {
        if (
          player.isGameOver ||
          (this.aiDifficulty && socketId === `ai_${this.roomId}`)
        )
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
      player.lastMoveWasRotation = false;
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
    if (dropY > player.activeY) player.lastMoveWasRotation = false;
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
    let maxLockY = -1;
    for (const [r, c] of cells) {
      maxLockY = Math.max(maxLockY, r);
    }

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
  private scheduleLock(socketId: string): void {
    if (this.lockTimer.has(socketId)) return;
    const timer = setTimeout(() => {
      const player = this.players.get(socketId);
      if (player && !player.isGameOver) this.lockPiece(socketId, player);
      this.lockTimer.delete(socketId);
    }, LOCK_DELAY_MS);
    this.lockTimer.set(socketId, timer);
  }

  public get isAiMatch(): boolean {
    return this.aiDifficulty !== null;
  }

  public receiveGarbageFromClient(targetSocketId: string, lines: number): void {
    const aiPlayer = this.players.get(`ai_${this.roomId}`);
    if (aiPlayer && !aiPlayer.isGameOver) {
      aiPlayer.garbageQueue += lines;
    }
  }

  public handleClientGameOver(socketId: string): void {
    this.handleGameOver(socketId);
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

        // AIがおじゃまを送った場合、人間のフロントエンドに送信
        if (this.isAiMatch && senderSocketId === `ai_${this.roomId}` && socketId !== `ai_${this.roomId}`) {
          this.server.to(socketId).emit('receive_garbage', { lines });
        }
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
      if (sid !== socketId) {
        this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);

        // AIの盤面更新を、フロントエンドの40行ステージ形式に合わせて送信
        if (this.isAiMatch && socketId === `ai_${this.roomId}` && sid !== `ai_${this.roomId}`) {
          const frontendStage: [string | 0, 'clear' | 'merged'][][] = player.board.map(row => row.map(cell => {
            if (cell === null) return [0, 'clear'];
            if (cell === 'GARBAGE') return ['B', 'merged'];
            return [cell, 'merged'];
          }));

          // 固定盤面には含まれない操作中ミノも重ねて、現在のAI状態を表示する。
          if (!player.isGameOver) {
            for (const [row, col] of getMinoCells(
              player.activeMino,
              player.activeX,
              player.activeY,
              player.activeRotation,
            )) {
              if (row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS) {
                // GameBoard hides top-buffer stage cells with the "clear"
                // status, so use the solid visual status for this snapshot.
                frontendStage[row][col] = [player.activeMino, 'merged'];
              }
            }
          }
          this.server.to(sid).emit('opponent_board_update', { stage: frontendStage, score: player.score });
        }
      }
    });
    this.spectators.forEach((sid) => {
      this.server.to(sid).emit(ServerEvent.OPPONENT_STATE, opponentState);
    });
  }

  /** ゲームオーバー処理 */
  private handleGameOver(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
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
          next: this.bag.peek(5),
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
      await new Promise(r => setTimeout(r, delay));

      if (decision.gameOver) {
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
        if (index < decision.actions.length - 1) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, AI_ACTION_INTERVAL_MS),
          );
        }
      }
    }
  }

  private async runCppPreviewLoop(agent: CppAgentProcess): Promise<void> {
    const aiEntry = [...this.players.entries()].find(
      ([, player]) => player.userId === null,
    );
    if (!aiEntry) throw new Error('AI preview player is missing');
    const [socketId, player] = aiEntry;

    while (this.isRunning && !player.isGameOver && this.cppAgent === agent) {
      const request = this.makeCppDecisionRequest(socketId, player);
      this.emitCppPreviewStatus('thinking');
      const startedAt = performance.now();
      const decision = await agent.decide(request);
      const decisionMs = performance.now() - startedAt;

      if (!this.isRunning || this.cppAgent !== agent) return;
      if (decision.gameOver) {
        this.handleGameOver(socketId);
        return;
      }
      this.validateCppDecision(player, decision);
      this.emitCppPreviewStatus('executing', {
        completedDepth: decision.completedDepth,
        nodesVisited: decision.nodesVisited,
        decisionMs: Math.round(decisionMs * 100) / 100,
      });

      for (const action of decision.actions) {
        if (!this.isRunning || this.cppAgent !== agent || player.isGameOver)
          return;
        this.applyInput(socketId, this.agentActionToClientEvent(action));
        const delay = this.cppPreviewOptions?.actionDelayMs ?? 0;
        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  private makeCppDecisionRequest(
    socketId: string,
    player: PlayerState,
  ): AgentDecisionRequest {
    const emptyOpponent = createEmptyBoard();
    return {
      version: 1,
      type: 'decide',
      requestId: `${this.roomId}:${socketId}:${this.cppDecisionSequence++}`,
      matchId: this.roomId,
      playerId: socketId,
      board: boardToAgentRows(player.board),
      piece: player.activeMino,
      next: this.bag.peek(5),
      hold: player.holdMino,
      canHold: player.canHold,
      b2b: player.b2b,
      combo: player.combo,
      garbageQueue: player.garbageQueue,
      spawn: {
        x: player.activeX,
        y: player.activeY - VISIBLE_ROW_OFFSET,
        rotation: player.activeRotation,
      },
      opponent: {
        board: boardToAgentRows(emptyOpponent),
        garbageQueue: 0,
        attacksSent: 0,
        piecesPlaced: 0,
      },
    };
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
      player.activeMino = previousHold ?? this.bag.peek(1)[0];
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

  private emitCppPreviewStatus(
    phase: AiPreviewStatus['phase'],
    details: Partial<AiPreviewStatus> = {},
  ): void {
    if (!this.cppPreviewOptions) return;
    const status: AiPreviewStatus = {
      phase,
      model: this.cppPreviewOptions.model,
      actionDelayMs: this.cppPreviewOptions.actionDelayMs,
      ...details,
    };
    this.server.to(this.roomId).emit(ServerEvent.AI_PREVIEW_STATUS, status);
  }

  /** ゲーム停止 */
  stop(): void {
    const agent = this.cppAgent;
    if (this.cppPreviewOptions && this.isRunning) {
      this.emitCppPreviewStatus('stopped');
    }
    this.isRunning = false;
    this.cppAgent = null;
    this.cppPreviewOptions = null;
    if (this.simulationStartTimer) clearTimeout(this.simulationStartTimer);
    this.simulationStartTimer = null;
    if (this.gravityTimer) clearInterval(this.gravityTimer);
    this.gravityTimer = null;
    this.lockTimer.forEach((t) => clearTimeout(t));
    this.lockTimer.clear();
    if (agent) void agent.close().catch(() => undefined);
  }

  getPlayers(): Map<string, PlayerState> {
    return this.players;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
