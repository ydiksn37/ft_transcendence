type Props = {
	label: string
	value: number | null
	sub?: string
}

export function StatCard({ label, value, sub }: Props) {
	return (
		<div className="arcade-panel" style={{ gap: '15px', alignItems: 'center', justifyContent: 'center' }}>
			<span style={{ fontSize: '10px', color: '#ccc', textAlign: 'center' }}>
				{label}
			</span>
			<div>
				<div style={{ fontSize: '24px', color: 'white', textAlign: 'center' }}>
					{value}
				</div>
				{sub && <div style={{ marginTop: '10px', fontSize: '10px', color: '#888', textAlign: 'center' }}>{sub}</div>}
			</div>
		</div>
	)
}