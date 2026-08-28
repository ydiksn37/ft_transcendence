import { addGarbageLines, createEmptyBoard } from '../engine/board';
import {
  AgentTimeoutError,
  HeadlessBattle,
  type AgentDecisionRequest,
  type AgentDecisionResponse,
  type HeadlessAgent,
} from './headless-battle';

class HardDropAgent implements HeadlessAgent {
  readonly requests: AgentDecisionRequest[] = [];

  constructor(readonly name: string) {}

  decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse> {
    this.requests.push(request);
    return Promise.resolve({
      version: 1,
      type: 'decision',
      requestId: request.requestId,
      gameOver: false,
      actions: ['hard_drop'],
    });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class InvalidAgent extends HardDropAgent {
  override decide(
    request: AgentDecisionRequest,
  ): Promise<AgentDecisionResponse> {
    return Promise.resolve({
      version: 1,
      type: 'decision',
      requestId: request.requestId,
      gameOver: false,
      actions: ['move_left'],
    });
  }
}

class TimeoutAgent extends HardDropAgent {
  override decide(): Promise<AgentDecisionResponse> {
    return Promise.reject(new AgentTimeoutError('test timeout'));
  }
}

describe('HeadlessBattle', () => {
  it('runs both agents to the configured piece cap using TS rules', async () => {
    const left = new HardDropAgent('left');
    const right = new HardDropAgent('right');
    const result = await new HeadlessBattle([left, right], {
      matchId: 'cap-test',
      seed: 42,
      maxPiecesPerPlayer: 5,
    }).play();

    expect(result.reason).toBe('piece_limit');
    expect(result.winnerId).toBeNull();
    expect(result.players.map((player) => player.piecesPlaced)).toEqual([5, 5]);
    expect(left.requests[0]).toMatchObject({
      version: 1,
      type: 'decide',
      playerId: 'player-1',
      canHold: true,
      spawn: { x: 3, y: 18, rotation: 0 },
    });
    expect(left.requests[0].board).toHaveLength(40);
    expect(left.requests[0].board[0]).toHaveLength(10);
    expect(left.requests[0].next).toHaveLength(5);
  });

  it('makes an agent with an invalid action sequence lose', async () => {
    const result = await new HeadlessBattle(
      [new InvalidAgent('invalid'), new HardDropAgent('valid')],
      { matchId: 'invalid-test', seed: 7, maxPiecesPerPlayer: 5 },
    ).play();

    expect(result.reason).toBe('invalid_decision');
    expect(result.loserId).toBe('player-1');
    expect(result.winnerId).toBe('player-2');
  });

  it('distinguishes a response timeout from other agent errors', async () => {
    const result = await new HeadlessBattle(
      [new TimeoutAgent('slow'), new HardDropAgent('valid')],
      { matchId: 'timeout-test', seed: 7, maxPiecesPerPlayer: 5 },
    ).play();

    expect(result.reason).toBe('agent_timeout');
    expect(result.loserId).toBe('player-1');
  });
});

describe('deterministic garbage injection', () => {
  it('accepts a seeded random source without changing the production default', () => {
    const board = addGarbageLines(createEmptyBoard(), 2, () => 0.35);

    expect(board[38].map((cell) => (cell === null ? '.' : '#')).join('')).toBe(
      '###.######',
    );
    expect(board[39].map((cell) => (cell === null ? '.' : '#')).join('')).toBe(
      '###.######',
    );
  });
});
