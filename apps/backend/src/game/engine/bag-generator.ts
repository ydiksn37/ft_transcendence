import { TetrominoType } from '@transcendence/shared';

const PIECE_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/**
 * Seeded 7-Bag ジェネレーター
 * 両プレイヤーに同一のミノ順序を保証するため、サーバー側で管理する
 */
export class BagGenerator {
  private bag: TetrominoType[] = [];
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  private nextRandom(): number {
    // 線形合同法 (Lehmer RNG)
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0x100000000;
  }

  private shuffle(arr: TetrominoType[]): TetrominoType[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextRandom() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private refill(): void {
    this.bag = this.shuffle([...PIECE_TYPES]);
  }

  /** 次のミノを取得 */
  next(): TetrominoType {
    if (this.bag.length === 0) this.refill();
    return this.bag.pop()!;
  }

  /** Nextキューを先読み (n個) */
  peek(n: number): TetrominoType[] {
    while (this.bag.length < n) this.refill();
    return [...this.bag].reverse().slice(0, n);
  }
}
