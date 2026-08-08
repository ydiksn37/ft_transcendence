// ───────────────────────────────────────────────
//  テトリスのミノ（テトロミノ）定義
// ───────────────────────────────────────────────
export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 盤面のセル: null=空, string=ミノ種別 or ガーベージ */
export type Cell = TetrominoType | 'GARBAGE' | null;

/** テトリス盤面: 20行×10列 */
export type Board = Cell[][];

/** アクティブなミノの状態 */
export interface ActiveMino {
  type: TetrominoType;
  x: number;       // 列インデックス (0-9)
  y: number;       // 行インデックス (0-19)
  rotation: 0 | 1 | 2 | 3;
}

// ───────────────────────────────────────────────
//  ゲーム状態（サーバー→クライアントへブロードキャスト）
// ───────────────────────────────────────────────
export interface GameState {
  board: Board;
  activeMino: ActiveMino;
  ghostY: number;            // ゴーストピースのY位置
  nextMinos: TetrominoType[]; // Nextキュー (5つ表示)
  holdMino: TetrominoType | null;
  canHold: boolean;          // ホールドを使用済みか
  garbageQueue: number;      // 蓄積おじゃま量 (ライン数)
  score: number;
  lines: number;             // 消したライン数
  level: number;
  combo: number;             // コンボ数
  b2b: number;               // Back-to-Back カウント
  isGameOver: boolean;
  apm: number;               // Attacks Per Minute
  pps: number;               // Pieces Per Second
}

/** 相手の盤面情報（観戦者含む全員に配信） */
export interface OpponentState {
  playerId: string;
  board: Board;
  garbageQueue: number;
  isGameOver: boolean;
  apm: number;
  pps: number;
}

// ───────────────────────────────────────────────
//  ガーベージ（おじゃまライン）計算定義
// ───────────────────────────────────────────────
export const GARBAGE_TABLE: Record<string, number> = {
  single: 0,
  double: 1,
  triple: 2,
  tetris: 4,
  tspin_single: 2,
  tspin_double: 4,
  tspin_triple: 6,
  tspin_mini: 1,
  perfect_clear: 10,
  b2b_bonus: 1,   // Back-to-Back ボーナス（上記に加算）
};

// ───────────────────────────────────────────────
//  WebSocket イベント定数
// ───────────────────────────────────────────────

/** クライアント → サーバー */
export const ClientEvent = {
  // ゲーム入力
  MOVE_LEFT:   'game:move_left',
  MOVE_RIGHT:  'game:move_right',
  ROTATE_CW:   'game:rotate_cw',    // 時計回り
  ROTATE_CCW:  'game:rotate_ccw',   // 反時計回り
  ROTATE_180:  'game:rotate_180',
  SOFT_DROP:   'game:soft_drop',
  HARD_DROP:   'game:hard_drop',
  HOLD:        'game:hold',
  // マッチメイキング
  JOIN_QUEUE:    'match:join_queue',
  LEAVE_QUEUE:   'match:leave_queue',
  JOIN_ROOM:     'room:join',
  LEAVE_ROOM:    'room:leave',
  SPECTATE:      'room:spectate',
  // チャット
  CHAT_MESSAGE:  'chat:message',
  CHAT_TYPING:   'chat:typing',
  CHAT_READ:     'chat:read',
  // トーナメント
  TOURNAMENT_JOIN:  'tournament:join',
  TOURNAMENT_READY: 'tournament:ready',
} as const;

export type ClientEventType = typeof ClientEvent[keyof typeof ClientEvent];

/** サーバー → クライアント */
export const ServerEvent = {
  // ゲーム状態
  GAME_STATE:        'game:state',       // 自分の盤面
  OPPONENT_STATE:    'game:opponent',    // 相手の盤面（観戦者も受信）
  GAME_OVER:         'game:over',
  GAME_START:        'game:start',
  GARBAGE_INCOMING:  'game:garbage',    // おじゃまライン予告
  // マッチ
  MATCH_FOUND:       'match:found',
  ROOM_READY:        'room:ready',
  ROOM_PLAYERS:      'room:players',
  // チャット
  CHAT_MESSAGE:      'chat:message',
  CHAT_TYPING:       'chat:typing',
  // 通知
  NOTIFICATION:      'notification:new',
  // トーナメント
  TOURNAMENT_UPDATE: 'tournament:update',
  TOURNAMENT_MATCH:  'tournament:match', // 自分の試合が始まる通知
  // エラー
  ERROR:             'error',
} as const;

export type ServerEventType = typeof ServerEvent[keyof typeof ServerEvent];

// ───────────────────────────────────────────────
//  API 共通レスポンス型
// ───────────────────────────────────────────────
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ───────────────────────────────────────────────
//  ユーザー関連の共通型
// ───────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'MODERATOR' | 'USER' | 'GUEST';
export type TwoFactorMethod = 'EMAIL' | 'SMS';
export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type Rank = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  rank: Rank;
  role: UserRole;
}

