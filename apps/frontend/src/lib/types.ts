export type GameMode = 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1';

export type MatchOutcome = 'WIN' | 'LOSE';

export interface GameRecordView {
	id: string;
	date: string;
	mode: GameMode;
	apm: number;
	pps: number;
	result: MatchOutcome | null;
	lines: number;
}

export interface DailyAnalyticView {
	date: string;
	gamesPlayed: number;
	wins: number;
	losses: number;
	avgApm: number;
	avgPps: number;
	totalLinesCleared: number;
}

export type Rank =
	| 'BRONZE'
	| 'SILVER'
	| 'GOLD'
	| 'PLATINUM'
	| 'DIAMOND'
	| 'MASTER';

export interface UserStats {
	wins: number;
	losses: number;
	totalGames: number;
	winRate: number;
	bestApm: number;
	avgApm: number;
	bestPps: number;
	avgPps: number;
	totalLinesCleared: number;
	totalTSpins: number;
	totalTetrises: number;
	currentWinStreak: number;
	bestWinStreak: number;
	xp: number;
	level: number;
	rank: Rank;
	rankPoints: number;
}
