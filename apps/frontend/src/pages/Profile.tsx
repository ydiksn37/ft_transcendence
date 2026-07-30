import { Card } from "@/components/ui/card"

/* モックデータ用 */
import { getCurrentUser, getGameHistory } from "@/lib/mock"

import { PageHeader } from "@/components/UI/PageHeader";
import { RecentBattles } from "@/components/dashboard/RecentBattles"; // ### TODO: RecentBattlesをここで使うのであれば、dashboardディレクトリにあるのはおかしい
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileStats } from "@/components/profile/ProfileStats";

export default function Profile() {
	/* TODO: DBからの取得に切り替えること */
	const user = getCurrentUser();
	const games = getGameHistory();

	return (
		<div className="w-full max-w-[1200px] px-8 py-9 text-white">
			<PageHeader title="MY PROFILE" subtitle={`@${user.username} ・ ACCOUNT OWNER`} />

			<div className="flex flex-wrap gap-5">
				{/* 左カラム */}
				<div className="flex min-w-0 flex-col gap-4 [flex:0_0_300px]">
					{/* プロフィールカード */}
					<ProfileCard user={user} />
					{/* ステータス */}
					<ProfileStats />

				</div>
				{/* 右カラム */}
				<div className="min-w-0 [flex:1_1_320px]">
					<Card className="rounded-none p-6 ring-neon-cyan/30">
						<div className="mb-4 flex items-center gap-2">
							<span className="h-3.5 w-[3px] shrink-0 bg-neon-cyan shadow-glow-cyan" />
							<span className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">
								AVATAR
							</span>
						</div>
						<AvatarPicker value={user.avatarId} />
					</Card>
				</div>
			</div>
			{/* 下段 */}
			<div className="mt-5">
				<RecentBattles games={games} />
			</div>

		</div>
	)
}