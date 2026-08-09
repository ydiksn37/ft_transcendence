import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const ACCENT = {
	cyan:    { text: "text-neon-cyan",    bar: "bg-neon-cyan",    glow: "0 0 20px rgba(0,245,255,.5)",  ring: "ring-neon-cyan/30",    tint: "bg-neon-cyan/[0.025]",    barGlow: "0 0 6px rgba(0,245,255,1)"  },
	green:   { text: "text-neon-green",   bar: "bg-neon-green",   glow: "0 0 20px rgba(57,255,20,.5)",  ring: "ring-neon-green/30",   tint: "bg-neon-green/[0.025]",   barGlow: "0 0 6px rgba(57,255,20,1)"  },
	magenta: { text: "text-neon-magenta", bar: "bg-neon-magenta", glow: "0 0 20px rgba(255,0,170,.5)",  ring: "ring-neon-magenta/30", tint: "bg-neon-magenta/[0.025]", barGlow: "0 0 6px rgba(255,0,170,1)"  },
	purple:  { text: "text-neon-purple",  bar: "bg-neon-purple",  glow: "0 0 20px rgba(191,0,255,.5)",  ring: "ring-neon-purple/30",  tint: "bg-neon-purple/[0.025]",  barGlow: "0 0 6px rgba(191,0,255,1)"  },
} as const;

export type Accent = keyof typeof ACCENT;

type Props = {
	label: string
	value: number | null
	accent: Accent
	sub?: string
}

export function StatCard({ label, value, accent, sub }: Props) {
	const accentStyle = ACCENT[accent];

	return (
		<Card className={`gap-3 rounded-none p-5 ${accentStyle.ring} ${accentStyle.tint}`}>
			<CardHeader className="p-0">
				<div className="flex items-center gap-2">
					<span 
						className={`h-3.5 w-[3px] shrink-0 ${accentStyle.bar}`} 
						style={{boxShadow: accentStyle.barGlow}}
					/>
					<CardTitle className="text-xs font-bold uppercase tracking-[0.08em] text-white/55">
						{label}
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className={`text-4xl font-black leading-none ${accentStyle.text}`} style={{textShadow: accentStyle.glow}}>
					{value}
				</div>
				{sub && <div className="mt-1.5 text-xs text-white/40">{sub}</div>}
			</CardContent>
		</Card>
	)
}