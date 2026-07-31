import { getAvatarPreset } from "@/lib/avatarPresets";
import { avatarIdFromUserId } from "@/lib/mock"
import { AvatarIcon } from "../UI/AvatarIcon";

import { UserMinus } from "lucide-react"

import type { Friend } from "@/lib/types";

export interface FriendRowProps {
	friend: Friend
	onSelect: () => void
}

export function FriendRow({ friend, onSelect }: FriendRowProps) {
	/* ### TODO: プリセットの求め方がぶれているね */
	const preset = getAvatarPreset(avatarIdFromUserId(friend.id));

	return (
		<div className="flex items-center gap-3 border border-neon-cyan/20 bg-neon-cyan/[0.02] px-4 py-3">
			<button
				onClick={onSelect}
				aria-label={`${friend.displayName}のプロフィールを開く`}
				className="shrink-0"
			>
				<AvatarIcon  
					color={preset.color}
					symbol={preset.symbol}
					photo={friend.avatarUrl}
					size={42}
				/>
			</button>
			<div className="flex-1">
				<div className="flex items-baseline gap-2">
					<div className="font-orbitron text-xs tracking-wider text-foreground">
					{friend.displayName}
					</div>
					<div className="font-mono text-[11px] text-muted-foreground">
						@{friend.username}
					</div>
				</div>

				<div className="mt-1 flex items-center gap-2">
					<span
						className="h-2 w-2 shrink-0 rounded-full"
						style={{
							backgroundColor: friend.isOnline ? "#39ff14" : "#6858a0",
							boxShadow: friend.isOnline ? "0 0 7px #39ff14" : "none",
						}}
					/>
					<span 
						className="font-mono text-xs"
						style={{ color: friend.isOnline ? "#39ff14" : "#9080b8"}}
					>
						{friend.isOnline ? "ONLINE" : "OFFLINE"}
					</span>
				</div>
			</div>
			{/* TODO: onClick書き換える */}
			<button
				onClick={() => console.log("remove", friend.username)}
				aria-label={`${friend.displayName}を削除`}
				className="shrink-0 border border-neon-red/30 px-2 py-1.5 text-neon-red/70 transition-colors hover:border-neon-red/60 hover:bg-neon-red/10 hover:text-neon-red"
			>
				<UserMinus size={14} />
			</button>
		</div>
	)
}