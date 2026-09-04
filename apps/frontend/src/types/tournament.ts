export interface TournamentNode {
  id: string;
  type: 'MATCH' | 'LEAF';
  playerIds: string[];
  winnerId?: string;
  children: TournamentNode[];
}

export interface Tournament {
  root: TournamentNode;
  matches: TournamentNode[];
  currentMatchIndex: number;
}
