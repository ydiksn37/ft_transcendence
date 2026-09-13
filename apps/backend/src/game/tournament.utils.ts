export interface TournamentNode {
  id: string; // e.g., "match_1"
  type: 'MATCH' | 'LEAF';
  playerIds: string[]; // Active players in this match
  winnerId?: string; // Socket ID of the winner
  children: TournamentNode[];
  isPlaying?: boolean; // Length 0 for LEAF, 2 or 3 for MATCH
}

export interface Tournament {
  root: TournamentNode;
  matches: TournamentNode[]; // Flat list of MATCH nodes in bottom-up order for easy execution
  currentMatchIndex: number;
  /** socketId → 表示名 のマップ。退出後も名前を参照できるように開始時点で記録する。 */
  playerNames: Record<string, string>;
}

/**
 * 分割アルゴリズム: N人のプレイヤーを、深さdの有効な2-3木を形成できるように分割する。
 */
function getBalancedPartition(
  N: number,
  min_val: number,
  max_val: number,
): number[] {
  for (const k of [2, 3]) {
    const base = Math.floor(N / k);
    const rem = N % k;
    if (base >= min_val && (rem === 0 || base + 1 <= max_val)) {
      const parts = Array(k).fill(base);
      for (let i = 0; i < rem; i++) parts[i]++;
      return parts;
    }
  }
  throw new Error(
    `Cannot partition ${N} into parts between ${min_val} and ${max_val}`,
  );
}

/**
 * 再帰的にトーナメントツリーを構築
 */
function buildTree(
  N: number,
  depth: number,
  maxDepth: number,
  idCounter: { count: number },
): TournamentNode {
  if (depth === maxDepth) {
    return {
      id: `leaf_${idCounter.count++}`,
      type: 'LEAF',
      playerIds: [],
      children: [],
    };
  }

  const d = maxDepth - depth - 1;
  const min_val = Math.pow(2, d);
  const max_val = Math.pow(3, d);

  const parts = getBalancedPartition(N, min_val, max_val);
  const children = parts.map((partSize) =>
    buildTree(partSize, depth + 1, maxDepth, idCounter),
  );

  return {
    id: `match_${idCounter.count++}`,
    type: 'MATCH',
    playerIds: [],
    children,
  };
}

/**
 * ツリーを後行順(Post-order)で平坦化し、ボトムアップの試合リストを取得
 */
function flattenMatches(node: TournamentNode, matches: TournamentNode[]) {
  if (node.type === 'LEAF') return;
  for (const child of node.children) {
    flattenMatches(child, matches);
  }
  matches.push(node);
}

export function generateTournamentBracket(
  playerIds: string[],
  playerNames: Record<string, string> = {},
): Tournament {
  const N = playerIds.length;
  if (N < 2)
    throw new Error('At least 2 players are required for a tournament.');

  // find required depth h such that 2^h <= N <= 3^h
  let h = 1;
  while (Math.pow(3, h) < N) {
    h++;
  }

  const idCounter = { count: 1 };
  const root = buildTree(N, 0, h, idCounter);

  const matches: TournamentNode[] = [];
  flattenMatches(root, matches);

  // シャッフルしたプレイヤーを葉ノードに割り当てる
  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);

  // 葉ノードを見つけて割り当て
  let leafIndex = 0;
  function assignLeaves(node: TournamentNode) {
    if (node.type === 'LEAF') {
      node.playerIds = [shuffledPlayers[leafIndex++]];
    } else {
      node.children.forEach(assignLeaves);
    }
  }
  assignLeaves(root);

  // 最下層の試合（子供がすべてLEAF）について、初期playerIdsを設定
  // これは試合開始をスムーズにするため。
  matches.forEach((match) => {
    const isBottomLevel = match.children.every((c) => c.type === 'LEAF');
    if (isBottomLevel) {
      match.playerIds = match.children.flatMap((c) => c.playerIds);
    }
  });

  return {
    root,
    matches,
    currentMatchIndex: 0,
    playerNames,
  };
}
