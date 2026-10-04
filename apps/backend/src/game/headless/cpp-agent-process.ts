import { Logger } from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface, Interface } from 'node:readline';
import {
  AGENT_ACTIONS,
  AgentDecisionRequest,
  AgentDecisionResponse,
  AgentTimeoutError,
  HeadlessAgent,
} from './headless-battle';

export interface CppAgentProcessOptions {
  executable: string;
  model: string;
  thinkTimeMs: number;
  responseTimeoutMs: number;
  cwd?: string;
}

interface PendingDecision {
  resolve: (response: AgentDecisionResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface ReadyMessage {
  version: number;
  type: 'ready';
  difficulty: string;
}

export class AgentProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentProtocolError';
  }
}

export class CppAgentProcess implements HeadlessAgent {
  private readonly logger = new Logger(CppAgentProcess.name);
  readonly name: string;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly stdout: Interface;
  private readonly pending = new Map<string, PendingDecision>();
  private readonly readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private readyReceived = false;
  private stderrTail = '';
  private closed = false;

  constructor(private readonly options: CppAgentProcessOptions) {
    this.name = options.model;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.child = spawn(
      options.executable,
      ['--model', options.model, '--think-ms', String(options.thinkTimeMs)],
      {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    this.stdout = createInterface({ input: this.child.stdout });
    this.stdout.on('line', (line) => this.handleLine(line));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-4096);
    });
    this.child.stdin.on('error', (error) => {
      if (!this.closed) this.failAll(error);
    });
    this.child.once('error', (error) => this.failAll(error));
    this.child.once('exit', (code, signal) => {
      if (this.closed && code === 0) return;
      const detail = this.stderrTail.trim();
      this.failAll(
        new AgentProtocolError(
          `agent ${this.name} exited (code=${String(code)}, signal=${String(signal)})` +
            (detail ? `: ${detail}` : ''),
        ),
      );
    });
  }

  async ready(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.readyPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AgentTimeoutError(
                  `agent ${this.name} did not become ready`,
                ),
              ),
            this.options.responseTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse> {
    if (!this.readyReceived) {
      return Promise.reject(
        new AgentProtocolError(`agent ${this.name} is not ready`),
      );
    }
    if (this.closed || this.child.exitCode !== null) {
      return Promise.reject(
        new AgentProtocolError(`agent ${this.name} is closed`),
      );
    }
    if (this.pending.has(request.requestId)) {
      return Promise.reject(
        new AgentProtocolError(`duplicate requestId: ${request.requestId}`),
      );
    }

    return new Promise<AgentDecisionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(
          new AgentTimeoutError(
            `agent ${this.name} exceeded ${this.options.responseTimeoutMs} ms`,
          ),
        );
      }, this.options.responseTimeoutMs);
      this.pending.set(request.requestId, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(request.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(request.requestId);
        pending.reject(error);
      });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.readyReceived) {
      this.readyReject(new AgentProtocolError(`agent ${this.name} is closing`));
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new AgentProtocolError(`agent ${this.name} is closing`));
    }
    this.pending.clear();
    if (this.child.exitCode !== null) {
      this.stdout.close();
      return;
    }
    if (this.child.stdin.writable) {
      this.child.stdin.end(`${JSON.stringify({ type: 'shutdown' })}\n`);
    }
    if (!(await this.waitForExit(500))) {
      this.logger.warn(
        `AI preview agent ${this.name} (pid=${String(this.child.pid)}) did not shut down; sending SIGTERM`,
      );
      this.child.kill('SIGTERM');
    }
    if (!(await this.waitForExit(500))) {
      this.logger.warn(
        `AI preview agent ${this.name} (pid=${String(this.child.pid)}) ignored SIGTERM; sending SIGKILL`,
      );
      this.child.kill('SIGKILL');
      if (!(await this.waitForExit(500))) {
        this.logger.error(
          `AI preview agent ${this.name} (pid=${String(this.child.pid)}) did not exit after SIGKILL`,
        );
      }
    }
    this.stdout.close();
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.child.off('exit', onExit);
        resolve(false);
      }, timeoutMs);
      this.child.once('exit', onExit);
    });
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.failAll(
        new AgentProtocolError(
          `agent ${this.name} wrote non-JSON stdout: ${line.slice(0, 200)}`,
        ),
      );
      return;
    }
    if (!message || typeof message !== 'object') {
      this.failAll(
        new AgentProtocolError(`agent ${this.name} wrote a non-object message`),
      );
      return;
    }
    const record = message as Record<string, unknown>;
    if (record.type === 'ready') {
      const ready = record as unknown as ReadyMessage;
      if (typeof ready.difficulty !== 'string') {
        this.readyReject(
          new AgentProtocolError('ready message has no difficulty'),
        );
        return;
      }
      this.readyReceived = true;
      this.readyResolve();
      return;
    }
    const requestId =
      typeof record.requestId === 'string' ? record.requestId : null;
    if (!requestId) {
      this.failAll(
        new AgentProtocolError(`agent ${this.name} response has no requestId`),
      );
      return;
    }
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (record.type === 'error') {
      pending.reject(
        new AgentProtocolError(
          typeof record.message === 'string'
            ? record.message
            : 'agent returned an error',
        ),
      );
      return;
    }
    if (
      record.type !== 'decision' ||
      typeof record.gameOver !== 'boolean' ||
      !Array.isArray(record.actions) ||
      !record.actions.every(
        (action) =>
          typeof action === 'string' &&
          (AGENT_ACTIONS as readonly string[]).includes(action),
      )
    ) {
      pending.reject(
        new AgentProtocolError(`invalid decision from agent ${this.name}`),
      );
      return;
    }
    pending.resolve(message as AgentDecisionResponse);
  }

  private failAll(error: Error): void {
    if (!this.readyReceived) this.readyReject(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
