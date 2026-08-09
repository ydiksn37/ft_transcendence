import { Card } from "@/components/ui/card"

import type { GameRecordView } from "@/lib/types"

type Props = { games: GameRecordView[] };

/* TODO: モード確定したらこれも修正する */
const MODE_STYLE: Record<string, string> = {
	ONLINE_1V1: "text-neon-magenta ring-neon-magenta/30",
	MARATHON:   "text-neon-cyan ring-neon-cyan/30",
	"40_LINES": "text-neon-green ring-neon-green/30",
	"4_WIDE":   "text-neon-purple ring-neon-purple/30",
}

export function RecentBattles({ games }: Props) {
	const recent = [...games].sort((a, b) => b.date.localeCompare(a.date));

	return (
		<Card className="min-w-0 overflow-hidden rounded-none p-0 ring-neon-cyan/30 [flex:1_1_480px]">
			<div className="flex items-center gap-3 px-5 py-3.5 ring-1 ring-white/10">
				<span className="text-sm font-bold uppercase tracking-[0.25em] text-neon-cyan">
					RECENT BATTLES
				</span>
				<span className="text-xs text-white/40">{games.length} games</span>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="bg-neon-cyan[0.03]">
							{["MODE", "SCORE", "LV", "LINES", "DATE", "RESULT"].map((h) => (
								<th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{recent.map((g, i) => (
							<tr key={g.id} className={i % 2 ? "bg-white/[0.03]" : ""}>
								<td className="px-4 py-3">
									<span className={`px-1.5 py-0.5 text-xs font-bold tracking-[0.1em] ${MODE_STYLE[g.mode]}`}>
										{g.mode}
									</span>
								</td>
								{/* TODO: データベースに応じて書き換える */}
								<td className="px-4 py-3 text-sm font-bold text-white/90">{g.score.toLocaleString()}</td>
								<td className="px-4 py-3 text-sm text-white/60">{g.level}</td>
								<td className="px-4 py-3 text-sm text-white/60">{g.lines}</td>
								<td className="px-4 py-3 text-xs text-white/45">{g.date}</td>
								<td className="px-4 py-3">
									{g.result === null ? (
										<span className="text-xs text-white/70"> - </span>
									) : (
										<span 
											className={`text-xs font-bold tracking-[0.12em] ${
												g.result === "WIN" ? "text-neon-green" : "text-neon-red"
											}`}
											style={{
												textShadow: `0 0 10px ${g.result === "WIN" ? "rgba(57,255,20,.6)" : "rgba(255,0,85,.6)"}`
											}}>
											{g.result}
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	)
}