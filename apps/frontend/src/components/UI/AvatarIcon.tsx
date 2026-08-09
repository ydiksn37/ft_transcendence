import { cn } from "@/lib/utils"

export interface AvatarIconProps extends React.HTMLAttributes<HTMLDivElement> {
	color: string
	symbol?: string
	photo?: string | null
	size?: number
}

export function AvatarIcon({ color, symbol, photo, size = 40, className, style, ...props }: AvatarIconProps) {
	return (
		<div
			className={cn(
				"inline-flex shrink-0 items-center justify-center overflow-hidden border-2",
				className,
			)}
			style={{
				width: size,
				height: size,
				borderColor: color,
				backgroundColor: `${color}18`,
				boxShadow: `0 0 10px ${color}40`,
				...style,
			}}
			{...props}	
		>
			{photo ? (
				<img src={photo} alt="avatar" className="h-full w-full object-cover" />
			) : (
				<span style={{color: color, fontSize: size * 0.38, textShadow: `0 0 6px ${color}`}}>
					{symbol}
				</span>
			)}

		</div>
	)
}