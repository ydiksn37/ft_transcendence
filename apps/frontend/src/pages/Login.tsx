import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Panel } from "@/components/UI/Panel"
import { NeonInput } from "@/components/UI/NeonInput"
import { NeonBtn } from "@/components/UI/NeonBtn"

export default function Login() {
	const [username, setUsername] = useState("CYBER_01");
	const navigate = useNavigate();

	const handleLogin = () => {
		if (!username.trim())
			return;
		navigate("/dashboard");
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-surface p-4">
			<Panel glow="cyan" className="w-full max-w-sm">
				<div className="mb-6 text-center text-3xl font-black tracking-[0.12em] text-neon-cyan">
					TETRIS
				</div>
				<div className="flex flex-col gap-4">
					<NeonInput 
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						placeholder="ENTER_ID"
						onKeyDown={(e) => {if (e.key === "Enter") handleLogin()}}
					/>
					<NeonBtn color="cyan" variant="outline" size="lg" className="w-full" onClick={handleLogin}>
						JACK IN
					</NeonBtn>
				</div>
			</Panel>
		</div>
	)
}