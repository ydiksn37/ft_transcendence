import { resolve } from 'node:path';
import { CppAgentProcess } from './cpp-agent-process';
import {
  HeadlessBattle,
  type HeadlessBattleResult,
  type HeadlessPlayerResult,
} from './headless-battle';

type OutputFormat = 'table' | 'json';

interface CliOptions {
  agent: string;
  modelA: string;
  modelB: string;
  games: number;
  seed: number;
  maxPieces: number;
  thinkMs: number;
  timeoutMs: number;
  format: OutputFormat;
}

interface ModelSummary {
  model: string;
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  pieces: number;
  lines: number;
  attack: number;
  garbageReceived: number;
  tetrises: number;
  tSpinSingles: number;
  tSpinDoubles: number;
  tSpinTriples: number;
  maxB2b: number;
  totalDecisionMs: number;
  decisions: number;
}

function usage(): string {
  return [
    'Usage: headless-cli [options]',
    '',
    '  --agent PATH          C++ ai_agent executable',
    '  --model-a NAME        first model (default: hard)',
    '  --model-b NAME        second model (default: easy)',
    '  --games N             number of matches (default: 10)',
    '  --seed N              first match seed (default: 42)',
    '  --max-pieces N        cap per player (default: 500)',
    '  --think-ms N          C++ search budget per move (default: 50)',
    '  --timeout-ms N        response timeout (default: think-ms * 4 + 500)',
    '  --format table|json   output format (default: table)',
  ].join('\n');
}

function parseInteger(name: string, value: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function parseArguments(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!argument.startsWith('--'))
      throw new Error(`unknown argument: ${argument}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing value for ${argument}`);
    values.set(argument, value);
  }

  const thinkMs = parseInteger(
    '--think-ms',
    values.get('--think-ms') ?? '50',
    1,
  );
  const format = values.get('--format') ?? 'table';
  if (format !== 'table' && format !== 'json') {
    throw new Error('--format must be table or json');
  }
  const known = new Set([
    '--agent',
    '--model-a',
    '--model-b',
    '--games',
    '--seed',
    '--max-pieces',
    '--think-ms',
    '--timeout-ms',
    '--format',
  ]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`unknown option: ${key}`);
  }

  return {
    agent: resolve(values.get('--agent') ?? 'build/ai-agent/ai_agent'),
    modelA: values.get('--model-a') ?? 'hard',
    modelB: values.get('--model-b') ?? 'easy',
    games: parseInteger('--games', values.get('--games') ?? '10', 1),
    seed: parseInteger('--seed', values.get('--seed') ?? '42', 0),
    maxPieces: parseInteger(
      '--max-pieces',
      values.get('--max-pieces') ?? '500',
      1,
    ),
    thinkMs,
    timeoutMs: parseInteger(
      '--timeout-ms',
      values.get('--timeout-ms') ?? String(thinkMs * 4 + 500),
      1,
    ),
    format,
  };
}

function emptySummary(model: string): ModelSummary {
  return {
    model,
    appearances: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pieces: 0,
    lines: 0,
    attack: 0,
    garbageReceived: 0,
    tetrises: 0,
    tSpinSingles: 0,
    tSpinDoubles: 0,
    tSpinTriples: 0,
    maxB2b: 0,
    totalDecisionMs: 0,
    decisions: 0,
  };
}

function addPlayer(
  summaries: Map<string, ModelSummary>,
  player: HeadlessPlayerResult,
  outcome: 'win' | 'loss' | 'draw',
): void {
  let summary = summaries.get(player.model);
  if (!summary) {
    summary = emptySummary(player.model);
    summaries.set(player.model, summary);
  }
  summary.appearances++;
  if (outcome === 'win') summary.wins++;
  else if (outcome === 'loss') summary.losses++;
  else summary.draws++;
  summary.pieces += player.piecesPlaced;
  summary.lines += player.lines;
  summary.attack += player.attacksSent;
  summary.garbageReceived += player.garbageReceived;
  summary.tetrises += player.tetrises;
  summary.tSpinSingles += player.tSpinSingles;
  summary.tSpinDoubles += player.tSpinDoubles;
  summary.tSpinTriples += player.tSpinTriples;
  summary.maxB2b = Math.max(summary.maxB2b, player.maxB2b);
  summary.totalDecisionMs += player.totalDecisionMs;
  summary.decisions += player.decisions;
}

