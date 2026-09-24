import type { GameRecordView } from './types';

export const HISTORY_COLUMNS = ['Date (UTC)', 'Mode', 'Result', 'APM', 'PPS', 'Lines Cleared'];

export function historyRows(games: GameRecordView[]): (string | number)[][] {
  return games.map(game => [game.date, game.mode, game.result ?? 'UNSPECIFIED', game.apm, game.pps, game.lines]);
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Quote delimiters and prevent spreadsheet formula interpretation of text.
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function historyCsv(games: GameRecordView[]): string {
  return '\uFEFF' + [HISTORY_COLUMNS, ...historyRows(games)].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
