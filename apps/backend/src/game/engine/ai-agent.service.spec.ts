import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { AiAgentService } from './ai-agent.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    exitCode: number | null;
    kill: jest.Mock;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.exitCode = null;
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

const request = (matchId = 'match-a', playerId = 'ai-a') => ({
  matchId,
  playerId,
  board: Array(40).fill('..........'),
  piece: 'I' as const,
  next: ['O', 'T', 'S', 'Z', 'J'] as ('O' | 'T' | 'S' | 'Z' | 'J')[],
  hold: null,
  canHold: true,
  b2b: 0,
  combo: -1,
  garbageQueue: 0,
  spawn: { x: 3, y: 18, rotation: 0 as const },
  opponent: {
    board: Array(40).fill('..........'),
    garbageQueue: 0,
    attacksSent: 0,
    piecesPlaced: 0,
  },
});

describe('AiAgentService match ownership', () => {
  let service: AiAgentService;
  let children: ReturnType<typeof fakeChild>[];
  const respond = (child: ReturnType<typeof fakeChild>) => {
    const payload = JSON.parse(child.stdin.read().toString());
    child.stdout.write(
      JSON.stringify({
        type: 'decision',
        requestId: payload.requestId,
        gameOver: false,
        actions: ['hard_drop'],
      }) + '\n',
    );
    return payload;
  };
  beforeEach(() => {
    jest.useFakeTimers();
    children = [];
    (spawn as jest.Mock).mockReset().mockImplementation(() => {
      const child = fakeChild();
      children.push(child);
      return child;
    });
    service = new AiAgentService();
    service.onModuleInit();
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('reuses only the same match/player and isolates simultaneous Expert games', async () => {
    expect(spawn).not.toHaveBeenCalled();
    const a = service.getDecision('EXPERT', request());
    const b = service.getDecision('EXPERT', request('match-b', 'ai-a'));
    const c = service.getDecision('EXPERT', request('match-a', 'ai-b'));
    expect(children).toHaveLength(3);
    children.forEach(respond);
    await Promise.all([a, b, c]);
    const again = service.getDecision('EXPERT', request());
    respond(children[0]);
    await again;
    expect(children).toHaveLength(3);
  });

  it('starts a fresh process on rematch and ignores a late exit from the old process', async () => {
    const first = service.getDecision('EXPERT', request());
    respond(children[0]);
    await first;
    service.releaseMatch('match-a');
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    const next = service.getDecision('EXPERT', request());
    expect(children).toHaveLength(2);
    children[0].emit('exit', 0);
    respond(children[1]);
    await next;
    expect(children[1].kill).not.toHaveBeenCalled();
  });

  it('cancels pending work only for the ended match', async () => {
    const a = service.getDecision('EXPERT', request());
    const rejected = expect(a).rejects.toThrow('AI match ended');
    const b = service.getDecision('EXPERT', request('match-b'));
    service.releaseMatch('match-a');
    await rejected;
    respond(children[1]);
    await b;
    expect(children[1].kill).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('isolates timeout and process failures and releases timers', async () => {
    const a = service.getDecision('EXPERT', request());
    const rejected = expect(a).rejects.toThrow('timed out');
    jest.advanceTimersByTime(10000);
    await rejected;
    expect(children[0].kill).toHaveBeenCalled();
    const b = service.getDecision('EXPERT', request('match-b'));
    const exited = expect(b).rejects.toThrow('exited');
    children[1].emit('exit', 1);
    await exited;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shuts down all sessions and rejects requests without an owner', async () => {
    await expect(service.getDecision('EXPERT', request(''))).rejects.toThrow(
      'required',
    );
    expect(children).toHaveLength(0);
    const a = service.getDecision('EXPERT', request());
    const rejected = expect(a).rejects.toThrow('shutting down');
    service.onModuleDestroy();
    await rejected;
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    await expect(service.getDecision('EXPERT', request())).rejects.toThrow(
      'not initialized',
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});
