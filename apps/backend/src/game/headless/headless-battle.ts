import type { Board, TetrominoType } from '@transcendence/shared';
import { BagGenerator } from '../engine/bag-generator';
import {
  addGarbageLines,
  BOARD_ROWS,
  clearLines,
  createEmptyBoard,
  detectTSpin,
  isValidPosition,
  lockMino,
  tryRotate,
} from '../engine/board';
import {
  calcGarbage,
  calcScore,
  ClearType,
  isPerfectClear,
} from '../engine/garbage';

export const AGENT_ACTIONS = [
  'move_left',
  'move_right',
  'rotate_cw',
  'rotate_ccw',
  'rotate_180',
  'soft_drop',
  'hard_drop',
  'hold',
] as const;

export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const AGENT_BOARD_ROWS = 20;
export const VISIBLE_ROW_OFFSET = BOARD_ROWS - AGENT_BOARD_ROWS;
const SPAWN_Y = 18;
const AGENT_SPAWN_Y = SPAWN_Y - VISIBLE_ROW_OFFSET;

export interface AgentPlacement {
  piece: TetrominoType;
  x: number;
  y: number;
  rotation: 0 | 1 | 2 | 3;
}

export interface AgentDecisionRequest {
  version: 1;
  type: 'decide';
  requestId: string;
  matchId: string;
  playerId: string;
  board: string[];
  piece: TetrominoType;
  next: TetrominoType[];
  hold: TetrominoType | null;
  canHold: boolean;
  b2b: number;
  combo: number;
  garbageQueue: number;
  spawn: { x: number; y: number; rotation: 0 | 1 | 2 | 3 };
  opponent: {
    board: string[];
    garbageQueue: number;
    attacksSent: number;
    piecesPlaced: number;
  };
}

export interface AgentDecisionResponse {
  version: number;
  type: 'decision';
  requestId?: string;
  gameOver: boolean;
  actions: AgentAction[];
  placement?: AgentPlacement;
  completedDepth?: number;
  nodesVisited?: number;
  timedOut?: boolean;
}

export interface HeadlessAgent {
  readonly name: string;
  decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse>;
  close(): Promise<void>;
}

export interface HeadlessBattleOptions {
  matchId: string;
  seed: number;
  maxPiecesPerPlayer: number;
  maximumActionsPerDecision?: number;
}

export interface HeadlessPlayerResult {
  id: string;
  model: string;
  piecesPlaced: number;
  lines: number;
  score: number;
  attacksSent: number;
  garbageReceived: number;
  holds: number;
  b2b: number;
  maxB2b: number;
  b2bBreaks: number;
  combo: number;
  tetrises: number;
  tSpinMinis: number;
  tSpinSingles: number;
  tSpinDoubles: number;
  tSpinTriples: number;
  perfectClears: number;
  decisions: number;
  totalDecisionMs: number;
  gameOver: boolean;
}

export type BattleEndReason =
  | 'game_over'
  | 'agent_game_over'
  | 'invalid_decision'
  | 'agent_timeout'
  | 'agent_error'
  | 'piece_limit';

export interface HeadlessBattleResult {
  matchId: string;
  seed: number;
  winnerId: string | null;
  loserId: string | null;
  reason: BattleEndReason;
  turns: number;
  durationMs: number;
  players: [HeadlessPlayerResult, HeadlessPlayerResult];
}

export class AgentTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTimeoutError';
  }
}

interface HeadlessPlayerState extends HeadlessPlayerResult {
  board: Board;
  activeMino: TetrominoType;
  activeX: number;
  activeY: number;
  activeRotation: 0 | 1 | 2 | 3;
  holdMino: TetrominoType | null;
  canHold: boolean;
  garbageQueue: number;
  lastMoveWasRotation: boolean;
  lastRotationKickIndex: number;
}

interface ExecutedPlacement extends AgentPlacement {
  linesCleared: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0x100000000;
  };
}

export function boardToAgentRows(board: Board): string[] {
  return board
    .slice(VISIBLE_ROW_OFFSET)
    .map((row) =>
      row
        .map((cell) => (cell === null ? '.' : cell === 'GARBAGE' ? '#' : cell))
        .join(''),
    );
}

function isAgentAction(value: unknown): value is AgentAction {
  return (
    typeof value === 'string' &&
    (AGENT_ACTIONS as readonly string[]).includes(value)
  );
}

function createPlayer(
  id: string,
  model: string,
  activeMino: TetrominoType,
): HeadlessPlayerState {
  return {
    id,
    model,
    board: createEmptyBoard(),
    activeMino,
    activeX: 3,
    activeY: SPAWN_Y,
    activeRotation: 0,
    holdMino: null,
    canHold: true,
    garbageQueue: 0,
    lastMoveWasRotation: false,
    lastRotationKickIndex: 0,
    piecesPlaced: 0,
    lines: 0,
    score: 0,
    attacksSent: 0,
    garbageReceived: 0,
    holds: 0,
    b2b: 0,
    maxB2b: 0,
    b2bBreaks: 0,
    combo: -1,
    tetrises: 0,
    tSpinMinis: 0,
    tSpinSingles: 0,
    tSpinDoubles: 0,
    tSpinTriples: 0,
    perfectClears: 0,
    decisions: 0,
    totalDecisionMs: 0,
    gameOver: false,
  };
}

