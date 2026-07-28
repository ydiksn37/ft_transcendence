
/***************************************************************** */
/* 				DB接続できたら不要の仮データ
/***************************************************************** */

/***************************************************************** */
/* 				ゲームデータのモック
/***************************************************************** */

import type { GameRecordView } from "@/lib/types"

export const MOCK_GAMES: GameRecordView[] = [
	{ id: "a1b2c3d4-0001-4000-8000-000000000001", date: "2077-07-18", mode: "ONLINE_1V1", score: 31500, level: 11, lines: 62, result: "WIN"  },
	{ id: "a1b2c3d4-0002-4000-8000-000000000002", date: "2077-07-18", mode: "MARATHON",   score: 24800, level: 8,  lines: 48, result: null   },
	{ id: "a1b2c3d4-0003-4000-8000-000000000003", date: "2077-07-17", mode: "40_LINES",   score: 12400, level: 5,  lines: 40, result: null   },
	{ id: "a1b2c3d4-0004-4000-8000-000000000004", date: "2077-07-17", mode: "ONLINE_1V1", score: 9400,  level: 4,  lines: 18, result: "LOSE" },
	{ id: "a1b2c3d4-0005-4000-8000-000000000005", date: "2077-07-16", mode: "4_WIDE",     score: 6800,  level: 3,  lines: 22, result: null   },
	{ id: "a1b2c3d4-0006-4000-8000-000000000006", date: "2077-07-16", mode: "ONLINE_1V1", score: 22100, level: 9,  lines: 44, result: "WIN"  },
	{ id: "a1b2c3d4-0007-4000-8000-000000000007", date: "2077-07-15", mode: "40_LINES",   score: 11900, level: 5,  lines: 40, result: null   },
	{ id: "a1b2c3d4-0008-4000-8000-000000000008", date: "2077-07-15", mode: "ONLINE_1V1", score: 7200,  level: 3,  lines: 14, result: "LOSE" },
]

export function getGameHistory(): GameRecordView[] {
	return (MOCK_GAMES);
}	

/***************************************************************** */
/* 				ユーザーステータスのモックデータ
/***************************************************************** */

import type { UserStats } from "@/lib/types"

export const MOCK_USER_STATS: UserStats = {
	/* mocks/games.ts の ONLINE_1V1 4件（WIN 2 / LOSE 2）と一致させる */
	wins: 2,
	losses: 2,
	totalGames: 4,
	winRate: 50,

	bestApm: 92.4,
	avgApm: 71.8,
	bestPps: 2.31,
	avgPps: 1.64,

	totalLinesCleared: 248,
	totalTSpins: 31,
	totalTetrises: 18,

	currentWinStreak: 1,
	bestWinStreak: 3,

	xp: 4820,
	level: 12,
	rank: "GOLD",
	rankPoints: 1340,
}

export function getUserStats(): UserStats {
	return (MOCK_USER_STATS);
}

/***************************************************************** */
/* 				ユーザーランキングのモックデータ
				UserStatsテーブルを
/***************************************************************** */

const MOCK_RANKING = [
	{ name: "NEON_ACE",    rankPoints: 2480 },
	{ name: "GRID_REAPER", rankPoints: 2310 },
	{ name: "VOLT_HAND",   rankPoints: 2145 },
	{ name: "CYBER_01",    rankPoints: 1980 },
	{ name: "GHOST_7",     rankPoints: 1820 },
]

export function getRanking() {
	return (MOCK_RANKING)
}