export interface UserProfile extends PublicUser {
  email: string;
  bio: string | null;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;
  createdAt: string;
}

export interface UserStats {
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  bestApm: number;
  avgApm: number;
  bestPps: number;
  avgPps: number;
  totalLinesCleared: number;
  totalTSpins: number;
  totalTetrises: number;
  currentWinStreak: number;
  bestWinStreak: number;
  xp: number;
  level: number;
  rank: Rank;
  rankPoints: number;
}

// ───────────────────────────────────────────────
//  ゲーム難易度 (AI)
// ───────────────────────────────────────────────
export type AiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface AiBotConfig {
  difficulty: AiDifficulty;
  thinkDelayMs: number;    // EASY:800, MEDIUM:400, HARD:100
  mistakeRate: number;     // EASY:0.3, MEDIUM:0.1, HARD:0.0
}

export const AI_BOT_CONFIGS: Record<AiDifficulty, AiBotConfig> = {
  EASY:   { difficulty: 'EASY',   thinkDelayMs: 800, mistakeRate: 0.3 },
  MEDIUM: { difficulty: 'MEDIUM', thinkDelayMs: 400, mistakeRate: 0.1 },
  HARD:   { difficulty: 'HARD',   thinkDelayMs: 100, mistakeRate: 0.0 },
};

// ───────────────────────────────────────────────
//  トーナメント
// ───────────────────────────────────────────────
export type TournamentStatus = 'REGISTRATION' | 'SEEDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MatchStatus = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'BYE';

export interface TournamentBracket {
  tournamentId: string;
  rounds: TournamentRound[];
  winner?: PublicUser;
}

export interface TournamentRound {
  round: number;
  matches: TournamentMatchView[];
}

export interface TournamentMatchView {
  id: string;
  matchNumber: number;
  player1?: PublicUser;
  player2?: PublicUser;
  winner?: PublicUser;
  status: MatchStatus;
}

// ───────────────────────────────────────────────
//  ゲームカスタマイズ設定
// ───────────────────────────────────────────────
export type MinoSkin = 'NEON' | 'RETRO' | 'MINIMAL';

export interface GameSettings {
  minoSkin: MinoSkin;
  showGhost: boolean;
  arr: number; // ms
  das: number; // ms
  dcd: number; // ms
  sdf: number; // Soft Drop Factor, 0 = Infinity
  keyBindings: KeyBindings;
  volume: number;    // 0-100
  sfxEnabled: boolean;
  musicEnabled: boolean;
}

export interface KeyBindings {
  moveLeft:   string;
  moveRight:  string;
  rotateCW:   string;
  rotateCCW:  string;
  rotate180:  string;
  softDrop:   string;
  hardDrop:   string;
  hold:       string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveLeft:   'ArrowLeft',
  moveRight:  'ArrowRight',
  rotateCW:   'ArrowUp',
  rotateCCW:  'KeyZ',
  rotate180:  'KeyA',
  softDrop:   'ArrowDown',
  hardDrop:   'Space',
  hold:       'ShiftLeft',
};

// ───────────────────────────────────────────────
//  テトロミノの形状定義（[row, col] オフセット）
// ───────────────────────────────────────────────
export const TETROMINO_SHAPES: Record<TetrominoType, [number, number][][]> = {
  I: [
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,1],[1,1],[2,1],[3,1]],
  ],
  O: [
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
  ],
  T: [
    [[0,1],[1,0],[1,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,1]],
    [[1,0],[1,1],[1,2],[2,1]],
    [[0,1],[1,0],[1,1],[2,1]],
  ],
  S: [
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,1],[1,2],[2,0],[2,1]],
    [[0,0],[1,0],[1,1],[2,1]],
  ],
  Z: [
    [[0,0],[0,1],[1,1],[1,2]],
    [[0,2],[1,1],[1,2],[2,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[0,1],[1,0],[1,1],[2,0]],
  ],
  J: [
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,0],[2,1]],
  ],
  L: [
    [[0,2],[1,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[1,2],[2,0]],
    [[0,0],[0,1],[1,1],[2,1]],
  ],
};

/** ミノの色（ネオンカラー） */
export const MINO_COLORS: Record<TetrominoType, string> = {
  I: '#00FFFF',
  O: '#FFD700',
  T: '#AA00FF',
  S: '#00FF88',
  Z: '#FF0044',
  J: '#0088FF',
  L: '#FF8800',
};

export interface SignupDto {
  email: string;
  username: string;
  password?: string;
  displayName: string;
}

export interface SigninDto {
  email: string;
  password?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  };
}

// ───────────────────────────────────────────────
//  Sprint Record (40 Lines)
// ───────────────────────────────────────────────
export interface SprintRecord {
  id: string;
  userId: string;
  timeMs: number;
  lines: number;
  pieces: number | null;
  createdAt: string;
}

export interface SprintLeaderboardEntry {
  rank: number;
  record: SprintRecord;
  user: PublicUser;
}
