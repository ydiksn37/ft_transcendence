import { useState } from "react";

import { Send } from "lucide-react";



export interface MessageComposerProps {
	onSend: (content: string) => void
	placeholder?: string
	disabled?: boolean
}

export function MessageComposer({ onSend, placeholder = "Message ...", disabled }: MessageComposerProps) {
	const [draft, setDraft] = useState("");
	const canSend = draft.trim().length > 0 && !disabled;

	const submit = () => {
		if (!canSend)
			return ;
		onSend(draft.trim());
		setDraft("");
	}

	return (
		<div className="flex items-stretch gap-2">
			<input
				type="text"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.nativeEvent.isComposing) {
						e.preventDefault();
						submit();
					}
				}}
				placeholder={placeholder}
				disabled={disabled}
				aria-label="メッセージを入力"
				className="flex-1 font-mono w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
			/>

			<button
				type="button"
				onClick={submit}
				disabled={!canSend}
				aria-label="送信"
				className="flex w-11 shrink-0 items-center justify-center border border-neon-cyan/60 text-neon-cyan transition-all hover:bg-neon-cyan/10 hover:shadow-glow-cyan disabled:pointer-events-none disabled:opacity-35"
			>
				<Send size={16} />
			</button>
		</div>
	)
}