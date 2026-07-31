import { useState } from "react";

/* モックデータ */
import { getFriends, getPendingRequests, getProfile } from "@/lib/mock"

import { PageHeader } from "@/components/UI/PageHeader";
import { NeonInput } from "@/components/UI/NeonInput";
import { FriendList } from "@/components/friends/FriendList";
import { AddFriend } from "@/components/friends/AddFriend";
import { PendingRequest } from "@/components/friends/PendingRequest";
import { ProfileModal } from "@/components/friends/ProfileModal";

export default function Friends() {
	/* モックデータの取得 DBからの取得に切り替える */
	const friends = getFriends();
	const requests = getPendingRequests();

	const [search, setSearch] = useState("");

	const keyword = search.trim().toLowerCase();
	const filtered = keyword
		? friends.filter((f) => 
			f.displayName.toLowerCase().includes(keyword) || 
			f.username.toLocaleLowerCase().includes(keyword)
		)
		: friends;

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selectedProfile = selectedId ? getProfile(selectedId) : undefined;

	return (
		<div className="w-full max-w-[1200px] px-8 py-9 text-white">
			<PageHeader title="FRIENDS" subtitle={`${friends.length} FRIENDS`} />

			<div className="flex flex-wrap gap-5">
				{/* 左カラム */}
				<div className="min-w-0 [flex:1_1_420px]">
					<div className="mb-3.5">
						<NeonInput
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="SEARCH FRIENDS..."
						/>
					</div>
					<FriendList friends={filtered} onSelect={(f) => setSelectedId(f.id)} />
				</div>

				{/* 右カラム */}
				<div className="flex min-w-0 flex-col gap-4 [flex:0_0_300px]">
					<AddFriend />
					<PendingRequest requests={requests} />
				</div>

				{selectedProfile && (
					<ProfileModal profile={selectedProfile} onClose={() => setSelectedId(null)} />
				)}

			</div>
		</div>
	)
}