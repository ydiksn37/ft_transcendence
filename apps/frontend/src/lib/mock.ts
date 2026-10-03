
/***************************************************************** */
/* 				DB接続できたら不要の仮データ
/***************************************************************** */

/***************************************************************** */
/* 				自分のユーザーデータのモック
/***************************************************************** */

import type { UserProfile } from "@/lib/types";

/* mockなので固定の仮uuid。DB接続時は GET /me の User.id に置き換わる */
const CURRENT_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/* IDからアバターidを求める */
export function avatarIdFromUserId(userId: string): number {
	let sum = 0;
	for (const ch of userId) 
		sum += ch.charCodeAt(0);
	return (sum % AVATAR_PRESETS.length);
}

export const MOCK_CURRENT_USER: UserProfile = {
	id: CURRENT_USER_ID,
	username: "CYBER_01",                              // UK・ログインID
	displayName: "CYBER_01",                           // 初期は username と同値
	avatarId: avatarIdFromUserId(CURRENT_USER_ID),     // id から導出（編集不可）
	avatarUrl: null,
	bio: "Neon runner. T-spin enjoyer.", 
}

export function getCurrentUser(): UserProfile {
	return (MOCK_CURRENT_USER);
}

/***************************************************************** */
/* 				ゲームデータのモック
/***************************************************************** */

import type { GameRecordView } from "@/lib/types"

export const MOCK_GAMES: GameRecordView[] = [
	{ id: "a1b2c3d4-0001-4000-8000-000000000001", date: "2077-07-18", mode: "ONLINE_1V1", apm: 92.4, pps: 2.31, lines: 62, result: "WIN"  },
	{ id: "a1b2c3d4-0002-4000-8000-000000000002", date: "2077-07-18", mode: "MARATHON",   apm: 85.0, pps: 1.95, lines: 48, result: null   },
	{ id: "a1b2c3d4-0003-4000-8000-000000000003", date: "2077-07-17", mode: "40_LINES",   apm: 110.5, pps: 2.85, lines: 40, result: null   },
	{ id: "a1b2c3d4-0004-4000-8000-000000000004", date: "2077-07-17", mode: "ONLINE_1V1", apm: 65.2, pps: 1.45, lines: 18, result: "LOSE" },
	{ id: "a1b2c3d4-0005-4000-8000-000000000005", date: "2077-07-16", mode: "4_WIDE",     apm: 124.0, pps: 3.10, lines: 22, result: null   },
	{ id: "a1b2c3d4-0006-4000-8000-000000000006", date: "2077-07-16", mode: "ONLINE_1V1", apm: 78.9, pps: 1.88, lines: 44, result: "WIN"  },
	{ id: "a1b2c3d4-0007-4000-8000-000000000007", date: "2077-07-15", mode: "40_LINES",   apm: 105.2, pps: 2.70, lines: 40, result: null   },
	{ id: "a1b2c3d4-0008-4000-8000-000000000008", date: "2077-07-15", mode: "ONLINE_1V1", apm: 55.4, pps: 1.25, lines: 14, result: "LOSE" },
]

export function getGameHistory(): GameRecordView[] {
	return (MOCK_GAMES);
}	

/***************************************************************** */
/* 				ユーザーステータスのモックデータ
/***************************************************************** */

import type { UserStats } from "@/lib/types"
import { AVATAR_PRESETS } from "./avatarPresets";

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

/***************************************************************** */
/* 				Friends情報のモックデータ
/***************************************************************** */

// src/mocks/friends.ts
// Friends 画面の shell 表示用モック。
// API 結線時にこのファイルを差し替える（型はそのまま）。
//   MOCK_FRIENDS          ← GET /friends
//   MOCK_PENDING_REQUESTS ← GET /friends/requests
//   MOCK_PROFILES         ← GET /users/:id
//
// avatarUrl が null の人を半数ほど混ぜてある。
// → 写真なし時の記号フォールバック（id から算出）の見た目確認用。

import type { Friend, PendingRequest, PlayerProfile } from "@/lib/types";

