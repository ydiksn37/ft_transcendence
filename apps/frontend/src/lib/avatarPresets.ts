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

export interface AvatarDisplay {
  preset: AvatarPreset;
  photo?: string;
}

/* dbできたら切り替える */
export function getAvatarPreset(avatarId: number) {
  return AVATAR_PRESETS[avatarId % AVATAR_PRESETS.length]
}

/** Resolve every user's avatar with one stable rule across the application. */
export function resolveAvatar(userId: string | null | undefined, avatarUrl: string | null | undefined): AvatarDisplay {
  const presetMatch = avatarUrl?.match(/^preset:(\d+)$/);
  const fallbackIndex = userId ? userId.charCodeAt(0) % AVATAR_PRESETS.length : 0;
  const presetIndex = presetMatch ? Number(presetMatch[1]) : fallbackIndex;
  return {
    preset: getAvatarPreset(presetIndex),
    photo: avatarUrl && !presetMatch ? avatarUrl : undefined,
  };
}
