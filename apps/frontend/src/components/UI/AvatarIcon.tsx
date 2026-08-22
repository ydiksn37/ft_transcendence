export interface AvatarIconProps extends React.HTMLAttributes<HTMLDivElement> {
	color: string
	symbol?: string
	photo?: string | null
	size?: number
}

export function AvatarIcon({ color, symbol, photo, size = 40, style, ...props }: AvatarIconProps) {
	return (
		<div
			style={{
				display: 'inline-flex',
				flexShrink: 0,
				alignItems: 'center',
				justifyContent: 'center',
				overflow: 'hidden',
				border: '2px solid',
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
				<img src={photo} alt="avatar" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
			) : (
				<span style={{color: color, fontSize: size * 0.38, textShadow: `0 0 6px ${color}`}}>
					{symbol}
				</span>
			)}
		</div>
	)
}