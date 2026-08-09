import { Outlet, NavLink } from "react-router-dom"

import { AvatarIcon } from "@/components/UI/AvatarIcon"
import type { NavPage } from "@/lib/types"
import { getAvatarPreset } from "@/lib/avatarPresets"

const NAV: {id: NavPage; label: string}[] = [
	{id: "dashboard", label: "DASHBOARD"},
	{id: "game", label: "SOLO GAME"},
	{id: "battle-setup", label: "BATTLE"},
	{id: "chat", label: "CHAT"},
	{id: "friends", label: "FRIENDS"},
	{id: "profile", label: "PROFILE"},
]


import { useAuth } from "../hooks/useAuth"

export function AppShell() {
	const { user } = useAuth();
	// TODO: DBからデータを取得するように書き換える
	// 印象は後回しにする。現在は仮の適当な値を取得
	const preset = getAvatarPreset(0);
	const username = user?.displayName || user?.username || "GUEST";

	return (
		<div className="flex h-screen overflow-hidden bg-surface text-white">
		{/* サイドバー */}
		<aside className="flex w-60 shrink-0 flex-col border-r border-neon-cyan/15 bg-surface-2/95">
			{/* ロゴ */}
			<div className="border-b border-neon-cyan/15 px-5 py-5">
				<div className="text-xl font-black tracking-[0.1em] text-neon-cyan [text-shadow: 0_0_16px_var(--color-neon-cyan)]">
					TETRIS
				</div>
			</div>
			
			{/* プロフィール */}
			<div className="flex items-center gap-3 border-b border-neon-cyan/15 px-5 py-4">
				<AvatarIcon color={preset.color} symbol={preset.symbol} size={44} />
				<div className="min-w-0">
					<div className="truncate text-xs font-black tracking-[0.08em]">
						{username || "GUEST"}
					</div>
					<div className="mt-1 flex items-center gap-1.5">
						<span className="h-1.5 w-1.5 rounded-full bg-neon-green shadow-glow-green" />
						<span className="text-[11px] text-neon-green">ONLINE</span>
					</div>
				</div>
			</div>
			<nav className="flex-1 overflow-y-auto py-2">
				{NAV.map(( {id, label }) => {
					return (
						<NavLink
							key={id}
							to={`/${id}`}
							className={({ isActive }) => [
								"flex w-full items-center gap-3.5 px-5 py-3 text-left text-[11px] tracking-[0.14em] transition-colors",
								isActive
									? "border-l-[3px] border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
									: "border-l-[3px] border-transparent text-white/60 hover:text-white",
							].join(" ")}
						>
							{label}
						</NavLink>
					)
				})}
			</nav>
		</aside>

		{/* 各ページ */}
		<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	</div>
	)
}