function countClear(
  player: HeadlessPlayerState,
  clearType: ClearType | null,
): void {
  if (clearType === 'tetris') player.tetrises++;
  else if (clearType === 'tspin_mini') player.tSpinMinis++;
  else if (clearType === 'tspin_single') player.tSpinSingles++;
  else if (clearType === 'tspin_double') player.tSpinDoubles++;
  else if (clearType === 'tspin_triple') player.tSpinTriples++;
  else if (clearType === 'perfect_clear') player.perfectClears++;
}

function publicResult(player: HeadlessPlayerState): HeadlessPlayerResult {
  return {
    id: player.id,
    model: player.model,
    piecesPlaced: player.piecesPlaced,
    lines: player.lines,
    score: player.score,
    attacksSent: player.attacksSent,
    garbageReceived: player.garbageReceived,
    holds: player.holds,
    b2b: player.b2b,
    maxB2b: player.maxB2b,
    b2bBreaks: player.b2bBreaks,
    combo: player.combo,
    tetrises: player.tetrises,
    tSpinMinis: player.tSpinMinis,
    tSpinSingles: player.tSpinSingles,
    tSpinDoubles: player.tSpinDoubles,
    tSpinTriples: player.tSpinTriples,
    perfectClears: player.perfectClears,
    decisions: player.decisions,
    totalDecisionMs: player.totalDecisionMs,
    gameOver: player.gameOver,
  };
}

export class HeadlessBattle {
  private readonly bag: BagGenerator;
  private readonly garbageRandom: () => number;
  private readonly players: [HeadlessPlayerState, HeadlessPlayerState];
  private readonly maximumActions: number;

  constructor(
    private readonly agents: [HeadlessAgent, HeadlessAgent],
    private readonly options: HeadlessBattleOptions,
  ) {
    this.bag = new BagGenerator(options.seed);
    this.garbageRandom = createSeededRandom(options.seed ^ 0x6d2b79f5);
    this.players = [
      createPlayer('player-1', agents[0].name, this.bag.next()),
      createPlayer('player-2', agents[1].name, this.bag.next()),
    ];
    this.maximumActions = options.maximumActionsPerDecision ?? 1000;
  }

  async play(): Promise<HeadlessBattleResult> {
    const startedAt = Date.now();
    let turns = 0;
    let loserIndex: number | null = null;
    let reason: BattleEndReason = 'piece_limit';

    while (
      this.players.some(
        (player) => player.piecesPlaced < this.options.maxPiecesPerPlayer,
      )
    ) {
      const playerIndex = turns % 2;
      const opponentIndex = 1 - playerIndex;
      const player = this.players[playerIndex];
      const opponent = this.players[opponentIndex];
      turns++;

      if (player.piecesPlaced >= this.options.maxPiecesPerPlayer) continue;
      if (
        !isValidPosition(
          player.board,
          player.activeMino,
          player.activeX,
          player.activeY,
          player.activeRotation,
        )
      ) {
        player.gameOver = true;
        loserIndex = playerIndex;
        reason = 'game_over';
        break;
      }

      const request = this.makeRequest(playerIndex);
      let decision: AgentDecisionResponse;
      const decisionStartedAt = performance.now();
      try {
        decision = await this.agents[playerIndex].decide(request);
      } catch (error) {
        player.gameOver = true;
        loserIndex = playerIndex;
        reason =
          error instanceof AgentTimeoutError ? 'agent_timeout' : 'agent_error';
        break;
      } finally {
        player.totalDecisionMs += performance.now() - decisionStartedAt;
        player.decisions++;
      }

      if (decision.gameOver) {
        player.gameOver = true;
        loserIndex = playerIndex;
        reason = 'agent_game_over';
        break;
      }
      const placement = this.executeDecision(player, opponent, decision);
      if (!placement) {
        player.gameOver = true;
        loserIndex = playerIndex;
        reason = 'invalid_decision';
        break;
      }
      if (
        decision.placement &&
        (decision.placement.piece !== placement.piece ||
          decision.placement.x !== placement.x ||
          decision.placement.y !== placement.y - VISIBLE_ROW_OFFSET ||
          decision.placement.rotation !== placement.rotation)
      ) {
        player.gameOver = true;
        loserIndex = playerIndex;
        reason = 'invalid_decision';
        break;
      }
      if (player.gameOver) {
        loserIndex = playerIndex;
        reason = 'game_over';
        break;
      }
    }

    const winnerIndex = loserIndex === null ? null : 1 - loserIndex;
    return {
      matchId: this.options.matchId,
      seed: this.options.seed,
      winnerId: winnerIndex === null ? null : this.players[winnerIndex].id,
      loserId: loserIndex === null ? null : this.players[loserIndex].id,
      reason,
      turns,
      durationMs: Date.now() - startedAt,
      players: [publicResult(this.players[0]), publicResult(this.players[1])],
    };
  }

