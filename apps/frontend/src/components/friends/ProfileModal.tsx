import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"


import { getAvatarPreset } from "@/lib/avatarPresets"
import { avatarIdFromUserId } from "@/lib/mock"
import type { PlayerProfile } from "@/lib/types"
import { AvatarIcon } from "../UI/AvatarIcon"

export interface ProfileModalProps {
	profile: PlayerProfile
	onClose: () => void
}

export function ProfileModal({ profile, onClose }: ProfileModalProps) {
	/* TODO: プリセットをどう取得するか */
	const preset = getAvatarPreset(avatarIdFromUserId(profile.id))

	return (
		<Dialog open onOpenChange={(open) => {if (!open) onClose()} }>
			<DialogContent className="w-80 rounded-none p-6">
				<DialogHeader>
					<div className="flex items-center gap-4">
						<AvatarIcon
							color={preset.color}
							symbol={preset.symbol}
							photo={profile.avatarUrl}
							size={64}						
						/>
						<div className="min-w-0">
							<DialogTitle className="truncate font-orbitron text-sm tracking-[0.06em]">
								{profile.displayName}
							</DialogTitle>
							<div className="mt-1 truncate font-mono text-[11px] text-white/40">
								@{profile.username}
							</div>

							<div
								className="mt-1 font-mono text-xs"
								style={{ color: profile.isOnline ? "#39ff14" : "#9080b8"}}
							>
								{profile.isOnline ? "ONLINE" : "OFFLINE"}
							</div>
						</div>
					</div>
				</DialogHeader>
				{/* TODO: DBに応じて書き換える */}
				{/* TODO: DIAMONDとかのランキングがスタイルに収まっていない */}
				<div className="mt-4 grid grid-cols-3 border border-white/10">
					{[
						{ label: "RANK",  value: profile.stats.rank,  color: "text-neon-yellow" },
						{ label: "WINS",  value: profile.stats.wins,  color: "text-neon-green" },
						{ label: "LEVEL", value: profile.stats.level, color: "text-neon-purple" },
					].map((s, i) => (
						<div
							key={s.label}
							className={`py-2 text-center ${i < 2 ? "border-r border-white/10" : ""}`}
						>
							<div className={`font-orbitron text-xl font-bold ${s.color}`}>{s.value}</div>
							<div className="mt-0.5 font-mono text-[10px] text-white/40">{s.label}</div>
						</div>
					))}
				</div>

				{profile.bio && (
					<p className="mt-4 border-l-2 border-neon-cyan/40 pl-3 font-mono text-xs leading-relaxed text-white/60">
						{profile.bio}
					</p>
				)}

			</DialogContent>
		</Dialog>
	)
}