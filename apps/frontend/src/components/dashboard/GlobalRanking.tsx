import { Card } from "@/components/ui/card"

import { getRanking } from "@/lib/mock"

const MEDALS = ["🥇", "🥈", "🥉"];

export function GlobalRanking() {
	const rank = getRanking();

	return (
		<Card className="min-w-0 overflow-hidden rounded-none p-0 ring-neon-green/30 [flex:1_1_480px]">	
			<div className="flex items-center justify-between px-6 py-4 ring-1 ring-white/10">
				<span className="text-sm font-bold uppercase tracking-[0.25em] text-neon-green">
					GLOBAL RANKING
				</span>
				<span className="text-xs text-white/40">top 5</span>
			</div>
			<table className="w-full border-collapse text-left">
				<thead>
					<tr className="bg-neon-green/[0.03]">
						{["#", "PLAYER", "SCORE"].map((h) => (
							<th id={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50 ${h === "#" ? "text-center" : ""}`}>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rank.map((r, i) => (
						<tr key={r.name}>
							<td className="px-4 py-3.5 text-center text-base">
								{MEDALS[i] ?? <span className="text-white/40">#{i + 1}</span>}
							</td>
							<td className="px-4 py-3.5 text-sm text-white/80">{r.name}</td>
								<td className={`px-4 py-3.5 text-sm font-bold ${i < 3 ? "text-white" : "text-white/50"}`}>
								{r.rankPoints.toLocaleString()}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Card>
	)
}