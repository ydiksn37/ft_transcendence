import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { AI_BOT_CONFIGS, type AiDifficulty } from '@transcendence/shared';
import * as crypto from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type {
  AgentDecisionRequest,
  AgentDecisionResponse,
} from '../headless/headless-battle';

type AiDecisionRequest = Omit<
  AgentDecisionRequest,
  'version' | 'type' | 'requestId'
>;

interface AgentSession {
  matchId: string;
  playerId: string;
  difficulty: AiDifficulty;
  child: ChildProcessWithoutNullStreams;
}
interface PendingRequest {
  session: AgentSession;
  resolve: (response: AgentDecisionResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class AiAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private initialized = false;

  onModuleInit() {
    // Expert owns opener/bag history. Never share a process across players.
    this.initialized = true;
  }

  onModuleDestroy() {
    this.initialized = false;
    for (const session of [...this.sessions.values()]) {
      this.closeSession(session, new Error('AI service is shutting down'));
    }
  }

  private sessionKey(matchId: string, playerId: string): string {
    return JSON.stringify([matchId, playerId]);
  }

  private resolveAgentExecutable(): string {
    if (process.env.AI_AGENT_PATH) return process.env.AI_AGENT_PATH;
    const installedExecutable = '/usr/local/bin/ai_agent';
    if (existsSync(installedExecutable)) return installedExecutable;
    const localCandidates = [
      resolve(process.cwd(), 'build/ai-agent/ai_agent'),
      resolve(process.cwd(), '../../build/ai-agent/ai_agent'),
    ];
    return localCandidates.find(existsSync) ?? 'ai_agent';
  }

  private createSession(
    difficulty: AiDifficulty,
    matchId: string,
    playerId: string,
  ): AgentSession {
    const model = AI_BOT_CONFIGS[difficulty].model;
    const child = spawn(this.resolveAgentExecutable(), [
      '--model',
      model,
      '--think-ms',
      '50',
    ]);
    const session = { matchId, playerId, difficulty, child };
    this.sessions.set(this.sessionKey(matchId, playerId), session);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        const pending = this.pendingRequests.get(response.requestId);
        // Late output from a closed/replaced process cannot resolve another session.
        if (!pending || pending.session !== session) return;
        this.pendingRequests.delete(response.requestId);
        clearTimeout(pending.timeout);
        if (response.type === 'error') {
          pending.reject(
            new Error(response.message || 'AI agent returned an error'),
          );
        } else pending.resolve(response);
      } catch (error) {
        this.logger.error('AI output could not be parsed', error);
        this.closeSession(session, new Error('Invalid AI output'));
      }
    });
    child.stderr.on('data', (data) =>
      this.logger.debug(`AI [${model}]: ${data}`),
    );
    const fail = (error: Error) => this.closeSession(session, error);
    child.once('error', fail);
    child.stdin.on('error', fail);
    child.once('exit', (code) => {
      rl.close();
      this.closeSession(
        session,
        new Error(`AI agent exited with code ${code}`),
        false,
      );
    });
    return session;
  }

  private closeSession(session: AgentSession, error: Error, kill = true): void {
    const key = this.sessionKey(session.matchId, session.playerId);
    if (this.sessions.get(key) === session) this.sessions.delete(key);
    for (const [id, pending] of this.pendingRequests) {
      if (pending.session !== session) continue;
      this.pendingRequests.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    if (kill && !session.child.killed && session.child.exitCode === null) {
      session.child.kill();
    }
  }

  /** End one match without disturbing any other concurrent AI game. */
  releaseMatch(matchId: string): void {
    for (const session of [...this.sessions.values()]) {
      if (session.matchId === matchId) {
        this.closeSession(session, new Error('AI match ended'));
      }
    }
  }

  getDecision(
    difficulty: AiDifficulty,
    request: AiDecisionRequest,
  ): Promise<AgentDecisionResponse> {
    return new Promise((resolve, reject) => {
      if (!this.initialized)
        return reject(new Error('AI service is not initialized'));
      if (!request.matchId || !request.playerId)
        return reject(new Error('AI matchId and playerId are required'));
      const key = this.sessionKey(request.matchId, request.playerId);
      const session =
        this.sessions.get(key) ??
        this.createSession(difficulty, request.matchId, request.playerId);
      if (session.difficulty !== difficulty) {
        return reject(new Error('AI difficulty cannot change during a match'));
      }
      if (!session.child.stdin.writable) {
        this.closeSession(session, new Error('AI agent is unavailable'));
        return reject(new Error('AI agent is unavailable'));
      }
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.closeSession(session, new Error('AI agent timed out'));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(requestId, {
        session,
        resolve,
        reject,
        timeout,
      });
      session.child.stdin.write(
        JSON.stringify({
          ...request,
          version: 1,
          type: 'decide',
          requestId,
        }) + '\n',
        (error) => {
          if (error) this.closeSession(session, error);
        },
      );
    });
  }
}
