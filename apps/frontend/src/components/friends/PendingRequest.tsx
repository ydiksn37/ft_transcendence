import { Check, X } from "lucide-react"

import { Card } from "@/components/ui/card"
import { getAvatarPreset } from "@/lib/avatarPresets"
import { avatarIdFromUserId } from "@/lib/mock"

/* DBに応じて書き換える */
import type { PendingRequest } from "@/lib/types"
import { AvatarIcon } from "../UI/AvatarIcon"

export interface PendingRequestProps {
	requests: PendingRequest[]
}

function PendingRow({ request }: { request: PendingRequest}) {
	/* TODO: presetの取得をどうするか */
	const preset = getAvatarPreset(avatarIdFromUserId(request.id))

	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex min-w-0 items-center gap-2.5"	>
				<AvatarIcon
					color={preset.color}
					symbol={preset.symbol}
					photo={request.avatarUrl}
					size={32}
				/>
				<span className="truncate font-mono text-xs text-white/70">
					{request.displayName}
				</span>
			</div>

			<div className="flex shrink-0 gap-1.5">
				{/* TODO: onClick書き換える */}
				<button
					onClick={() => console.log("accent", request.friendshipId)}
					aria-label={`${request.displayName}の申請を承認`}
					className="border border-neon-green/30 px-2 py-1 text-neon-green/70 transition-color hover:border-neon-green/60 hover:bg-neon-green/10 hover:text-neon-green"
				>
					<Check size={14} />
				</button>
				<button
					onClick={() => console.log("reject", request.friendshipId)}
					aria-label={`${request.displayName}の申請を拒否`}
					className="border border-neon-red/30 px-2 py-1 text-neon-red/70 transition-colors hover:border-neon-red/60 hover:bg-neon-red/10 hover:text-neon-red"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	)
}

export function PendingRequest({ requests } :PendingRequestProps ) {
	return (
		<Card className="rounded-none p-5 ring-neon-purple/30">
			<div className="mb-3 flex items-center gap-2">
				<span className="h-3.5 w-[3px] shrink-0 bg-neon-purple shadow-glow-purple" />
				<span className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">
					PENDING REQUESTS
				</span>
			</div>

			<div className="flex flex-col gap-3">
				{requests.map((r) => (
					<PendingRow key={r.friendshipId} request={r} />
				))}
			</div>
		</Card>
	)
}