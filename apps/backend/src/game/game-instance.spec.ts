import { ServerEvent } from '@transcendence/shared';
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
    const request = (game as any).makeCppDecisionRequest(
      'preview_left',
      left,
    );
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

  it('publishes a 40-row opponent stage including the active AI mino', () => {
    const aiAgent = {
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
      getDecision: jest.fn().mockResolvedValue({ gameOver: true, actions: [] }),
    } as unknown as AiAgentService;
    const roomId = 'ai_identity_room';
    const game = new GameInstance(roomId, server, 7, undefined, aiAgent);

    game.addPlayer('human_socket', null);
    game.addPlayer(`ai_${roomId}`, null);
    game.start('EASY');

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
      loserId: `ai_${roomId}`,
      winnerId: 'human_socket',
    });
    expect(aiAgent.getDecision).toHaveBeenCalledTimes(1);

    game.stop();
  });

  it('publishes each AI movement before publishing the locked board', async () => {
    const aiAgent = {
      getDecision: jest
        .fn()
        .mockResolvedValueOnce({
          gameOver: false,
          actions: ['move_left', 'soft_drop', 'hard_drop'],
        })
        .mockImplementation(() => new Promise(() => undefined)),
    } as unknown as AiAgentService;
    const roomId = 'ai_action_room';
    const humanSocketId = 'human_socket';
    const game = new GameInstance(roomId, server, 11, undefined, aiAgent);

    game.addPlayer(humanSocketId, null);
    game.addPlayer(`ai_${roomId}`, null);
    game.start('EASY', 125);

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
    expect(updatesAfterSoftDrop).toHaveLength(3);

    await jest.advanceTimersByTimeAsync(125);

    const updates = emissions.filter(
      (emission) =>
        emission.target === humanSocketId &&
        emission.event === 'opponent_board_update',
    );
    expect(updates).toHaveLength(4);
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
