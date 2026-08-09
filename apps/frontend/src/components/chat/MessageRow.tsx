import { getAvatarPreset } from "@/lib/avatarPresets";
import { avatarIdFromUserId } from "@/lib/mock";
import { AvatarIcon } from "../UI/AvatarIcon";

import type { ChatMessage } from "@/lib/types";

export interface MessageRowProps {
	message: ChatMessage
	isMe: boolean
}

/* 時間の整形関数 TODO: 考え直す */
function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime()))
		return ("");
	return (d.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", hour12: false}));
}

export function MessageRow({ message, isMe }: MessageRowProps) {
	const { sender, content, createdAt } = message;

	/* TODO: プリセットの取得方法考える */
	const preset = getAvatarPreset(avatarIdFromUserId(sender.id));

	const time = formatTime(createdAt);

	if (isMe) {
		return (
			<div className="flex flex-col items-end gap-1">
				<div className="max-w-[80%] border border-neon-cyan/40 bg-neon-cyan/[0.08] px-3.5 py-2.5 shadow-glow-cyan">
					<span className="font-mono text-sm leading-relaxed text-white/90 [overflow-wrap:anywhere]">
						{content}
					</span>
				</div>
				<span className="font-mono text-[10px] text-white/35">{time}</span>
			</div>
		)
	}

	return (
		<div className="flex items-end gap-2.5">
			<div className="shrink-0">
				<AvatarIcon color={preset.color} symbol={preset.symbol} photo={sender.avatarUrl} size={38} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="mb-1 flex items-baseline gap-2">
					<span
						className="font-orbitron text-[11px] tracking-[0.08em]"
						style={{ color: preset.color, textShadow: `0 0 6px ${preset.color}80` }}
					>
						{sender.displayName}
					</span>
					<span className="font-mono text-[11px] text-white/35">{time}</span>
				</div>

				<div className="inline-block max-w-[88%] border border-neon-cyan/15 bg-surface-2/70 px-3.5 py-2.5">
					<span className="font-mono text-sm leading-relaxed text-white/90 [overflow-wrap:anywhere]">
						{content}
					</span>
				</div>
			</div>
		</div>
	)
}