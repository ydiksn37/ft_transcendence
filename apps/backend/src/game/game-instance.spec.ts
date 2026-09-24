import {
  ClientEvent,
  ServerEvent,
  TETROMINO_SHAPES,
  type TetrominoType,
} from '@transcendence/shared';
import { GameInstance } from './game-instance';
import { AiAgentService } from './engine/ai-agent.service';
import { calcGhostY, createEmptyBoard } from './engine/board';
import { calcGarbage } from './engine/garbage';
import { AgentAction, VISIBLE_ROW_OFFSET } from './headless/headless-battle';

type Emission = {
  target: string;
  event: string;
  payload: any;
};

describe('GameInstance AI matches', () => {
  let emissions: Emission[];
  let server: any;

  beforeEach(() => {
    jest.useFakeTimers();
    emissions = [];
    server = {
      to: jest.fn((target: string) => ({
        emit: (event: string, payload: any) => {
          emissions.push({ target, event, payload });
        },
      })),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits for the human READY completion, ignoring spectators and duplicate acknowledgements', async () => {
    const aiAgent = { releaseMatch: jest.fn(), getDecision: jest.fn(() => new Promise(() => undefined)) };
    const game = new GameInstance('ready_ai', server, 42, undefined, aiAgent as unknown as AiAgentService);
    game.addPlayer('human', null);
    game.addPlayer('ai_ready_ai', null);
    game.start('EXPERT');
    game.confirmAiReady('spectator');
    game.confirmAiReady('ai_ready_ai');
    await jest.advanceTimersByTimeAsync(5000);
    expect(aiAgent.getDecision).not.toHaveBeenCalled();
    expect(game.getPlayers().get('ai_ready_ai')!.piecesPlaced).toBe(0);
    game.confirmAiReady('human');
    game.confirmAiReady('human');
    await jest.advanceTimersByTimeAsync(0);
    expect(aiAgent.getDecision).toHaveBeenCalledTimes(1);
    game.stop();
    game.confirmAiReady('human');
    await jest.advanceTimersByTimeAsync(5000);
    expect(aiAgent.getDecision).toHaveBeenCalledTimes(1);
  });

  it('stopping during READY cancels a delayed start acknowledgement', async () => {
    const aiAgent = { releaseMatch: jest.fn(), getDecision: jest.fn() };
    const game = new GameInstance('cancel_ready', server, 42, undefined, aiAgent as unknown as AiAgentService);
    game.addPlayer('human', null);
    game.addPlayer('ai_cancel_ready', null);
    game.start('EXPERT');
    game.stop();
    game.confirmAiReady('human');
    await jest.advanceTimersByTimeAsync(5000);
    expect(aiAgent.getDecision).not.toHaveBeenCalled();
  });

  it('rebinds a player state to a new socket without resetting the match', () => {
    const game = new GameInstance('reconnect_room', server, 42);
    game.addPlayer('old-socket', null);
    const original = game.getPlayers().get('old-socket');

    expect(game.rebindSocket('old-socket', 'new-socket')).toBe(true);
    expect(game.getPlayers().has('old-socket')).toBe(false);
    expect(game.getPlayers().get('new-socket')).toBe(original);
    expect(original?.socketId).toBe('new-socket');
  });

  it('publishes READY with all Next queues and starts without consuming another piece', () => {
    const game = new GameInstance('ready_room', server, 42);
    for (const id of ['a', 'b', 'c', 'd']) game.addPlayer(id, null);
    game.addSpectator('viewer');
    const next = jest.spyOn((game as any).playerBags.get('a'), 'next');
    game.prepareHumanMatch();
    expect(game.isActive()).toBe(true);
    const initial = emissions.filter((e) => e.event === ServerEvent.GAME_STATE);
    expect(initial).toHaveLength(4);
    for (const e of initial) {
      expect(e.payload.started).toBe(false);
      expect(e.payload.activeMino).toEqual(initial[0].payload.activeMino);
      expect(e.payload.nextMinos).toEqual(initial[0].payload.nextMinos);
      expect(e.payload.nextMinos).toHaveLength(5);
    }
    const others = emissions.filter((e) => e.event === 'opponent_board_update');
    expect(others).toHaveLength(16);
    others.forEach((e) => expect(e.payload.next).toHaveLength(5));
    game.applyInput('a', ClientEvent.HOLD);
    game.applyInput('a', ClientEvent.HARD_DROP);
    jest.advanceTimersByTime(2999);
    expect(game.getPlayers().get('a')!.piecesPlaced).toBe(0);
    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    const started = emissions
      .filter((e) => e.event === ServerEvent.GAME_STATE && e.target === 'a')
      .at(-1)!.payload;
    expect(started.started).toBe(true);
    expect(started.activeMino).toEqual(initial[0].payload.activeMino);
    expect(started.nextMinos).toEqual(initial[0].payload.nextMinos);
    expect(next).not.toHaveBeenCalled();
    game.applyInput('a', ClientEvent.HARD_DROP);
    expect(game.getPlayers().get('a')!.activeMino).toBe(started.nextMinos[0]);
    game.stop();
  });

  it('ignores a hard drop targeting the piece that already auto-locked', () => {
    const game = new GameInstance('late_input', server, 42);
    game.addPlayer('a', null);
    game.addPlayer('b', null);
    game.start();
    const player = game.getPlayers().get('a')!;
    expect(player.activeMino).toBe('O');
    for (const y of [38, 39]) {
      player.board[y] = Array.from({ length: 10 }, (_, x) =>
        x === 4 || x === 5 ? null : 'GARBAGE',
      );
    }
    const oldId = player.pieceId;
    for (let i = 0; i < 40; i++)
      game.applyInput('a', ClientEvent.SOFT_DROP, oldId);
    jest.advanceTimersByTime(500);
    expect(player.piecesPlaced).toBe(1);
    expect(player.lines).toBe(2);
    expect(player.pieceId).not.toBe(oldId);
    const nextY = player.activeY;
    game.applyInput('a', ClientEvent.HARD_DROP, oldId);
    game.applyInput('a', ClientEvent.SOFT_DROP, oldId);
    expect(player.piecesPlaced).toBe(1);
    expect(player.activeY).toBe(nextY);
    const nextId = player.pieceId;
    game.applyInput('a', ClientEvent.HARD_DROP, nextId);
    game.applyInput('a', ClientEvent.HARD_DROP, nextId);
    expect(player.piecesPlaced).toBe(2);
    game.stop();
  });

  it('changes the input identity on Hold and across rematches', () => {
    const game = new GameInstance('same_room', server, 42);
    game.addPlayer('a', null);
    game.start();
    const player = game.getPlayers().get('a')!;
    const oldId = player.pieceId;
    game.applyInput('a', ClientEvent.HOLD, oldId);
    expect(player.pieceId).not.toBe(oldId);
    game.applyInput('a', ClientEvent.HARD_DROP, oldId);
    expect(player.piecesPlaced).toBe(0);
    const snapshot = emissions
      .filter((e) => e.event === ServerEvent.GAME_STATE)
      .at(-1)!.payload;
    expect(snapshot.pieceId).toBe(player.pieceId);
    game.stop();
    const rematch = new GameInstance('same_room', server, 42);
    rematch.addPlayer('a', null);
    expect(rematch.getPlayers().get('a')!.pieceId).not.toBe(player.pieceId);
    rematch.stop();
  });

  it('cancels READY when a match is stopped', () => {
    const game = new GameInstance('cancelled', server, 42);
    game.addPlayer('a', null);
    game.prepareHumanMatch();
    game.stop();
    jest.advanceTimersByTime(10000);
    expect(game.isActive()).toBe(false);
    expect(emissions.some((e) => e.event === ServerEvent.GAME_START)).toBe(
      false,
    );
  });

  it.each(['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as TetrominoType[])(
    'centers initial and held %s using the frontend spawn matrix width',
    (type) => {
      const game = new GameInstance('spawn_room', server, 42);
      game.addPlayer('a', null);
      game.addPlayer('b', null);
      const player = game.getPlayers().get('a')!;
      player.activeMino = type;
      game.start();
      const expectedX = type === 'O' ? 4 : 3;
      expect(player.activeX).toBe(expectedX);
      player.activeMino = 'I';
      player.activeX = 0;
      player.holdMino = type;
      game.applyInput('a', ClientEvent.HOLD);
      expect(player.activeMino).toBe(type);
      expect(player.activeX).toBe(expectedX);
      game.stop();
    },
  );

  it('keeps O coordinates identical in player, opponent, spectator and locked snapshots', () => {
    const game = new GameInstance('o_room', server, 42);
    game.addPlayer('a', null);
    game.addPlayer('b', null);
    game.addSpectator('viewer');
    const player = game.getPlayers().get('a')!;
    player.activeMino = 'O';
    game.start();
    const own = emissions.find(
      (e) => e.target === 'a' && e.event === ServerEvent.GAME_STATE,
    )!.payload;
    expect(own.activeMino.x).toBe(4);
    for (const target of ['b', 'viewer']) {
      const other = emissions.find(
        (e) =>
          e.target === target &&
          e.event === 'opponent_board_update' &&
          e.payload.playerId === 'a',
      )!.payload;
      for (const [r, c] of TETROMINO_SHAPES.O[0])
        expect(other.stage[own.activeMino.y + r][own.activeMino.x + c][0]).toBe(
          'O',
        );
    }
    game.applyInput('a', ClientEvent.HARD_DROP);
    for (const row of [38, 39]) {
      expect(player.board[row][3]).toBeNull();
      expect(player.board[row][4]).toBe('O');
      expect(player.board[row][5]).toBe('O');
    }
    // Force O at the head of Next: locking the current I must use the same
    // spawn origin as the initial piece and a Hold swap.
    player.board = createEmptyBoard();
    player.activeMino = 'I';
    player.activeX = 3;
    player.activeY = 18;
    jest.spyOn((game as any).playerBags.get('a'), 'next').mockReturnValue('O');
    game.applyInput('a', ClientEvent.HARD_DROP);
    expect(player.activeMino).toBe('O');
    expect(player.activeX).toBe(4);
    game.stop();
  });

  it('advances human boards equally without browser updates', () => {
    const game = new GameInstance('human_room', server, 42);
    game.addPlayer('a', null);
    game.addPlayer('b', null);
    game.start();
    jest.advanceTimersByTime(60000);
    const a = game.getPlayers().get('a')!;
    const b = game.getPlayers().get('b')!;
    expect(a.piecesPlaced).toBeGreaterThan(0);
    expect(a.board).toEqual(b.board);
    expect(a.activeMino).toBe(b.activeMino);
    expect(a.activeY).toBe(b.activeY);
    expect(
      emissions.some(
        (e) =>
          e.target === 'a' &&
          e.event === 'opponent_board_update' &&
          e.payload.roomId === 'human_room',
      ),
    ).toBe(true);
    game.stop();
  });

  it('snapshots both players for a spectator and stops sending after removal', () => {
    const game = new GameInstance('watch_room', server, 42);
    game.addPlayer('a', null);
    game.addPlayer('b', null);
    game.addSpectator('viewer');
    game.broadcastSnapshot();
    const snapshots = emissions.filter(
      (e) => e.target === 'viewer' && e.event === 'opponent_board_update',
    );
    expect(snapshots.map((e) => e.payload.playerId)).toEqual(['a', 'b']);
    snapshots.forEach((e) => {
      expect(e.payload.roomId).toBe('watch_room');
      expect(e.payload.next).toHaveLength(5);
      expect(e.payload.hold).toBeNull();
    });
    game.removeSpectator('viewer');
    emissions.length = 0;
    game.broadcastSnapshot();
    expect(emissions.some((e) => e.target === 'viewer')).toBe(false);
  });

  it('starts versus preview players from identical independent seeded bags', () => {
    const game = new GameInstance('preview_seed_room', server, 12345);
    game.addCppPreviewPlayer('preview_left', 'left', 'expert');
    game.addCppPreviewPlayer('preview_right', 'right', 'hard');

    const left = game.getPlayers().get('preview_left');
    const right = game.getPlayers().get('preview_right');
    expect(left?.activeMino).toBeDefined();
    expect(right?.activeMino).toBe(left?.activeMino);

    right!.garbageQueue = 3;
    right!.attacksSent = 7;
    const request = (game as any).makeCppDecisionRequest('preview_left', left);
    expect(request.next).toHaveLength(5);
    expect(request.opponent).toMatchObject({
      garbageQueue: 3,
      attacksSent: 7,
      piecesPlaced: 0,
    });
    expect(request.opponent.board).toHaveLength(40);
  });

  it('uses the frontend REN table for AI garbage', () => {
    expect(calcGarbage(1, null, false, false, 0).garbage).toBe(0);
    expect(calcGarbage(1, null, false, false, 1).garbage).toBe(1);
    expect(calcGarbage(2, null, false, false, 2).garbage).toBe(2);
    expect(calcGarbage(4, null, false, true, 3).garbage).toBe(7);
    expect(calcGarbage(4, null, true, true, 3).garbage).toBe(12);
  });

  it('sends the REN bonus after consecutive AI line clears', () => {
    const game = new GameInstance('ai_ren_room', server, 42);
    game.addPlayer('ai_player', null);
    game.addPlayer('human_player', 'human');
    const ai = game.getPlayers().get('ai_player')!;
    const human = game.getPlayers().get('human_player')!;
    (game as any).isRunning = true;

    const prepareSingle = () => {
      ai.board = createEmptyBoard();
      for (let column = 4; column < 10; column++) {
        ai.board[39][column] = 'GARBAGE';
      }
      // Keep one cell after the clear so this tests REN, not Perfect Clear.
      ai.board[38][9] = 'GARBAGE';
      ai.activeMino = 'I';
      ai.activeX = 0;
      ai.activeY = 18;
      ai.activeRotation = 0;
      ai.lastMoveWasRotation = false;
    };

    prepareSingle();
    (game as any).hardDrop('ai_player', ai);
    expect(ai.combo).toBe(0);
    expect(ai.attacksSent).toBe(0);

    prepareSingle();
    (game as any).hardDrop('ai_player', ai);
    expect(ai.combo).toBe(1);
    expect(ai.attacksSent).toBe(1);
    expect(human.garbageQueue).toBe(1);

    game.stop();
  });

  it('releases the room AI and treats stopped pending work as normal cancellation', async () => {
    let cancel: ((error: Error) => void) | undefined;
    const releaseMatch = jest.fn(() => cancel?.(new Error('AI match ended')));
    const getDecision = jest.fn(() => new Promise((_, reject) => { cancel = reject; }));
    const aiAgent = { releaseMatch, getDecision } as unknown as AiAgentService;
    const game = new GameInstance('cancel_room', server, 42, undefined, aiAgent);
    game.addPlayer('human', null);
    game.addPlayer('ai_cancel_room', null);
    game.start('EXPERT');
    game.confirmAiReady('human');
    await jest.advanceTimersByTimeAsync(1000);
    expect(getDecision).toHaveBeenCalledTimes(1);
    game.stop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(releaseMatch).toHaveBeenCalledWith('cancel_room');
    expect(getDecision).toHaveBeenCalledTimes(1);
    expect(emissions.some((e) => e.event === ServerEvent.ERROR)).toBe(false);
  });

  it('publishes a 40-row opponent stage including the active AI mino', () => {
    const aiAgent = {
      releaseMatch: jest.fn(),
      getDecision: jest.fn(() => new Promise(() => undefined)),
    } as unknown as AiAgentService;
    const roomId = 'ai_test_room';
    const humanSocketId = 'human_socket';
    const game = new GameInstance(roomId, server, 42, undefined, aiAgent);

    // Both players can legitimately have a null userId. The synthetic socket
    // id, rather than userId, is the authoritative AI identity.
    game.addPlayer(humanSocketId, null);
    game.addPlayer(`ai_${roomId}`, null);
    game.start('EASY');

    const update = emissions.find(
      (emission) =>
        emission.target === humanSocketId &&
        emission.event === 'opponent_board_update',
    );
    expect(update).toBeDefined();
    expect(update!.payload.stage).toHaveLength(40);
    expect(update!.payload.stage.every((row: any[]) => row.length === 10)).toBe(
      true,
    );
    expect(
      update!.payload.stage.some((row: any[]) =>
        row.some((cell) => cell[0] !== 0),
      ),
    ).toBe(true);

    game.stop();
  });

  it('uses the synthetic AI player even when the human userId is null', async () => {
    const aiAgent = {
      releaseMatch: jest.fn(),
      getDecision: jest.fn().mockResolvedValue({ gameOver: true, actions: [] }),
    } as unknown as AiAgentService;
    const roomId = 'ai_identity_room';
    const game = new GameInstance(roomId, server, 7, undefined, aiAgent);

    game.addPlayer('human_socket', null);
    game.addPlayer(`ai_${roomId}`, null);
    game.start('EASY');
    game.confirmAiReady('human_socket');

    await jest.advanceTimersByTimeAsync(999);
    expect(aiAgent.getDecision).not.toHaveBeenCalled();

    // EASY waits 800 ms before acting, then the AI game-over animation keeps
    // the final result on screen for another 1500 ms.
    await jest.advanceTimersByTimeAsync(2301);

    const gameOver = emissions.find(
      (emission) =>
        emission.target === roomId && emission.event === ServerEvent.GAME_OVER,
    );
    expect(gameOver?.payload).toEqual({
      roomId,
      loserId: `ai_${roomId}`,
      winnerId: 'human_socket',
    });
    expect(aiAgent.getDecision).toHaveBeenCalledTimes(1);

    game.stop();
  });

  it('publishes each AI movement before publishing the locked board', async () => {
    const aiAgent = {
      releaseMatch: jest.fn(),
      getDecision: jest
        .fn()
        .mockResolvedValueOnce({
          gameOver: false,
          actions: ['move_left', 'soft_drop', 'soft_drop', 'hard_drop'],
        })
        .mockImplementation(() => new Promise(() => undefined)),
    } as unknown as AiAgentService;
    const roomId = 'ai_action_room';
    const humanSocketId = 'human_socket';
    const game = new GameInstance(roomId, server, 11, undefined, aiAgent);

    game.addPlayer(humanSocketId, null);
    game.addPlayer(`ai_${roomId}`, null);
    game.start('EASY', 125);
    game.confirmAiReady(humanSocketId);

    await jest.advanceTimersByTimeAsync(1800);

    const updatesAfterHorizontalMove = emissions.filter(
      (emission) =>
        emission.target === humanSocketId &&
        emission.event === 'opponent_board_update',
    );
    expect(updatesAfterHorizontalMove).toHaveLength(2);

    await jest.advanceTimersByTimeAsync(124);
    expect(
      emissions.filter(
        (emission) =>
          emission.target === humanSocketId &&
          emission.event === 'opponent_board_update',
      ),
    ).toHaveLength(2);

    await jest.advanceTimersByTimeAsync(1);
    const updatesAfterSoftDrop = emissions.filter(
      (emission) =>
        emission.target === humanSocketId &&
        emission.event === 'opponent_board_update',
    );
    // SDF INF applies consecutive soft-drop cells in the same timer tick.
    expect(updatesAfterSoftDrop).toHaveLength(4);

    await jest.advanceTimersByTimeAsync(125);

    const updates = emissions.filter(
      (emission) =>
        emission.target === humanSocketId &&
        emission.event === 'opponent_board_update',
    );
    expect(updates).toHaveLength(5);
    expect(updates.some((update) => update.payload.score > 0)).toBe(true);
    expect(
      updates.some((update) =>
        update.payload.stage
          .slice(-4)
          .some((row: any[]) => row.some((cell) => cell[0] !== 0)),
      ),
    ).toBe(true);

    game.stop();
  });

  it('uses infinite SDF only between consecutive AI soft-drop cells', () => {
    const game = new GameInstance('ai_sdf_room', server, 11);
    const replayDelay = (action: AgentAction, next?: AgentAction) =>
      (game as any).aiReplayDelayMs(action, next, 125);

    expect(replayDelay('soft_drop', 'soft_drop')).toBe(0);
    expect(replayDelay('move_left', 'soft_drop')).toBe(125);
    expect(replayDelay('soft_drop', 'rotate_cw')).toBe(125);
    expect(replayDelay('soft_drop', 'hard_drop')).toBe(125);
  });

  it('waits for both versus agents before placing either next piece', async () => {
    const game = new GameInstance('lockstep_room', server, 12345);
    game.addCppPreviewPlayer('preview_left', 'left', 'expert');
    game.addCppPreviewPlayer('preview_right', 'right', 'hard');
    const left = game.getPlayers().get('preview_left')!;
    const right = game.getPlayers().get('preview_right')!;

    const makeDecision = (player: typeof left, actions: AgentAction[]) => {
      const simulated = { ...player };
      for (const action of actions.slice(0, -1)) {
        (game as any).applyAgentActionToState(simulated, action);
      }
      return {
        gameOver: false,
        actions,
        placement: {
          piece: simulated.activeMino,
          x: simulated.activeX,
          y:
            calcGhostY(
              simulated.board,
              simulated.activeMino,
              simulated.activeX,
              simulated.activeY,
              simulated.activeRotation,
            ) - VISIBLE_ROW_OFFSET,
          rotation: simulated.activeRotation,
        },
        completedDepth: 1,
        nodesVisited: 1,
      };
    };

    let resolveLeft!: (decision: ReturnType<typeof makeDecision>) => void;
    let resolveRight!: (decision: ReturnType<typeof makeDecision>) => void;
    const leftFirstDecision = new Promise<ReturnType<typeof makeDecision>>(
      (resolve) => {
        resolveLeft = resolve;
      },
    );
    const rightFirstDecision = new Promise<ReturnType<typeof makeDecision>>(
      (resolve) => {
        resolveRight = resolve;
      },
    );
    const gameOverDecision = Promise.resolve({
      gameOver: true,
      actions: [] as AgentAction[],
    });
    const leftAgent = {
      decide: jest
        .fn()
        .mockImplementationOnce(() => leftFirstDecision)
        .mockImplementation(() => gameOverDecision),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const rightAgent = {
      decide: jest
        .fn()
        .mockImplementationOnce(() => rightFirstDecision)
        .mockImplementation(() => gameOverDecision),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (game as any).isRunning = true;
    (game as any).cppPreviewOptions = {
      mode: 'versus',
      model: 'expert',
      opponentModel: 'hard',
      actionDelayMs: 0,
    };
    (game as any).cppAgents.set('preview_left', leftAgent);
    (game as any).cppAgents.set('preview_right', rightAgent);

    const loop = (game as any).runCppVersusPreviewLoop([
      ['preview_left', left],
      ['preview_right', right],
    ]);
    await Promise.resolve();
    resolveLeft(makeDecision(left, ['move_left', 'soft_drop', 'hard_drop']));
    await Promise.resolve();
    await Promise.resolve();

    // The fast side has completed its search, but may not consume an extra
    // piece while the other side is still thinking.
    expect(left.piecesPlaced).toBe(0);
    expect(right.piecesPlaced).toBe(0);

    resolveRight(makeDecision(right, ['hard_drop']));
    await loop;

    expect(left.piecesPlaced).toBe(1);
    expect(right.piecesPlaced).toBe(1);

    const leftFrames = emissions
      .filter(
        (emission) =>
          emission.event === ServerEvent.AI_PREVIEW_STATE &&
          emission.payload.side === 'left',
      )
      .map((emission) => emission.payload.state);
    expect(leftFrames.some((state) => state.activeMino.x === 2)).toBe(true);
    expect(leftFrames.some((state) => state.activeMino.y === 19)).toBe(true);
    expect(
      leftFrames.some((state) =>
        state.board.some((row: any[]) => row.some((cell) => cell !== null)),
      ),
    ).toBe(true);
  });
});
