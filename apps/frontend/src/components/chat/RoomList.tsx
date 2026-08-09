import { Hash } from "lucide-react";

import type { RoomId, RoomSummary } from "@/lib/types";

import { getAvatarPreset } from "@/lib/avatarPresets";
import { avatarIdFromUserId } from "@/lib/mock";

import { AvatarIcon } from "../UI/AvatarIcon";

export interface RoomListProps {
	summaries: RoomSummary[]
	activeRoomId: RoomId
	onSelect: (roomId: RoomId) => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="px-2 font-orbitron text-[10px] tracking-[0.2em] text-muted-foreground">
			{children}
		</h3>
	)
}

export function RoomList({ summaries, activeRoomId, onSelect}: RoomListProps) {
	const channels = summaries.filter((s) => s.room.type === "GLOBAL");
	const directs = summaries.filter((s) => s.room.type === "DIRECT");

	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
			<section>
				<SectionLabel>CHANNELS</SectionLabel>
				<div className="mt-2 flex flex-col gap-1">
					{channels.map((s) => (
						<RoomItem
							key={s.room.id}
							summary={s}
							isActive={s.room.id === activeRoomId}
							onSelect={() => onSelect(s.room.id)}
						/>
					))}
				</div>
			</section>
					
			<section>
				<SectionLabel>DIRECT MESSAGES</SectionLabel>
				<div className="mt-2 flex flex-col gap-1">
					{directs.length === 0 ? (
						<p className="px-2 py-3 font-mono text-[11px] text-muted-foreground">
							まだDMがありません
						</p>
					): (
						directs.map((s) => (
							<RoomItem
								key={s.room.id}
								summary={s}
								isActive={s.room.id === activeRoomId}
								onSelect={() => onSelect(s.room.id)}
							/>
						))
					)}
				</div>
			</section>
		</div>
	)
}

interface RoomItemProps {
	summary: RoomSummary
	isActive: boolean
	onSelect: () => void
}

function RoomItem({ summary, isActive, onSelect }: RoomItemProps) {
	const { room, unread } = summary;
	const {peer, title} = room

	{/* TODO: アバターのプリセットの取得方法 */}
	return (
		<button
			onClick={onSelect}
			aria-current={isActive ? "true" : undefined}
			className={
				"flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors " +
				(isActive
					? "border-neon-cyan/50 bg-neon-cyan/10"
					: "border-transparent hover:border-neon-cyan/20 hover:bg-neon-cyan/[0.04]")
			}
		>
		{peer ? (
			<span className="relative inline-flex shrink-0">
				<AvatarIcon
					color={getAvatarPreset(avatarIdFromUserId(peer.id)).color}
					symbol={getAvatarPreset(avatarIdFromUserId(peer.id)).symbol}
					photo={peer.avatarUrl}
					size={46}
				/>
				{/* オンライン状態を右下に重ねる
					TODO: WebSocketでリアルタイム更新 */}
				<span
					className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2"
					style={{
						backgroundColor: peer.isOnline ? "#39ff14" : "#6858a0",
						boxShadow: peer.isOnline ? "0 0 6px #39ff14" : "none",
					}}
				/>
			</span>
			) : (
				<span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center text-neon-cyan/70">
					<Hash size={18} />
				</span>
		)}
			<span className="min-w-0 flex-1 truncate font-orbitron text-[11px] tracking-wider text-foreground">
				{title}
			</span>

			{/* 未読バッジ */}
			{unread > 0 && (
				<span
					className="shrink-0 rounded-full px-1.5 py-1 font-mono text-[10px] leading-none text-white"
					style={{ backgroundColor: "#ff2e88", boxShadow: "0 0 8px #ff2e88" }}
				>
					{unread}
				</span>
			)}
		</button>
	)
}