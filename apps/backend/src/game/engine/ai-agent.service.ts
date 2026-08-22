import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { AiDifficulty } from '@transcendence/shared';
import * as crypto from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface AiDecisionRequest {
  board: any[][];
  piece: string;
  next?: string[];
  hold?: string | null;
  canHold?: boolean;
  b2b?: boolean;
  spawn?: { x: number; y: number; rotation: number };
}

interface PendingRequest {
  difficulty: AiDifficulty;
  resolve: (response: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class AiAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAgentService.name);
  private agents: Record<AiDifficulty, ChildProcessWithoutNullStreams> | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  onModuleInit() {
    this.agents = {
      EASY: this.spawnAgent('EASY', 'easy', 50),
      MEDIUM: this.spawnAgent('MEDIUM', 'hard', 50),
      HARD: this.spawnAgent('HARD', 'expert', 50),
    };
  }

  onModuleDestroy() {
    if (this.agents) {
      Object.values(this.agents).forEach(agent => {
        if (agent.stdin.writable) {
          agent.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
        }
        agent.kill();
      });
    }
    this.rejectPendingRequests(() => true, new Error('AI service is shutting down'));
  }

  private resolveAgentExecutable(): string {
    if (process.env.AI_AGENT_PATH) return process.env.AI_AGENT_PATH;

    // Docker images install the Linux binary here. Prefer it over workspace
    // build artifacts, which may have been produced for the host OS.
    const installedExecutable = '/usr/local/bin/ai_agent';
    if (existsSync(installedExecutable)) return installedExecutable;

    const localCandidates = [
      resolve(process.cwd(), 'build/ai-agent/ai_agent'),
      resolve(process.cwd(), '../../build/ai-agent/ai_agent'),
    ];
    return localCandidates.find(existsSync) ?? 'ai_agent';
  }

  private spawnAgent(difficulty: AiDifficulty, model: string, thinkMs: number) {
    const executable = this.resolveAgentExecutable();
    const agent = spawn(executable, ['--model', model, '--think-ms', thinkMs.toString()]);
    
    const rl = readline.createInterface({ input: agent.stdout });
    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const pending = this.pendingRequests.get(response.requestId)!;
          this.pendingRequests.delete(response.requestId);
          clearTimeout(pending.timeout);
          if (response.type === 'error') {
            pending.reject(new Error(response.message || 'AI agent returned an error'));
          } else {
            pending.resolve(response);
          }
        }
      } catch (e) {
        this.logger.error(`AI出力のパースに失敗しました: ${line}`, e);
      }
    });

    agent.stderr.on('data', (data) => this.logger.debug(`AI [${model}]: ${data}`));
    agent.on('error', (error) => {
      this.logger.error(`AI Agent [${model}] の起動に失敗しました: ${error.message}`);
      this.rejectPendingRequests(
        pending => pending.difficulty === difficulty,
        new Error(`AI Agent [${model}] is unavailable: ${error.message}`),
      );
    });
    agent.on('exit', (code) => {
      this.logger.warn(`AI Agent [${model}] がコード ${code} で終了しました`);
      this.rejectPendingRequests(
        pending => pending.difficulty === difficulty,
        new Error(`AI Agent [${model}] exited with code ${code}`),
      );
    });

    return agent;
  }

  private rejectPendingRequests(
    predicate: (pending: PendingRequest) => boolean,
    error: Error,
  ): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (!predicate(pending)) continue;
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  public getDecision(difficulty: AiDifficulty, request: AiDecisionRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.agents) return reject(new Error('AI Agents が初期化されていません'));

      const agent = this.agents[difficulty];
      if (!agent || !agent.stdin.writable) {
        return reject(new Error(`AI Agent [${difficulty}] is unavailable`));
      }
      
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) return;
        this.pendingRequests.delete(requestId);
        pending.reject(new Error(`AI Agent [${difficulty}] timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(requestId, { difficulty, resolve, reject, timeout });

      const payload = {
        version: 1,
        type: 'decide',
        requestId,
        ...request,
      };

      agent.stdin.write(JSON.stringify(payload) + '\n', error => {
        if (!error) return;
        const pending = this.pendingRequests.get(requestId);
        if (!pending) return;
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timeout);
        pending.reject(error);
      });
    });
  }
}
