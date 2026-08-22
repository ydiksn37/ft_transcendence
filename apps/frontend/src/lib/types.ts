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
	apm: number;
 	pps: number;
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

/***************************************************************** */
/* 				Friends情報の型
				user table + friendship table
/***************************************************************** */

export interface PlayerSummary {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	isOnline: boolean;
}

export interface Friend extends PlayerSummary {}

export interface PendingRequest extends PlayerSummary {
	friendshipId: string;
}

export type PlayerStats = Pick<UserStats, "rank" | "wins" | "level">;

export interface PlayerProfile extends PlayerSummary {
	bio: string;
	stats: PlayerStats;
}


/***************************************************************** */
/* 				チャットの型
				ChatMessage
/***************************************************************** */

export type RoomId = string;

export interface ChatMessage {
	id: string;              // uuid
	roomId: RoomId;          // ER.md: ChatMessage.roomId
	sender: PlayerSummary;   // 送信者（既存の共有型を再利用）
	content: string;         // ER.md: ChatMessage.content
	createdAt: string;       // ISO 8601。表示は描画時に HH:mm 整形
}

/***************************************************************** */
/* 				チャットルームの型
				ChatRoom + ChatRoomMembership
/***************************************************************** */

export type RoomType = "GLOBAL" | "DIRECT";

export interface ChatRoom {
	id: RoomId;
	/* ER.md: ChatRoom.type */
	type: RoomType;
	/* 表示名。DIRECT は相手の displayName、それ以外は ChatRoom.name。
	   ※ DIRECT は見る人によって変わるので DB の name には入らない */
	title: string;
	/* DIRECT のときの相手。
	   ChatRoomMembership で「自分以外の参加者」を引き、User から詰めた結果。
	   GLOBAL は参加者が多数で1人に決まらないので undefined */
	peer?: PlayerSummary;
	/* ER.md: ChatRoomMembership.lastReadAt (TIMESTAMP NULL) の自分の行。
	   null = 一度も開いていない部屋（＝他人の発言が全部未読）。
	   未読数は保持せず、これと ChatMessage.createdAt の比較で毎回算出する */
	lastReadAt: string | null;
}

/* RoomList 表示用。ChatRoom に算出した未読数を載せた派生モデル */
export interface RoomSummary {
	room: ChatRoom;
	unread: number;
}