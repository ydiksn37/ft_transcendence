import type { Friend } from "@/lib/types"

import { FriendRow } from "./FriendRow"

export interface FriendListProps {
	friends: Friend[]
	onSelect: (friend: Friend) => void
}

export function FriendList({ friends, onSelect }: FriendListProps) {
	const onlines = friends.filter((f) => f.isOnline);
	const offlines = friends.filter((f) => !f.isOnline);

	return (
		<div>
			{friends.length === 0 && (
				<div className="mt-12 text-center font-mono text-sm text-muted-foreground">
					NO RESULTS
				</div>
			)}
			{onlines.length > 0 && (
				<>
					<div className="mb-2.5 font-orbitron text-[10px] tracking-[0.3em] text-neon-green">
						ONLINE - {onlines.length}
					</div>
					<div className="mb-5 flex flex-col gap-2">
						{onlines.map((f) => <FriendRow key={f.id} friend={f} onSelect={() => onSelect(f)}/>)}
					</div>
				</>
			)}

			{offlines.length > 0 && (
				<>
					<div className="mb-2.5 font-orbitron text-[10px] tracking-[0.3em] text-neon-green">
						OFFLINE - {offlines.length}
					</div>
					<div className="flex flex-col gap-2">
						{offlines.map((f) => <FriendRow key={f.id} friend={f} onSelect={() => onSelect(f)} />)}
					</div>
				</>
			)}
		</div>
	)
}