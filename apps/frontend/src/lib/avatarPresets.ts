export const AVATAR_PRESETS = [
  { color: "#00f5ff", symbol: "◈" },
  { color: "#ff00aa", symbol: "◆" },
  { color: "#39ff14", symbol: "▲" },
  { color: "#bf00ff", symbol: "■" },
  { color: "#ff6600", symbol: "●" },
  { color: "#ffe600", symbol: "★" },
  { color: "#ff0055", symbol: "✦" },
  { color: "#00ffcc", symbol: "⬡" },
] as const

export type AvatarPreset = typeof AVATAR_PRESETS[number];

/* dbできたら切り替える */
export function getAvatarPreset(avatarId: number) {
  return AVATAR_PRESETS[avatarId % AVATAR_PRESETS.length]
}