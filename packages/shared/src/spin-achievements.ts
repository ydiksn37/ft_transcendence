export type OtherSpin = 'I' | 'J' | 'L' | 'S' | 'Z';
export type OtherSpinCounts = Record<OtherSpin, number>;
export const emptyOtherSpins = (): OtherSpinCounts => ({ I: 0, J: 0, L: 0, S: 0, Z: 0 });

// Achievement-only all-spin rule. The caller supplies the board BEFORE lock,
// excluding active cells. Does not modify damage, scoring, or B2B rules.
export function detectOtherSpin(
  piece: string, lastWasRotation: boolean, cells: readonly (readonly [number, number])[],
  canOccupy: (row: number, col: number) => boolean,
): OtherSpin | null {
  if (!['I', 'J', 'L', 'S', 'Z'].includes(piece) || !lastWasRotation || cells.length !== 4) return null;
  const blocked = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dy, dx]) =>
    cells.some(([row, col]) => !canOccupy(row + dy, col + dx)));
  return blocked ? piece as OtherSpin : null;
}