/* 顔写真（Unsplash） */
const PHOTO = {
  neon:  "https://images.unsplash.com/flagged/photo-1579451442952-f0365f3f0aed?w=200&h=200&fit=crop&crop=faces",
  grid:  "https://images.unsplash.com/flagged/photo-1579451443170-44b3963c3341?w=200&h=200&fit=crop&crop=faces",
  ghost: "https://images.unsplash.com/photo-1734656913620-7dc20c2fc2ac?w=200&h=200&fit=crop&crop=faces",
  byte:  "https://images.unsplash.com/photo-1675726205553-4e348f24da2c?w=200&h=200&fit=crop&crop=faces",
} as const;

/* User.id 相当。uuid の形にしておく（本番と形を揃える）。
   記号フォールバックは id から算出するので、id が違えば別の記号/色になる。 */
export const MOCK_USER_IDS = {
  neon:   "11111111-1111-4111-8111-111111111111",
  grid:   "22222222-2222-4222-8222-222222222222",
  volt:   "33333333-3333-4333-8333-333333333333",
  ghost:  "44444444-4444-4444-8444-444444444444",
  pixel:  "55555555-5555-4555-8555-555555555555",
  sync:   "66666666-6666-4666-8666-666666666666",
  byte:   "77777777-7777-4777-8777-777777777777",
  zeta:   "88888888-8888-4888-8888-888888888888",
  quanta: "99999999-9999-4999-8999-999999999999",
} as const;

/** フレンド一覧（Friendship.status = ACCEPTED）。online/offline は画面側で振り分ける。 */
export const MOCK_FRIENDS: Friend[] = [
  // ── online ──
  {
    id: MOCK_USER_IDS.neon,
    username: "neon_ace",
    displayName: "NEON_ACE",
    avatarUrl: PHOTO.neon,
    isOnline: true,
  },
  {
    id: MOCK_USER_IDS.grid,
    username: "grid_reaper",
    displayName: "GRID_REAPER",
    avatarUrl: PHOTO.grid,
    isOnline: true,
  },
  {
    id: MOCK_USER_IDS.zeta,
    username: "zeta_flux",
    displayName: "ZETA_FLUX",
    avatarUrl: null, // ← 写真なし
    isOnline: true,
  },
  {
    id: MOCK_USER_IDS.ghost,
    username: "ghost_7",
    displayName: "GHOST_7",
    avatarUrl: PHOTO.ghost,
    isOnline: true,
  },
  {
    id: MOCK_USER_IDS.quanta,
    username: "quanta_9",
    displayName: "QUANTA_9",
    avatarUrl: null, // ← 写真なし
    isOnline: true,
  },
  // ── offline ──
  {
    id: MOCK_USER_IDS.volt,
    username: "volt_hand",
    displayName: "VOLT_HAND",
    avatarUrl: null, // ← 写真なし
    isOnline: false,
  },
  {
    id: MOCK_USER_IDS.pixel,
    username: "pixel_zero",
    displayName: "PIXEL_ZERO",
    avatarUrl: null, // ← 写真なし
    isOnline: false,
  },
];

/** 自分宛の承認待ち申請（Friendship.status = PENDING, addresseeId = 自分）。 */
export const MOCK_PENDING_REQUESTS: PendingRequest[] = [
  {
    friendshipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    id: MOCK_USER_IDS.sync,
    username: "sync_01",
    displayName: "SYNC_01",
    avatarUrl: null, // ← 写真なし
    isOnline: false,
  },
  {
    friendshipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    id: MOCK_USER_IDS.byte,
    username: "byte_run",
    displayName: "BYTE_RUN",
    avatarUrl: PHOTO.byte,
    isOnline: true,
  },
];

/**
 * プロフィールモーダル用（GET /users/:id の代用）。
 * API の戻り値と同じ形にしてある。引くときは:
 *   const profile = MOCK_PROFILES.find(p => p.id === userId);
 */
