import { GARBAGE_TABLE } from '@transcendence/shared';

export type ClearType =
  | 'single'
  | 'double'
  | 'triple'
  | 'tetris'
  | 'tspin_single'
  | 'tspin_double'
  | 'tspin_triple'
  | 'tspin_mini'
  | 'perfect_clear';

/** ライン消去数と T-Spin 種別から攻撃ライン数を計算 */
export function calcGarbage(
  linesCleared: number,
  tspinType: 'tspin' | 'tspin_mini' | null,
  isPerfectClear: boolean,
  b2bActive: boolean,
): { garbage: number; clearType: ClearType | null } {
  if (isPerfectClear) {
    return { garbage: GARBAGE_TABLE.perfect_clear, clearType: 'perfect_clear' };
  }

  let clearType: ClearType | null = null;
  let garbage = 0;

  if (tspinType === 'tspin') {
    if (linesCleared === 1) clearType = 'tspin_single';
    else if (linesCleared === 2) clearType = 'tspin_double';
    else if (linesCleared === 3) clearType = 'tspin_triple';
  } else if (tspinType === 'tspin_mini') {
    clearType = 'tspin_mini';
  } else {
    if (linesCleared === 1) clearType = 'single';
    else if (linesCleared === 2) clearType = 'double';
    else if (linesCleared === 3) clearType = 'triple';
    else if (linesCleared === 4) clearType = 'tetris';
  }

  if (clearType) {
    garbage = GARBAGE_TABLE[clearType] ?? 0;

    // Back-to-Back ボーナス (テトリス or T-Spin に連続成功)
    const isB2bEligible =
      clearType === 'tetris' ||
      clearType === 'tspin_single' ||
      clearType === 'tspin_double' ||
      clearType === 'tspin_triple';
    if (b2bActive && isB2bEligible) {
      garbage += GARBAGE_TABLE.b2b_bonus;
    }
  }

  return { garbage, clearType };
}

/** パーフェクトクリア判定 */
export function isPerfectClear(board: any[][]): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

/** スコア計算 */
export function calcScore(
  clearType: ClearType | null,
  level: number,
  combo: number,
): number {
  const BASE: Record<string, number> = {
    single: 100,
    double: 300,
    triple: 500,
    tetris: 800,
    tspin_mini: 100,
    tspin_single: 200,
    tspin_double: 400,
    tspin_triple: 600,
    perfect_clear: 3500,
  };

  if (!clearType) return 0;
  const base = (BASE[clearType] ?? 0) * level;
  const comboBonus = combo > 0 ? 50 * combo * level : 0;
  return base + comboBonus;
}
