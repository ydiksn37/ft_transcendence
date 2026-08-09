import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"

/* モックデータ用 */
import { getGameHistory, getUserStats } from "@/lib/mock"

import { PageHeader } from "@/components/UI/PageHeader"
import { StatCard } from "@/components/dashboard/StatCard"
import { WinRatePanel } from "@/components/dashboard/WinRatePanel"
import { RecentBattles } from "@/components/dashboard/RecentBattles"
import { GlobalRanking } from "@/components/dashboard/GlobalRanking"

export default function Dashboard() {
	const navigate = useNavigate();
	
	/* モックデータの取得 DB接続時に切り替える */
	const games = getGameHistory();
	const stats = getUserStats();

	return (
		<div className="w-full max-w-[1200px] px-8 py-9 text-white">
			{/* ヘッダー */}
			<PageHeader title="DASHBOARD" subtitle={`LAST ${games.length} GAMES`}>
				<Button variant="neon" size="lg" onClick={() => navigate("/game")}>
					▷ SOLO
				</Button>
				<Button variant="neon-magenta" size="lg" onClick={() => navigate("/battle-setup")}>
					X BATTLE
				</Button>
			</PageHeader>
			{/* 統計カード TODO: levelやscoreがDBにない 何表示させるのか */}
			<div className="mb-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
				<StatCard label="Battles" value={stats.totalGames} accent="cyan" />
				<StatCard label="Best APM" value={stats.bestApm} accent="magenta" />
				<StatCard label="Best Streak" value={stats.bestWinStreak} accent="purple" />
				<StatCard label="Wins" value={stats.wins} sub={`${stats.losses} losses`} accent="green" />
			</div>
			{/* 勝率パネル */}
			<WinRatePanel stats={stats} />		

			{/* TODO: dateが折り返している　サイズ感を調整する */}
			<div className="flex flex-wrap items-start gap-4">
				<RecentBattles games={games} />
				<GlobalRanking />
			</div>
		</div>
	)
}