export const MOCK_PROFILES: PlayerProfile[] = [
  {
    id: MOCK_USER_IDS.neon,
    username: "neon_ace",
    displayName: "NEON_ACE",
    avatarUrl: PHOTO.neon,
    isOnline: true,
    bio: "T-spin ばかり狙う。1v1 いつでも歓迎。",
    stats: { rank: "DIAMOND", wins: 132, level: 14 },
  },
  {
    id: MOCK_USER_IDS.grid,
    username: "grid_reaper",
    displayName: "GRID_REAPER",
    avatarUrl: PHOTO.grid,
    isOnline: true,
    bio: "Hold + rotate が全て。",
    stats: { rank: "PLATINUM", wins: 88, level: 11 },
  },
  {
    id: MOCK_USER_IDS.zeta,
    username: "zeta_flux",
    displayName: "ZETA_FLUX",
    avatarUrl: null,
    isOnline: true,
    bio: "写真は設定してない。",
    stats: { rank: "GOLD", wins: 63, level: 10 },
  },
  {
    id: MOCK_USER_IDS.ghost,
    username: "ghost_7",
    displayName: "GHOST_7",
    avatarUrl: PHOTO.ghost,
    isOnline: true,
    bio: "Lv12 で自己ベスト更新中。",
    stats: { rank: "PLATINUM", wins: 71, level: 12 },
  },
  {
    id: MOCK_USER_IDS.quanta,
    username: "quanta_9",
    displayName: "QUANTA_9",
    avatarUrl: null,
    isOnline: true,
    bio: "",
    stats: { rank: "SILVER", wins: 15, level: 5 },
  },
  {
    id: MOCK_USER_IDS.volt,
    username: "volt_hand",
    displayName: "VOLT_HAND",
    avatarUrl: null,
    isOnline: false,
    bio: "夜勤明けにだけ現れる。",
    stats: { rank: "GOLD", wins: 54, level: 9 },
  },
  {
    id: MOCK_USER_IDS.pixel,
    username: "pixel_zero",
    displayName: "PIXEL_ZERO",
    avatarUrl: null,
    isOnline: false,
    bio: "初心者。tips 募集中。",
    stats: { rank: "BRONZE", wins: 20, level: 6 },
  },
  {
    id: MOCK_USER_IDS.sync,
    username: "sync_01",
    displayName: "SYNC_01",
    avatarUrl: null,
    isOnline: false,
    bio: "はじめました。よろしく。",
    stats: { rank: "SILVER", wins: 8, level: 3 },
  },
  {
    id: MOCK_USER_IDS.byte,
    username: "byte_run",
    displayName: "BYTE_RUN",
    avatarUrl: PHOTO.byte,
    isOnline: true,
    bio: "40 lines 専。",
    stats: { rank: "MASTER", wins: 210, level: 18 },
  },
];

export function getFriends(): Friend[] {
	return (MOCK_FRIENDS);
}

export function getPendingRequests(): PendingRequest[] {
	return (MOCK_PENDING_REQUESTS);
}

export function getProfile(userId: string): PlayerProfile | undefined {
	return (MOCK_PROFILES.find((p) => p.id === userId));
} 



/***************************************************************** */
/* 				チャットのモックデータ
/***************************************************************** */

import type { ChatMessage, RoomId, PlayerSummary, ChatRoom } from "@/lib/types";

export const GLOBAL_ROOM_ID: RoomId = "room-global"

const DM_ROOM_IDS = {
	neon: "room-dm-0001",
	grid: "room-dm-0002",
} as const

/** MOCK_FRIENDS から id で1人取り出して sender にする。IDを取得する */
function senderById(id: string): PlayerSummary {
	const f = MOCK_FRIENDS.find((x) => x.id === id)
	if (!f) throw new Error(`mock: sender not found: ${id}`)
	return f
}

/* ISO で保持し、表示は描画側で整形。 */
const gAt = (h: number, m: number) =>
	`2025-07-18T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`


/* ── ルーム一覧 ────────────────────────────────────────────
   「Membership を自分で絞って ChatRoom を JOIN し、DIRECT なら相手を詰めた結果」
   ＝ サーバが返してくるはずの形を手で書いたもの。
   DMは会話が始まっている部屋だけ存在する（全フレンド分は作らない）。
   TODO: GET /rooms に置き換える */
