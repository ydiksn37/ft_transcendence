/***************************************************************** */
/* 				型を定義
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

/* ユーザー定義 */
export interface UserProfile {
	username: string
	avatarId: number
	avatarPhoto: string | null
	bio: string
}