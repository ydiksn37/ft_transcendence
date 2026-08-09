import { useState } from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { NeonInput } from "@/components/UI/NeonInput"

export function AddFriend() {
	const [input, setInput] = useState("")

	return (
		<Card className="rounded-none p-5 ring-neon-cyan/30">
			<div className="mb-3 flex items-center" gap-2>
				<span className="h-3.5 w-[3px] shrink-0 bg-neon-cyan shadow-glow-cyan" />
				<span className="text-xs px-2 font-bold uppercase tracking-[0.2em] text-white/55">
					ADD FRIEND
				</span>
			</div>

			<div className="flex flex-col gap-2.5">
				<NeonInput 
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="USERNAME..."
				/>
				{/* DBできたら申請処理とエラーメッセージを実装する */}
				<Button
					variant="neon"
					className="w-full"
					disabled={!input.trim()}
					onClick={() => console.log("add friend", input)}
				>
					ADD
				</Button>
			</div>
		</Card>
	)
}