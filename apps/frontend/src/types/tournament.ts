export interface TournamentNode {
  id: string;
  type: 'MATCH' | 'LEAF';
  playerIds: string[];
  winnerId?: string;
  children: TournamentNode[];
  isPlaying?: boolean;
}

export interface Tournament {
  root: TournamentNode;
  matches: TournamentNode[];
  currentMatchIndex: number;
  /** socketId → 表示名 のマップ。退出後も名前を参照できるように開始時点で記録される。 */
  playerNames: Record<string, string>;
}
