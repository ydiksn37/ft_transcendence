import { cn } from "@/lib/utils"

type NeonColor = "cyan" | "magenta" | "green" | "red" | "purple" 
type NeonVariant = "outline" | "solid" | "ghost"
type NeonSize = "sm" | "md" | "lg"

const colorStyles: Record<NeonVariant, Record<NeonColor, string>> = {
  outline: {
    cyan:    "border-neon-cyan/60 text-neon-cyan hover:border-neon-cyan hover:bg-neon-cyan/10 hover:shadow-glow-cyan",
    magenta: "border-neon-magenta/60 text-neon-magenta hover:border-neon-magenta hover:bg-neon-magenta/10 hover:shadow-glow-magenta",
    green:   "border-neon-green/60 text-neon-green hover:border-neon-green hover:bg-neon-green/10 hover:shadow-glow-green",
    red:     "border-neon-red/60 text-neon-red hover:border-neon-red hover:bg-neon-red/10 hover:shadow-glow-red",
    purple:  "border-neon-purple/60 text-neon-purple hover:border-neon-purple hover:bg-neon-purple/10 hover:shadow-glow-purple",
  },
  solid: {
    cyan:    "border-transparent bg-neon-cyan text-surface hover:shadow-glow-cyan",
    magenta: "border-transparent bg-neon-magenta text-surface hover:shadow-glow-magenta",
    green:   "border-transparent bg-neon-green text-surface hover:shadow-glow-green",
    red:     "border-transparent bg-neon-red text-white hover:shadow-glow-red",
    purple:  "border-transparent bg-neon-purple text-white hover:shadow-glow-purple",
  },
  ghost: {
    cyan:    "border-transparent text-neon-cyan hover:bg-neon-cyan/10",
    magenta: "border-transparent text-neon-magenta hover:bg-neon-magenta/10",
    green:   "border-transparent text-neon-green hover:bg-neon-green/10",
    red:     "border-transparent text-neon-red hover:bg-neon-red/10",
    purple:  "border-transparent text-neon-purple hover:bg-neon-purple/10",
  },
}

const sizes: Record<NeonSize, string> = {
  sm: "h-7 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
}

export interface NeonBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	color?: NeonColor
	variant?: NeonVariant
	size?: NeonSize
}

export function NeonBtn({ 
	color = "cyan",
	variant = "outline",
	size = "md",
	className,
	...props 
}: NeonBtnProps) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
				"rounded-none border font-bold uppercase tracking-[0.18em]",
				"transition-all duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/60",
				"active:scale-[.98]",
				"disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
				colorStyles[variant][color],
				sizes[size],
				className
			)}
			{...props}
		/>
	)
}