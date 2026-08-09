import { useState } from "react";

import { getCurrentUser, getGlobalMessages, getMessagesByRoom, getRoomSummaries, GLOBAL_ROOM_ID, markRoomRead, sendMessage } from "@/lib/mock"
import type { ChatMessage, PlayerSummary, RoomId } from "@/lib/types";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { RoomList } from "@/components/chat/RoomList";
import { RoomHeader } from "@/components/chat/RoomHeader";
import { MessageList } from "@/components/chat/MessageList";


export default function Chat() {
	/* TODO: 適当にモックから取得している　認証情報追加時に変更 */
	const me = getCurrentUser();

	/* どの部屋を開いているか TODO: 部屋のidの定義がmockにあるので移動させる */
	const [activeRoomId, setActiveRoomId] = useState<RoomId>(GLOBAL_ROOM_ID);

	/* TODO: DBからの取得に切り替える 自分が所属しているルーム一覧を取得する */
	const [summaries, setSummaries] = useState(() => getRoomSummaries(me.id));

	/* TODO: DBからの取得に切り替える */
	const [messages, setMessages] = useState<ChatMessage[]>(() => getGlobalMessages());

	const activeRoom = summaries.find((s) => s.room.id === activeRoomId)?.room;
	if (!activeRoom)
			return null;

	const meAsSender: PlayerSummary = {
		id: me.id,
		username: me.username,
		displayName: me.displayName,
		avatarUrl: me.avatarUrl,
		isOnline: true,
	}
	
	/* メッセージを取得し直して、既読にする */
	const selectRoom = (roomId: RoomId) => {
		setActiveRoomId(roomId);
		setMessages(getMessagesByRoom(roomId));
		markRoomRead(roomId);
		setSummaries(getRoomSummaries(me.id));
	}

	const send = (content: string) => {
		const msg = sendMessage(activeRoomId, meAsSender, content)  // データに保存
		setMessages((prev) => [...prev, msg])                       // 画面に反映
	}

	return (
		<div className="flex h-full text-white">
			{/* 左：ルーム一覧　TODO: モバイル対応 */}
			<aside className="hidden w-60 shrink-0 border-r border-neon-cyan/15 bg-surface-2/40 md:block">
				<RoomList
					summaries={summaries}
					activeRoomId={activeRoomId}
					onSelect={selectRoom}
				/>
			</aside>

			{/* 右：メッセージペイン */}
			<div className="flex min-w-0 flex-1 flex-col">
				<RoomHeader room={activeRoom} />
				<MessageList messages={messages} meId={me.id} />
				<div className="shrink-0 border-t border-neon-cyan/15 bg-surface-2/60 px-6 py-3.5">
					<div className="mx-auto max-w-[900px]">
						<MessageComposer
							onSend={send}
							placeholder={
								activeRoom.type === "GLOBAL"
									? "Message #global..."
									: `Message ${activeRoom.title}...`
							}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}