import { Card } from "@/components/ui/card"

import { WinRateArc } from "./WinRateArc"
import type { UserStats } from "@/lib/types"

type Props = {stats: UserStats}

export function WinRatePanel({ stats }: Props) {
	return (
		<Card className="mb-7 flex flex-row flex-wrap items-center gap-10 rounded-none p-8 ring-neon-green/30">
			<WinRateArc percent={stats.winRate}/>
			
			{/* 中央: 勝敗の内訳とバー} */}
			<div className="flex min-w-[200px] flex-1 flex-col gap-5">
				<div>
					<div className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-neon-green">
						BATTLE RECORD
					</div>
					<div className="text-sm leading-relaxed text-white/70">
						<span className="font-bold text-neon-green">{stats.wins}</span> WINS ・{" "}
						<span className="text-neon-red">{stats.losses}</span> LOSSES ・ {" "}
						{stats.totalGames} TOTAL
					</div>
				</div>
				{/* 勝敗バー */}
				<div>
					<div className="mb-2 flex justify-between text-sm">
						<span className="text-neon-green">WIN {stats.wins}</span>
						<span className="text-neon-red">LOSSES{stats.losses}</span>
					</div>
					<div className="flex h-3.5 overflow-hidden ring-1 ring-white/10">
						<div
							className="bg-neon-green transition-[width] duration-1000"
							style={{ width: `${stats.winRate}%`}}
						/>
						<div className="flex-1 bg-neon-red/30" />
					</div>
				</div>
			</div>

			{/* クイック統計 TODO: 何表示させるか */}
			<div className="flex min-w-[160px] flex-col gap-3.5">
				{[
					{ label: "RANK",    value: stats.rank,             cls: "text-neon-green" },
					{ label: "STREAK",  value: stats.currentWinStreak, cls: "text-neon-cyan" },
					{ label: "AVG APM", value: stats.avgApm,           cls: "text-neon-magenta" },
				].map((s) => (
					<div key={s.label} className="flex items-center justify-between px-3.5 py-2.5 ring-1 ring-white/10">
						<span className="text-xs uppercase tracking-[0.2em] text-white/45">{s.label}</span>
						<span className={`text-lg font-black ${s.cls}`}>{s.value}</span>
					</div>
				))}
			</div>
		</Card>
	)
}