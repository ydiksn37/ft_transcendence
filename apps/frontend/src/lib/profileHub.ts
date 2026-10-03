import type { DailyAnalyticView, GameRecordView, UserStats } from './types';

export const PROFILE_TABS = ['overview', 'performance', 'achievements'] as const;
export type ProfileTab = typeof PROFILE_TABS[number];

export function getProfileTab(search: string): ProfileTab {
  const value = new URLSearchParams(search).get('tab');
  return PROFILE_TABS.includes(value as ProfileTab) ? value as ProfileTab : 'overview';
}

export function profileSearch(search: string, tab: ProfileTab): string {
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return `?${params.toString()}`;
}

export function legacyDashboardDestination(search: string): string {
  return `/profile${profileSearch(search, 'performance')}`;
}

export function normalizeStats(data: UserStats): UserStats {
  return { ...data, bestApm: Number(data.bestApm), avgApm: Number(data.avgApm),
    bestPps: Number(data.bestPps), avgPps: Number(data.avgPps), winRate: Number(data.winRate) };
}

export function mapGameHistory(data: any[], userId: string): GameRecordView[] {
  return data.map(game => {
    const isPlayerOne = game.player1Id === userId;
    return { id: game.id, date: new Date(game.createdAt).toISOString().split('T')[0], mode: game.gameMode,
      apm: Number(isPlayerOne ? game.player1Apm : game.player2Apm),
      pps: Number(isPlayerOne ? game.player1Pps : game.player2Pps),
      lines: isPlayerOne ? game.player1LinesCleared : game.player2LinesCleared,
      result: game.winnerId === userId ? 'WIN' : (game.winnerId ? 'LOSE' : null) };
  });
}

export function mapAnalytics(data: any[]): DailyAnalyticView[] {
  return data.map(day => ({ date: day.date, gamesPlayed: day.gamesPlayed, wins: day.wins,
    losses: day.losses, avgApm: Number(day.avgApm), avgPps: Number(day.avgPps),
    totalLinesCleared: day.totalLinesCleared }));
}
