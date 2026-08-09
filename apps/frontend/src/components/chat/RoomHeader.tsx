import { getAvatarPreset } from "@/lib/avatarPresets";
import { avatarIdFromUserId } from "@/lib/mock";
import type { ChatRoom } from "@/lib/types";
import { Hash } from "lucide-react";
import { AvatarIcon } from "../UI/AvatarIcon";

export interface RoomHeaderProps {
	room: ChatRoom
}

export function RoomHeader({ room }: RoomHeaderProps) {
	const peer = room.peer;
	// TODO: アバタープリセットの取得方法
	


	{/* TODO: GLOBAL以外のチャンネル対応 */}
	return (
		<header className="flex shrink-0 items-center gap-3 border-b border-neon-cyan/15 bg-surface-2/60 px-6 py-4">
			{peer ? (
				<AvatarIcon
					color={getAvatarPreset(avatarIdFromUserId(peer.id)).color}
					symbol={getAvatarPreset(avatarIdFromUserId(peer.id)).symbol}
					photo={peer.avatarUrl}
					size={36}
				/>
			) : (
				<div className="flex h-9 w-9 items-center justify-center border border-neon-cyan/40 bg-neon-cyan/[0.06]">
					<Hash size={16} className="text-neon-cyan" />
				</div>
			)}

			<div className="min-w-0">
				<div className="font-orbitron text-sm tracking-[0.1em]">
					{room.title}
				</div>

				{/* TODO: グローバルは N online に差し替え */}
				<div className="font-mono text-[11px] text-white/40">
					{peer ? (peer.isOnline ? "ONLINE" : "OFFLINE") : "GLOBAL CHANNEL"}
				</div>
			</div>
		</header>
	)
}