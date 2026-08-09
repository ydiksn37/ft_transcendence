import { Card } from "@/components/ui/card"

/* モック用 */
import type { UserProfile } from "@/lib/types"
import { getAvatarPreset } from "@/lib/avatarPresets"

import { AvatarIcon } from "../UI/AvatarIcon"

type Props = {
	user: UserProfile
}

export function ProfileCard({ user }: Props) {
	/* ### TODO: dbに応じて書き換える */
	const preset = getAvatarPreset(user.avatarId);

	return (
		<Card className="flex flex-col items-center gap-4 rounded-none p-7 ring-neon-cyan/30">
			{/* アバター*/}
			<AvatarIcon 
				color={preset.color}
				symbol={preset.symbol}
				photo={user.avatarUrl}
				size={96}
			/>

			{/* 名前 */}
			<div className="text-center">
				<div className="text-lg font-black tracking-[0.1em]">
					{user.displayName}
				</div>
				<div className="mt-1 text-xs text-white/40">@{user.username}</div>
					<div className="mt-1.5 flex items-center justify-center gap-1.5">
						<span className="h-1.5 w-1.5 rounded-full bg-neon-green shadow-glow-green" />
						<span className="text-xs text-neon-green">ONLINE</span>
					</div>
				</div>

				{/* BIO */}
				<div className="w-full">
					<div className="mb-2 text-[10px] tracking-[0.3em] text-white/40">BIO</div>
						<p className={`min-h-[46px] text-sm leading-relaxed ${user.bio ? "text-white/70" : "text-white/35"}`}>
							{user.bio || "No bio set."}
						</p>
				</div>
		</Card>
	)
}