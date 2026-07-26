import { cn } from "@/lib/utils"

type NeonColor = "cyan" | "magenta" | "purple" | "green";

const glowMap: Record<NeonColor, string> = {
	cyan: "border-neon-cyan/40 shadow-glow-cyan",
	magenta: "border-neon-magenta/40 shadow-glow-magenta",
  	purple:  "border-neon-purple/40 shadow-glow-purple",
  	green:   "border-neon-green/40 shadow-glow-green",
};

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
	glow?: NeonColor
}

export function Panel({ glow, className, ...props }: PanelProps) {
	return (
		<div
			className={cn(
				"rounded-xl border bg-surface-2/70 p-5",
				glow ? glowMap[glow] : "border-white/10",
				className,
			)} {...props} />
	)
}