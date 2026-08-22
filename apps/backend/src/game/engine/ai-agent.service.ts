import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { AiDifficulty } from '@transcendence/shared';
import * as crypto from 'crypto';

interface AiDecisionRequest {
  board: any[][];
  piece: string;
  next?: string[];
  hold?: string | null;
  canHold?: boolean;
  b2b?: boolean;
  spawn?: { x: number; y: number; rotation: number };
}

@Injectable()
export class AiAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAgentService.name);
  private agents: Record<AiDifficulty, ChildProcessWithoutNullStreams> | null = null;
  private pendingRequests = new Map<string, (res: any) => void>();

  onModuleInit() {
    this.agents = {
      EASY: this.spawnAgent('easy', 50),
      MEDIUM: this.spawnAgent('hard', 50),
      HARD: this.spawnAgent('expert', 50),
    };
  }

  onModuleDestroy() {
    if (this.agents) {
      Object.values(this.agents).forEach(agent => {
        agent.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
        agent.kill();
      });
    }
  }

  private spawnAgent(model: string, thinkMs: number) {
    const agent = spawn('ai_agent', ['--model', model, '--think-ms', thinkMs.toString()]);
    
    const rl = readline.createInterface({ input: agent.stdout });
    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          this.pendingRequests.get(response.requestId)!(response);
          this.pendingRequests.delete(response.requestId);
        }
      } catch (e) {
        this.logger.error(`AI出力のパースに失敗しました: ${line}`, e);
      }
    });

    agent.stderr.on('data', (data) => this.logger.debug(`AI [${model}]: ${data}`));
    agent.on('exit', (code) => this.logger.warn(`AI Agent [${model}] がコード ${code} で終了しました`));

    return agent;
  }

  public getDecision(difficulty: AiDifficulty, request: AiDecisionRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.agents) return reject('AI Agents が初期化されていません');
      
      const requestId = crypto.randomUUID();
      this.pendingRequests.set(requestId, resolve);

      const payload = {
        version: 1,
        type: 'decide',
        requestId,
        ...request,
      };

      this.agents[difficulty].stdin.write(JSON.stringify(payload) + '\n');
    });
  }
}
