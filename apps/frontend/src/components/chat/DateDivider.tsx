export interface DateDividerProps {
	isoDate: string
}

function formatDateLabel(isoDate: string): string {
	const d = new Date(`${isoDate}T00:00:00`)
	if (Number.isNaN(d.getTime())) return isoDate
	return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()
}

export function DateDivider({ isoDate }: DateDividerProps) {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-neon-cyan/15" />
			<span className="font-mono text-[10px] tracking-[0.15em] text-white/35">
				{formatDateLabel(isoDate)}
			</span>
			<div className="h-px flex-1 bg-neon-cyan/15" />
		</div>
	)
}