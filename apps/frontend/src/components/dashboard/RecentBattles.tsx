import type { GameRecordView } from "@/lib/types"

type Props = { games: GameRecordView[] };

const MODE_STYLE: Record<string, string> = {
	ONLINE_1V1: "#e74c3c",
	MARATHON:   "#4caf50",
	"40_LINES": "#ff9800",
	"4_WIDE":   "#3498db",
}

export function RecentBattles({ games }: Props) {
	const recent = [...games].sort((a, b) => b.date.localeCompare(a.date));

	return (
		<div className="arcade-panel" style={{ padding: '0' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px', borderBottom: '4px solid #444', backgroundColor: '#111' }}>
				<span style={{ fontSize: '14px', color: 'white' }}>
					BATTLE HISTORY
				</span>
				<span style={{ fontSize: '10px', color: '#888' }}>{games.length} games</span>
			</div>

			<div style={{ overflowX: 'auto', padding: '20px' }}>
				<table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '10px' }}>
					<thead>
						<tr>
							{["MODE", "APM", "PPS", "LINES", "DATE", "RESULT"].map((h) => (
								<th key={h} style={{ padding: '10px', color: '#888', borderBottom: '2px solid #444' }}>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{recent.length === 0 && (
							<tr>
								<td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No recent battles</td>
							</tr>
						)}
						{recent.map((g, i) => (
							<tr key={g.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
								<td style={{ padding: '15px 10px', borderBottom: '2px solid #333' }}>
									<span style={{ color: MODE_STYLE[g.mode] }}>
										{g.mode}
									</span>
								</td>
								<td style={{ padding: '15px 10px', color: 'white', borderBottom: '2px solid #333' }}>{g.apm.toFixed(1)}</td>
								<td style={{ padding: '15px 10px', color: '#ccc', borderBottom: '2px solid #333' }}>{g.pps.toFixed(2)}</td>
								<td style={{ padding: '15px 10px', color: '#ccc', borderBottom: '2px solid #333' }}>{g.lines}</td>
								<td style={{ padding: '15px 10px', color: '#888', borderBottom: '2px solid #333' }}>{g.date}</td>
								<td style={{ padding: '15px 10px', borderBottom: '2px solid #333' }}>
									{g.result === null ? (
										<span style={{ color: '#555' }}> - </span>
									) : (
										<span style={{ color: g.result === "WIN" ? "#4caf50" : "#f44336" }}>
											{g.result}
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}