  private makeRequest(playerIndex: number): AgentDecisionRequest {
    const player = this.players[playerIndex];
    const opponent = this.players[1 - playerIndex];
    return {
      version: 1,
      type: 'decide',
      requestId: `${this.options.matchId}:${player.id}:${player.piecesPlaced}`,
      matchId: this.options.matchId,
      playerId: player.id,
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
        y: AGENT_SPAWN_Y,
        rotation: player.activeRotation,
      },
      opponent: {
        board: boardToAgentRows(opponent.board),
        garbageQueue: opponent.garbageQueue,
        attacksSent: opponent.attacksSent,
        piecesPlaced: opponent.piecesPlaced,
      },
    };
  }

  private executeDecision(
    player: HeadlessPlayerState,
    opponent: HeadlessPlayerState,
    decision: AgentDecisionResponse,
  ): ExecutedPlacement | null {
    if (
      !Array.isArray(decision.actions) ||
      decision.actions.length === 0 ||
      decision.actions.length > this.maximumActions ||
      decision.actions.some((action) => !isAgentAction(action))
    ) {
      return null;
    }

    for (let index = 0; index < decision.actions.length; index++) {
      const action = decision.actions[index];
      if (action === 'hard_drop') {
        if (index !== decision.actions.length - 1) return null;
        const startY = player.activeY;
        while (
          isValidPosition(
            player.board,
            player.activeMino,
            player.activeX,
            player.activeY + 1,
            player.activeRotation,
          )
        ) {
          player.activeY++;
          player.score += 2;
        }
        if (player.activeY > startY) player.lastMoveWasRotation = false;
        return this.lockPiece(player, opponent);
      }
      this.applyAction(player, action);
    }
    return null;
  }

  private applyAction(player: HeadlessPlayerState, action: AgentAction): void {
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
        player.lastMoveWasRotation = false;
        this.bag.peek(5);
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
        player.lastMoveWasRotation = true;
        player.lastRotationKickIndex = rotated.kickIndex;
        this.bag.peek(5);
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
        player.score++;
        player.lastMoveWasRotation = false;
        this.bag.peek(5);
      }
      return;
    }
    if (action === 'hold' && player.canHold) {
      const previousHold = player.holdMino;
      player.holdMino = player.activeMino;
      player.activeMino = previousHold ?? this.bag.next();
      player.activeX = 3;
      player.activeY = SPAWN_Y;
      player.activeRotation = 0;
      player.canHold = false;
      player.lastMoveWasRotation = false;
      player.lastRotationKickIndex = 0;
      player.holds++;
      this.bag.peek(5);
    }
  }

  private lockPiece(
    player: HeadlessPlayerState,
    opponent: HeadlessPlayerState,
  ): ExecutedPlacement {
    const placement: AgentPlacement = {
      piece: player.activeMino,
      x: player.activeX,
      y: player.activeY,
      rotation: player.activeRotation,
    };
    const locked = lockMino(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
    );
    const cleared = clearLines(locked);
    const tspin = detectTSpin(
      player.board,
      player.activeMino,
      player.activeX,
      player.activeY,
      player.activeRotation,
      player.lastMoveWasRotation,
      player.lastRotationKickIndex,
      cleared.linesCleared,
    );
    player.board = cleared.board;
    player.piecesPlaced++;

    if (cleared.linesCleared > 0) {
      player.combo++;
      player.lines += cleared.linesCleared;
      const level = Math.floor(player.lines / 10) + 1;
      const perfectClear = isPerfectClear(player.board);
      const { garbage, clearType } = calcGarbage(
        cleared.linesCleared,
        tspin,
        perfectClear,
        player.b2b > 0,
      );
      const previousB2b = player.b2b;
      const isB2b =
        clearType === 'tetris' || Boolean(tspin && cleared.linesCleared > 0);
      if (isB2b) {
        player.b2b++;
        player.maxB2b = Math.max(player.maxB2b, player.b2b);
      } else {
        if (previousB2b > 0) player.b2bBreaks++;
        player.b2b = 0;
      }
      player.score += calcScore(clearType, level, player.combo);
      countClear(player, clearType);
      if (garbage > 0) {
        player.attacksSent += garbage;
        opponent.garbageQueue += garbage;
      }
    } else {
      player.combo = -1;
    }

    if (player.garbageQueue > 0) {
      player.garbageReceived += player.garbageQueue;
      player.board = addGarbageLines(
        player.board,
        player.garbageQueue,
        this.garbageRandom,
      );
      player.garbageQueue = 0;
    }

    player.activeMino = this.bag.next();
    player.activeX = 3;
    player.activeY = SPAWN_Y;
    player.activeRotation = 0;
    player.canHold = true;
    player.lastMoveWasRotation = false;
    player.lastRotationKickIndex = 0;
    if (
      !isValidPosition(
        player.board,
        player.activeMino,
        player.activeX,
        player.activeY,
        player.activeRotation,
      )
    ) {
      player.gameOver = true;
    } else {
      this.bag.peek(5);
    }
    return { ...placement, linesCleared: cleared.linesCleared };
  }
}