export const MOCK_ROOMS: ChatRoom[] = [
	{ id: GLOBAL_ROOM_ID, type: "GLOBAL", title: "global" },
	{
		id: DM_ROOM_IDS.neon,
		type: "DIRECT",
    title: senderById(MOCK_USER_IDS.neon).displayName,
		peer: senderById(MOCK_USER_IDS.neon),
	},
	{
		id: DM_ROOM_IDS.grid,
		type: "DIRECT",
    title: senderById(MOCK_USER_IDS.grid).displayName,
		peer: senderById(MOCK_USER_IDS.grid),
	},
]

export const MOCK_MESSAGES: ChatMessage[] = [
	// ── グローバル ──
	{ id: "gmsg-0001", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.pixel), content: "Any tips for clearing T-spins?", createdAt: gAt(23, 25) },
	{ id: "gmsg-0002", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.grid),  content: "Hold piece + rotate is the key", createdAt: gAt(23, 27) },
	{ id: "gmsg-0003", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.volt),  content: "Level 10+ is brutal fr",        createdAt: gAt(23, 33) },
	{ id: "gmsg-0004", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.ghost), content: "Just hit level 12, new record", createdAt: gAt(23, 36) },
	{ id: "gmsg-0005", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.grid),  content: "Anyone down for a 1v1?",        createdAt: gAt(23, 38) },
	{ id: "gmsg-0006", roomId: GLOBAL_ROOM_ID, sender: senderById(MOCK_USER_IDS.neon),  content: "GG last match everyone!",       createdAt: gAt(23, 41) },

	// ── DM: 自分 × NEON_ACE ──
	{ id: "dmsg-0001", roomId: DM_ROOM_IDS.neon, sender: senderById(MOCK_USER_IDS.neon), content: "Ready for a rematch?",         createdAt: gAt(23, 50) },
	{ id: "dmsg-0002", roomId: DM_ROOM_IDS.neon, sender: senderById(MOCK_USER_IDS.neon), content: "I've been practicing all day", createdAt: gAt(23, 51) },

	// ── DM: 自分 × GRID_REAPER ──
	{ id: "dmsg-0003", roomId: DM_ROOM_IDS.grid, sender: senderById(MOCK_USER_IDS.grid), content: "Hey what's your high score?", createdAt: gAt(23, 55) },
]

export function getMessagesByRoom(roomId: RoomId): ChatMessage[] {
  return (
    MOCK_MESSAGES.filter((m) => m.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
}

export function getGlobalMessages(): ChatMessage[] {
  return (getMessagesByRoom(GLOBAL_ROOM_ID));
}

// 自分が参加しているルーム一覧
export function getRooms(): ChatRoom[] {
  return (MOCK_ROOMS);
}

export function getRoom(roomId: RoomId): ChatRoom | undefined {
  return (MOCK_ROOMS.find((r) => r.id === roomId));
}

export function findDirectRoomByPeerId(peerId: string): ChatRoom | undefined {
	return (MOCK_ROOMS.find((r) => r.type === "DIRECT" && r.peer?.id === peerId))
}

export function findOrCreateDirectRoom(peer: PlayerSummary): ChatRoom {
	const existing = findDirectRoomByPeerId(peer.id)
	if (existing)
		return (existing)

	const room: ChatRoom = {
		id: crypto.randomUUID(),        // 本番はサーバ採番
		type: "DIRECT",
    title: peer.displayName,
		peer,
		}
	MOCK_ROOMS.push(room)
	return (room)
}

/* メッセージを送信。mockでは MOCK_MESSAGES に push するだけ。
   TODO: POST /rooms/:roomId/messages に置き換える */
export function sendMessage(roomId: RoomId, sender: PlayerSummary, content: string): ChatMessage {
	const msg: ChatMessage = {
		id: crypto.randomUUID(),
		roomId,
		sender,
		content,
		createdAt: new Date().toISOString(),
	}
	MOCK_MESSAGES.push(msg)
	return (msg)
}
