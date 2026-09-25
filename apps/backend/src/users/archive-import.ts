import { BadRequestException } from '@nestjs/common';

const FIELDS = [
  'playedAt',
  'mode',
  'result',
  'opponent',
  'score',
  'apm',
  'pps',
  'lines',
] as const;

type ArchiveField = (typeof FIELDS)[number];
type RawArchiveRow = Partial<Record<ArchiveField, unknown>>;

export interface ArchiveRow {
  playedAt: Date;
  mode: string;
  result: 'WIN' | 'LOSE' | 'DRAW' | 'UNSPECIFIED';
  opponent: string | null;
  score: number | null;
  apm: number | null;
  pps: number | null;
  lines: number | null;
}

export interface ArchiveRowError {
  row: number;
  errors: string[];
}

function csvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted)
    throw new BadRequestException('CSV contains an unterminated quote');
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function parseSource(format: 'json' | 'csv', source: string): RawArchiveRow[] {
  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new BadRequestException('Archive JSON is invalid');
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { records?: unknown }).records)
        ? (parsed as { records: unknown[] }).records
        : null;
    if (!rows)
      throw new BadRequestException(
        'Archive JSON must be an array or { records: [] }',
      );
    return rows as RawArchiveRow[];
  }

  const rows = csvRows(source.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  const unknown = headers.find(
    (header) => !FIELDS.includes(header as ArchiveField),
  );
  if (unknown) throw new BadRequestException(`Unknown CSV column: ${unknown}`);
  for (const required of ['playedAt', 'mode', 'result']) {
    if (!headers.includes(required))
      throw new BadRequestException(`Missing CSV column: ${required}`);
  }
  return rows
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      ),
    );
}

function nullableNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    (integer && !Number.isInteger(parsed))
  ) {
    throw new Error(
      `${field} must be ${minimum}-${maximum}${integer ? ' integer' : ''}`,
    );
  }
  return parsed;
}

function normalizeRow(value: unknown): ArchiveRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('row must be an object');
  const row = value as RawArchiveRow;
  const unknown = Object.keys(row).find(
    (field) => !FIELDS.includes(field as ArchiveField),
  );
  if (unknown) throw new Error(`unknown field: ${unknown}`);
  if (typeof row.playedAt !== 'string')
    throw new Error('playedAt must be an ISO date');
  const playedAt = new Date(row.playedAt);
  if (Number.isNaN(playedAt.getTime()))
    throw new Error('playedAt must be an ISO date');
  if (typeof row.mode !== 'string') throw new Error('mode must be a string');
  const mode = row.mode.trim();
  if (mode.length < 1 || mode.length > 30)
    throw new Error('mode must be 1-30 characters');
  if (typeof row.result !== 'string')
    throw new Error('result must be a string');
  const result = row.result.toUpperCase();
  if (!['WIN', 'LOSE', 'DRAW', 'UNSPECIFIED'].includes(result)) {
    throw new Error('result must be WIN, LOSE, DRAW, or UNSPECIFIED');
  }
  if (row.opponent != null && typeof row.opponent !== 'string')
    throw new Error('opponent must be a string');
  const opponent = row.opponent?.trim() ?? '';
  if (opponent.length > 100)
    throw new Error('opponent must be at most 100 characters');
  return {
    playedAt,
    mode,
    result: result as ArchiveRow['result'],
    opponent: opponent || null,
    score: nullableNumber(row.score, 'score', 0, 2_147_483_647, true),
    apm: nullableNumber(row.apm, 'apm', 0, 1000),
    pps: nullableNumber(row.pps, 'pps', 0, 100),
    lines: nullableNumber(row.lines, 'lines', 0, 1_000_000, true),
  };
}

export function previewArchive(
  format: 'json' | 'csv',
  source: string,
): {
  rows: ArchiveRow[];
  errors: ArchiveRowError[];
} {
  const rawRows = parseSource(format, source);
  if (rawRows.length > 500)
    throw new BadRequestException(
      'At most 500 archive rows can be imported at once',
    );
  const rows: ArchiveRow[] = [];
  const errors: ArchiveRowError[] = [];
  rawRows.forEach((row, index) => {
    try {
      rows.push(normalizeRow(row));
    } catch (error: unknown) {
      errors.push({
        row: index + 1,
        errors: [error instanceof Error ? error.message : 'invalid row'],
      });
    }
  });
  return { rows, errors };
}