function summarize(results: HeadlessBattleResult[]): ModelSummary[] {
  const summaries = new Map<string, ModelSummary>();
  for (const result of results) {
    for (const player of result.players) {
      const outcome =
        result.winnerId === null
          ? 'draw'
          : result.winnerId === player.id
            ? 'win'
            : 'loss';
      addPlayer(summaries, player, outcome);
    }
  }
  return [...summaries.values()];
}

function average(value: number, count: number): string {
  return (count === 0 ? 0 : value / count).toFixed(2);
}

function printMatch(index: number, result: HeadlessBattleResult): void {
  const left = result.players[0];
  const right = result.players[1];
  const winner =
    result.winnerId === null
      ? 'DRAW'
      : (result.players.find((player) => player.id === result.winnerId)
          ?.model ?? '?');
  console.log(
    `${String(index + 1).padStart(4)}  ${String(result.seed).padStart(10)}  ` +
      `${left.model.padEnd(10)} ${String(left.attacksSent).padStart(6)} ${String(left.piecesPlaced).padStart(6)}  ` +
      `${right.model.padEnd(10)} ${String(right.attacksSent).padStart(6)} ${String(right.piecesPlaced).padStart(6)}  ` +
      `${winner.padEnd(10)} ${result.reason}`,
  );
}

async function run(options: CliOptions): Promise<void> {
  const results: HeadlessBattleResult[] = [];
  for (let index = 0; index < options.games; index++) {
    const models: [string, string] =
      index % 2 === 0
        ? [options.modelA, options.modelB]
        : [options.modelB, options.modelA];
    const agents: [CppAgentProcess, CppAgentProcess] = [
      new CppAgentProcess({
        executable: options.agent,
        model: models[0],
        thinkTimeMs: options.thinkMs,
        responseTimeoutMs: options.timeoutMs,
      }),
      new CppAgentProcess({
        executable: options.agent,
        model: models[1],
        thinkTimeMs: options.thinkMs,
        responseTimeoutMs: options.timeoutMs,
      }),
    ];
    try {
      await Promise.all(agents.map((agent) => agent.ready()));
      const battle = new HeadlessBattle(agents, {
        matchId: `headless-${index + 1}`,
        seed: options.seed + index,
        maxPiecesPerPlayer: options.maxPieces,
      });
      const result = await battle.play();
      results.push(result);
    } finally {
      await Promise.all(agents.map((agent) => agent.close()));
    }
  }

  if (options.format === 'json') {
    console.log(
      JSON.stringify({ options, results, summary: summarize(results) }),
    );
  } else {
    console.log(
      `model_a=${options.modelA} model_b=${options.modelB} games=${options.games} ` +
        `seed=${options.seed} max_pieces=${options.maxPieces} think_ms=${options.thinkMs}`,
    );
    console.log(
      'game        seed  left       attack pieces  right      attack pieces  winner     reason',
    );
    results.forEach((result, index) => printMatch(index, result));
    console.log('\nsummary');
    console.log(
      'model       W   L   D   attack/piece  lines/piece  avg decision  tetris  ts1  ts2  ts3  b2bmax',
    );
    for (const summary of summarize(results)) {
      console.log(
        `${summary.model.padEnd(10)} ${String(summary.wins).padStart(3)} ` +
          `${String(summary.losses).padStart(3)} ${String(summary.draws).padStart(3)}   ` +
          `${average(summary.attack, summary.pieces).padStart(12)}  ` +
          `${average(summary.lines, summary.pieces).padStart(11)}  ` +
          `${average(summary.totalDecisionMs, summary.decisions).padStart(9)} ms  ` +
          `${String(summary.tetrises).padStart(6)} ${String(summary.tSpinSingles).padStart(4)} ` +
          `${String(summary.tSpinDoubles).padStart(4)} ${String(summary.tSpinTriples).padStart(4)} ` +
          `${String(summary.maxB2b).padStart(7)}`,
      );
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  void run(options).catch((error: unknown) => {
    console.error(
      `headless battle failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
} catch (error) {
  console.error(
    `error: ${error instanceof Error ? error.message : String(error)}\n\n${usage()}`,
  );
  process.exitCode = 1;
}
