import { WinRateArc } from "./WinRateArc"
import type { UserStats } from "@/lib/types"

type Props = {stats: UserStats}

export function WinRatePanel({ stats }: Props) {
	return (
		<div className="arcade-panel" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '30px', padding: '30px' }}>
			<WinRateArc percent={stats.winRate}/>
			
			{/* 中央: 勝敗の内訳とバー */}
			<div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
				<div>
					<div style={{ fontSize: '14px', color: 'white', marginBottom: '15px' }}>
						BATTLE RECORD
					</div>
					<div style={{ fontSize: '12px', color: '#aaa', lineHeight: '2' }}>
						<span style={{ color: '#4caf50' }}>{stats.wins} W</span> /{" "}
						<span style={{ color: '#f44336' }}>{stats.losses} L</span> / {" "}
						{stats.totalGames} T
					</div>
				</div>
				{/* 勝敗バー */}
				<div>
					<div style={{ display: 'flex', height: '20px', backgroundColor: '#333', border: '2px solid #555' }}>
						<div
							style={{ backgroundColor: '#4caf50', width: `${stats.winRate}%`, transition: 'width 1s ease' }}
						/>
						<div style={{ flex: 1, backgroundColor: '#f44336' }} />
					</div>
				</div>
			</div>

			{/* クイック統計 */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: '1 1 200px' }}>
				{[
					{ label: "RANK",    value: stats.rank,             cls: "#3498db" },
					{ label: "STREAK",  value: stats.currentWinStreak, cls: "#9b59b6" },
					{ label: "AVG APM", value: stats.avgApm,           cls: "#e67e22" },
				].map((s) => (
					<div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', backgroundColor: '#111', border: '2px solid #333' }}>
						<span style={{ fontSize: '10px', color: '#888' }}>{s.label}</span>
						<span style={{ fontSize: '16px', color: s.cls }}>{s.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}