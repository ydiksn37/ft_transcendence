type Props = {
	percent: number,
	size?: number,
	color?: string;
}

export function WinRateArc({
	percent,
	size = 140,
	color = "#4caf50",
}: Props) {
	const stroke = 16; 		/* 線の太さ */
	const c = size / 2;		/* 中心座標 */
	const r = size / 2 - stroke - 4; /* 半径 */
	const circ = 2 * Math.PI * r; /* 円周の長さ */
	const p = Math.max(0, Math.min(100, Math.round(percent))); /* 0 - 100に収めた% */
	const filled = circ * (p / 100); /* 塗る長さ */

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			style={{overflow: "visible"}}>
				{/* 下に敷く円 */}
				<circle
					cx={c} cy={c} r={r}
					fill="none"
					stroke="#333"
					strokeWidth={stroke}
				/>
				{/* 円弧 実際の勝率分 */}
				<circle 
					cx={c} cy={c} r={r}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeDasharray={`${filled} ${circ - filled}`}
					transform={`rotate(-90 ${c} ${c})`}
					style={{
						transition: "stroke-dasharray 1s ease",
					}}
				/>
				{/* 中央の% */}
				<text
					x={c} y={c - 4}
					textAnchor="middle"
					dominantBaseline="middle"
					style={{
						fontSize: 24,
						fill: "white",
					}}
				>
					{p}%
				</text>
				{/* ラベル */}
				<text
					x={c} y={c + 32}
					textAnchor="middle"
					dominantBaseline="middle"
					style={{
						fontSize: 10,
						fill: "#888",
					}}
				>
					WIN RATE
				</text>
		</svg>
	)
}