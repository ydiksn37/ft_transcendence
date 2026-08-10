import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { NeonInput } from "@/components/UI/NeonInput"

type OAuthProvider = "42" | "github";

export default function Login() {
	const navigate = useNavigate();
	
	const [username, setUsername] = useState("");

	const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
	const handleOAuth = (provider: OAuthProvider) => {
		setOauthLoading(provider);

		// TODO: 後で実認証に切り替える
		setTimeout(() => {
			setOauthLoading(null);
			navigate("/dashboard");
		}, 1400)
	}

	const [pass, setPass] = useState("");
	const [err, setErr] = useState("");
	const handleLogin = () => {
		// TODO: 実認証に切り替える
		if (!username.trim() || pass.length < 4) {
			setErr("INVALID CREDENTIALS");
			return;
		}
		setErr("");
		navigate("/dashboard");
	}

	const guest = () => {
		navigate("/dashboard");
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-surface p-4">
			<Card className="w-full max-w-[420px] gap-0 py-0 ring-neon-cyan/20 shadow-glow-cyan">
				{/* 上部グラデーションバー */}
				<div className="h-0.5 bg-[linear-gradient(90deg,transparent,#00f5ff,#ff00aa,transparent)]" />

				<CardContent className="px-9 pt-11 pb-7">
					{/* ロゴ */}
					<div className="mb-9 text-center">
						<div className="text-[52px] font-black leading-none tracking-[0.12em] text-neon-cyan [animation:glitch_4s_infinite]">
							TETRIS
						</div>
						<div className="mt-5 h-px bg-[linear-gradient(90deg,transparent,rgba(0,245,255,0.2),transparent)]" />
					</div>

					{/* OAuth クイックコネクト */}
					<div className="mb-7">
						<div className="flex gap-3">
							{/* 42 */}
							<button
								type="button"
								disabled={!!oauthLoading}
								onClick={() => handleOAuth("42")}
								className={[
									"flex flex-1 items-center justify-center gap-2.5 border py-2.5 transition-all duration-150",
									oauthLoading === "42"
										? "border-neon-cyan/70 bg-neon-cyan/10 shadow-glow-cyan"
										: "border-neon-cyan/30 bg-neon-cyan/[0.04] hover:border-neon-cyan/60",
									oauthLoading ? "cursor-wait" : "cursor-pointer",
									oauthLoading && oauthLoading !== "42" ? "opacity-40" : "",
								].join(" ")}
							>
								<span className="font-display text-[17px] font-black text-neon-cyan/90">42</span>
								<span className="font-display text-[11px] tracking-[0.2em] text-neon-cyan/90">
									{oauthLoading === "42" ? "CONNECTING…" : "CONNECT 42"}
								</span>
							</button>

							{/* GitHub */}
							<button
								type="button"
								disabled={!!oauthLoading}
								onClick={() => handleOAuth("github")}
								className={[
									"flex flex-1 items-center justify-center gap-2.5 border py-2.5 transition-all duration-150",
									oauthLoading === "github"
										? "border-neon-purple/80 bg-neon-purple/10 shadow-glow-purple"
										: "border-neon-purple/30 bg-neon-purple/[0.04] hover:border-neon-purple/60",
									oauthLoading ? "cursor-wait" : "cursor-pointer",
									oauthLoading && oauthLoading !== "github" ? "opacity-40" : "",
								].join(" ")}
							>
								<svg width="20" height="20" viewBox="0 0 24 24" className="fill-neon-purple" aria-hidden="true">
									<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
								</svg>
								<span className="font-display text-[11px] tracking-[0.2em] text-neon-purple">
									{oauthLoading === "github" ? "CONNECTING…" : "GITHUB"}
								</span>
							</button>
						</div>

						{/* ローディングバー */}
						{oauthLoading && (
							<div className="mt-2 h-0.5 overflow-hidden bg-white/5">
								<div
									className="h-full w-2/5 [animation:scanline_0.9s_linear_infinite]"
									style={{
										background: `linear-gradient(90deg,transparent,${oauthLoading === "42" ? "#00f5ff" : "#bf00ff"},transparent)`,
									}}
								/>
							</div>
						)}
					</div>

					{/* 区切り線 */}
					<div className="mb-6 flex items-center gap-3">
						<div className="h-px flex-1 bg-neon-cyan/10" />
						<span className="font-display shrink-0 text-[10px] tracking-[0.25em] text-white/40">OR</span>
						<div className="h-px flex-1 bg-neon-cyan/10" />
					</div>

					{/* 手動ログイン */}
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1">
							<label className="font-display text-[10px] tracking-[0.35em] text-neon-cyan">PLAYER ID</label>
							<NeonInput
								className="font-tech"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="ENTER_ID"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label className="font-display text-[10px] tracking-[0.35em] text-neon-cyan">ACCESS CODE</label>
							<NeonInput
								className="font-tech"
								type="password"
								value={pass}
								onChange={(e) => setPass(e.target.value)}
								placeholder="••••••"
								onKeyDown={(e) => { if (e.key === "Enter") handleLogin() }}
							/>
						</div>

						{err && (
							<div className="font-tech text-center text-xs text-neon-red [text-shadow:0_0_8px_rgba(255,0,85,0.5)]">
								{err}
							</div>
						)}
					</div>

					<div className="mt-1 flex flex-col gap-2.5">
						<Button variant="neon" size="lg" className="w-full" onClick={handleLogin}>
							JACK IN
						</Button>
						<Button variant="neon-magenta" size="lg" className="w-full" onClick={guest}>
							GUEST ACCESS
						</Button>
					</div>

					{/* フッター */}
					<div className="border-t border-neon-cyan/[0.06] px-4 py-2.5 text-center">
						<span className="font-tech text-[11px] text-white/30">version 0.0 // Project T</span>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}