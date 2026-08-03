import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/types";

import { DateDivider } from "./DateDivider";
import { MessageRow } from "./MessageRow";

export interface MessageListProps {
	messages: ChatMessage[]
	meId: string
}

export function MessageList({ messages, meId }: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [messages])

	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
			<div className="mx-auto flex max-w-[900px] flex-col gap-4">
				{messages.length === 0 ? (
					<div className="flex flex-col items-center gap-1.5 py-16 opacity-40">
						<div className="font-orbitron text-xs tracking-[0.2em]">NO MESSAGES YET</div>
						<div className="font-mono text-[11px] text-white/50">Start the conversation</div>
					</div>
				) : (
					messages.map((m, i) => {
						const prev = messages[i - 1]
						const currentDate = m.createdAt.slice(0, 10)
						const prevDate = prev?.createdAt.slice(0, 10)
						const showDivider = currentDate !== prevDate

						return (
							<div key={m.id} className="flex flex-col gap-4">
								{showDivider && <DateDivider isoDate={currentDate} />}
								<MessageRow message={m} isMe={m.sender.id === meId} />
							</div>
						)
					})
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	)
}