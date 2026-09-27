// Shared by the live game and CONFIG preview.
export function gameBackgroundImage(style: 'MATRIX' | 'STARS' | 'SOLID', image?: string) {
  if (style === 'SOLID') return 'none';
  if (style === 'STARS') return 'radial-gradient(circle at 20% 30%, rgba(255,255,255,.7) 0 1px, transparent 2px), radial-gradient(circle at 75% 65%, rgba(0,245,255,.7) 0 1px, transparent 2px), linear-gradient(#02020a, #080018)';
  return `linear-gradient(rgba(6,0,15,0.72), rgba(6,0,15,0.72)), url(${image})`;
}
