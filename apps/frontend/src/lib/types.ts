/***************************************************************** */
/* 				ページ情報
				DBできたら書き換える　とりあえずの型
/***************************************************************** */

/* サイドバーに並ぶメニュー */
export type NavPage = 
	| "dashboard"
	| "game"
	| "battle-setup" 
	| "chat"
	| "friends"
	| "profile";

/* すべてのページ */
export type Page= "login" | "battle" | NavPage;

/* ユーザー定義  自分の型 */
export interface UserProfile {
	id: string
	username: string
	displayName: string
	avatarId: number // TODO: これ存在しない DBに足すか、毎回idから算出するか
	avatarUrl: string | null
	bio: string
}

/***************************************************************** */
/* 				ゲーム記録 from GameResult
				DBからデータを引っ張ってきて、データをこの形式に変換する
				-> gameStatus.ts
				-> mockGames.ts
/***************************************************************** */

export type GameMode = "MARATHON" | "40_LINES" | "4_WIDE" | "ONLINE_1V1";

export type MatchOutcome = "WIN" | "LOSE";

export interface GameRecordView {
	id: string; // uuid
	date: string; // createdAt
	mode: GameMode;
	score: number; // TODO: これDBに記録ないので確認
 	level: number;  // TODO: これDBに記録ないので確認
	result: MatchOutcome | null; // TODO: SOLOも記録するならnullが入る
	lines: number;
}

/***************************************************************** */
/* 				ユーザー統計 from  UserStats
/***************************************************************** */

export type Rank = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND" | "MASTER";

export interface UserStats {
	/* TODO: 現状バトルのみ　ソロプレイは含まれていない */
	wins: number;
	losses: number;
	totalGames: number;
	winRate: number;

		/* 速度指標 */
	bestApm: number;
	avgApm: number;
	bestPps: number;
	avgPps: number;

	/* 累計 */
	totalLinesCleared: number;
	totalTSpins: number;
	totalTetrises: number;

	/* 連勝 */
	currentWinStreak: number;
	bestWinStreak: number;

	/* ランク */
	xp: number;
	level: number;
	rank: Rank;
	rankPoints: number;



}