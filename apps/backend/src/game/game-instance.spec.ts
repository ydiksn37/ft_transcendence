import { ServerEvent } from '@transcendence/shared';
import { GameInstance } from './game-instance';
import { AiAgentService } from './engine/ai-agent.service';

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

    await jest.advanceTimersByTimeAsync(801);

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
});
