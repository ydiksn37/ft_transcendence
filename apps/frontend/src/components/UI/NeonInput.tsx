import { cn } from "@/lib/utils"

export interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function NeonInput({ className, ...props }: NeonInputProps) {
	return (
		<input 
			className={cn(
				"w-full rounded-none border border-white/10 bg-surface-2/60 px-4 py-2.5 text-white placeholder:text-white/40",
				"transition-[box-shadow,border-color] duration-150 focus:outline-none",
				"focus:border-neon-cyan focus:shadow-glow-cyan",
				className
			)}
			{...props}
		/>
	)
}