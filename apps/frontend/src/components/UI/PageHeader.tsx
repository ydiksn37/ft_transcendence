import type { ReactNode } from "react"

type Props = {
	title: string
	subtitle?: string
	children?: ReactNode
}

export function PageHeader({ title, subtitle, children }: Props) {
	return (
		<div className="mb-9 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 className="text-3xl font-black tracking-[0.05em]">{title}</h1>
				{subtitle && (
					<p className="mt-1.5 text-sm tracking-[0.06em] text-white/45">{subtitle}</p>
				)}
			</div>
			{children && <div className="flex gap-2.5">{children}</div>}
		</div>
	)
}