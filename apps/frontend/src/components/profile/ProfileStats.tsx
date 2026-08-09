import { Card } from "@/components/ui/card"
/* モック用データ */
import { getUserStats } from "@/lib/mock"

export function ProfileStats() {
	/* TODO: モックデータの取得 DBからの取得に切り替える */
	const stats = getUserStats();

	return (
		<Card className="rounded-none p-5 ring-neon-cyan/30">
			<div className="mb-3 flex items-center gap-2">
				<span className="h-3.5 w-[3px] shrink-0 bg-neon-cyan shadow-glow-cyan" />
				<span className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">
					STATS
				</span>
			</div>
			<div className="flex flex-col gap-2.5">
				{/* TODO: DBに応じて書き換える */}
				{([
					{ label: "GAMES",       value: stats.totalGames,    color: "text-neon-cyan" },
					{ label: "WINS",        value: stats.wins,          color: "text-neon-green" },
					{ label: "LOSSES",      value: stats.losses,        color: "text-neon-red" },
					{ label: "WIN RATE",    value: `${stats.winRate}%`, color: "text-neon-magenta" },
					{ label: "BEST APM",    value: stats.bestApm,       color: "text-neon-purple" },
					{ label: "BEST STREAK", value: stats.bestWinStreak, color: "text-neon-cyan" },
				] as const).map((s) => (
					<div
						key={s.label}
						className="flex items-center justify-between border-b border-white/5 pb-2 last:border-b-0"
					>
						<span className="text-sm text-white/55">{s.label}</span>
						<span className={`text-sm font-black ${s.color}`}>{s.value}</span>
					</div>
				))}
			</div>
		</Card>
	)
}