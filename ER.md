# DB 設計書
 
> ORM: Prisma | DB: PostgreSQL 16 | 全エンティティ: 16 | 中間テーブル: 6 | 総テーブル数: 22

---

## 1. エンティティ一覧

| テーブル名 | 種別 | 説明 |
|---|---|---|
| `User` | エンティティ | 全機能の中心。42 API OAuth、2FA 設定を含む |
| `UserStats` | エンティティ (1:1) | APM/PPS/勝率などのゲーム統計 |
| `UserGameSettings` | エンティティ (1:1) | スキン・ゴースト・キーバインド等のゲーム設定 |
| `GameResult` | エンティティ | 全対戦の結果・詳細データ |
| `GameAnalytic` | エンティティ | 日次集計データ（ダッシュボード高速化） |
| `SprintRecord` | エンティティ | 40 Lines 等のソロプレイのクリアタイム記録 |
| **`Friendship`** | **中間テーブル** | User ↔ User（PENDING/ACCEPTED/REJECTED） |
| **`Block`** | **中間テーブル** | User ↔ User（ブロック関係） |
| `ChatRoom` | エンティティ | GLOBAL/DIRECT/GAME/TOURNAMENT のチャット部屋 |
| **`ChatRoomMembership`** | **中間テーブル** | User ↔ ChatRoom（既読管理付き） |
| `ChatMessage` | エンティティ | チャット履歴（ソフトデリート対応） |
| `Notification` | エンティティ | 全通知（種別・既読管理） |
| `Tournament` | エンティティ | トーナメント管理（状態機械） |
| **`TournamentEntry`** | **中間テーブル** | User ↔ Tournament（シード・順位付き） |
| `TournamentMatch` | エンティティ | トーナメントの各試合（ブラケット） |
| `Organization` | エンティティ | クラン/ギルド |
| **`OrgMembership`** | **中間テーブル** | User ↔ Organization（役割付き） |
| `Achievement` | エンティティ | 実績定義（マスターデータ） |
| **`UserAchievement`** | **中間テーブル** | User ↔ Achievement（取得日付き） |
| `ApiKey` | エンティティ | 公開 API キー（ハッシュ保存） |
| `FileUpload` | エンティティ | アバター・チャット添付ファイル |
| `DataExportRequest` | エンティティ | GDPR データ開示・削除リクエスト |

---

## 2. ER 図

```mermaid
erDiagram
    User {
        uuid id PK
        string email UK
        string username UK
        string displayName
        string passwordHash "nullable if OAuth only"
        string avatarUrl
        text bio
        string role "ADMIN MODERATOR USER GUEST"
        bool isOnline
        datetime lastSeenAt
        datetime bannedUntil "nullable"
        string banReason "nullable"
        string oauthProvider "nullable"
        string oauthId "nullable"
        bool twoFactorEnabled
        string twoFactorMethod "EMAIL SMS nullable"
        string twoFactorContact "nullable"
        bool isEmailVerified
        datetime deletedAt "nullable soft delete"
        datetime createdAt
        datetime updatedAt
    }

    UserStats {
        uuid id PK
        uuid userId FK "UNIQUE 1to1"
        int wins
        int losses
        int totalGames
        decimal winRate
        decimal bestApm
        decimal avgApm
        decimal bestPps
        decimal avgPps
        int totalLinesCleared
        int totalTSpins
        int totalTetrises
        int currentWinStreak
        int bestWinStreak
        int xp
        int level
        string rank "BRONZE SILVER GOLD PLATINUM DIAMOND MASTER"
        int rankPoints
    }

    UserGameSettings {
        uuid id PK
        uuid userId FK "UNIQUE 1to1"
        string minoSkin "NEON RETRO MINIMAL"
        bool showGhost
        int arr
        int das
        int dcd
        int sdf
        json keyBindings
        int volume
        bool sfxEnabled
        bool musicEnabled
    }

    GameResult {
        uuid id PK
        string roomId "ephemeral room UUID"
        uuid player1Id FK
        uuid player2Id FK "nullable vs AI"
        uuid winnerId FK "nullable if abandoned"
        bool isAiGame
        string aiDifficulty "EASY MEDIUM HARD nullable"
        decimal player1Apm
        decimal player2Apm "nullable"
        decimal player1Pps
        decimal player2Pps "nullable"
        int player1LinesCleared
        int player2LinesCleared "nullable"
        int player1TSpins
        int player2TSpins
        int player1Tetrises
        int player2Tetrises
        int garbageSent1to2
        int garbageSent2to1
        int durationSeconds
        string gameMode "VERSUS AI TOURNAMENT"
        uuid tournamentMatchId FK "nullable"
        datetime createdAt
    }

    SprintRecord {
        uuid id PK
        uuid userId FK
        int timeMs
        int lines
        int pieces "nullable"
        datetime createdAt
    }

    GameAnalytic {
        uuid id PK
        uuid userId FK
        date date
        int gamesPlayed
        int wins
        int losses
        decimal avgApm
        decimal avgPps
        int totalLinesCleared
        int totalPlaytimeSeconds
    }

    Friendship {
        uuid id PK
        uuid requesterId FK
        uuid addresseeId FK
        string status "PENDING ACCEPTED REJECTED"
        datetime createdAt
        datetime updatedAt
    }

    Block {
        uuid id PK
        uuid blockerId FK
        uuid blockedId FK
        datetime createdAt
    }

    ChatRoom {
        uuid id PK
        string type "GLOBAL DIRECT GAME TOURNAMENT"
        string name "nullable"
        uuid relatedId "nullable"
        datetime createdAt
    }

    ChatRoomMembership {
        uuid id PK
        uuid roomId FK
        uuid userId FK
        datetime lastReadAt "nullable for read receipts"
        datetime joinedAt
    }

    ChatMessage {
        uuid id PK
        uuid roomId FK
        uuid senderId FK "nullable if user deleted"
        text content
        bool isDeleted
        datetime deletedAt "nullable"
        datetime editedAt "nullable"
        datetime createdAt
    }

    Notification {
        uuid id PK
        uuid userId FK
        string type "FRIEND_REQUEST GAME_INVITE etc"
        string title
        text content
        uuid relatedId "nullable polymorphic"
        string relatedType "nullable"
        bool isRead
        datetime readAt "nullable"
        datetime createdAt
    }

    Tournament {
        uuid id PK
        string name
        text description
        uuid creatorId FK
        string status "REGISTRATION SEEDING IN_PROGRESS COMPLETED CANCELLED"
        int maxPlayers "4 8 or 16"
        int minPlayers
        datetime registrationDeadline "nullable"
        datetime startedAt "nullable"
        datetime endedAt "nullable"
        uuid winnerId FK "nullable"
        datetime createdAt
    }

    TournamentEntry {
        uuid id PK
        uuid tournamentId FK
        uuid userId FK
        int seed "nullable until seeding"
        int finalRank "nullable until completion"
        datetime registeredAt
    }

    TournamentMatch {
        uuid id PK
        uuid tournamentId FK
        int round
        int matchNumber
        uuid player1Id FK "nullable until set"
        uuid player2Id FK "nullable until set"
        uuid winnerId FK "nullable until completed"
        uuid gameResultId FK "nullable until played"
        string status "PENDING READY IN_PROGRESS COMPLETED BYE"
        datetime scheduledAt "nullable"
        datetime completedAt "nullable"
    }

    Organization {
        uuid id PK
        string name UK
        string slug UK
        text description
        string avatarUrl
        int maxMembers
        bool isPublic
        uuid creatorId FK
        datetime createdAt
        datetime updatedAt
    }

    OrgMembership {
        uuid id PK
        uuid orgId FK
        uuid userId FK
        string role "OWNER ADMIN MEMBER"
        uuid invitedBy FK "nullable"
        datetime joinedAt
    }

    Achievement {
        uuid id PK
        string key UK
        string name
        text description
        string iconUrl
        int xpReward
        string category "GAME SOCIAL TOURNAMENT SPECIAL"
        bool isSecret
        datetime createdAt
    }

    UserAchievement {
        uuid id PK
        uuid userId FK
        uuid achievementId FK
        datetime earnedAt
    }

    ApiKey {
        uuid id PK
        uuid userId FK
        string label
        string keyPrefix
        string keyHash UK
        int rateLimit
        bool isActive
        datetime lastUsedAt "nullable"
        datetime expiresAt "nullable"
        datetime createdAt
    }

    FileUpload {
        uuid id PK
        uuid uploaderId FK
        string filename
        string originalName
        string mimeType
        bigint sizeBytes
        string storageUrl
        string purpose "AVATAR CHAT_ATTACHMENT EXPORT"
        bool isPublic
        datetime createdAt
    }

    DataExportRequest {
        uuid id PK
        uuid userId FK
        string status "PENDING PROCESSING READY DOWNLOADED EXPIRED"
        datetime requestedAt
        datetime processedAt "nullable"
        string fileUrl "nullable"
        datetime expiresAt "nullable"
    }

    %% ─── リレーション定義 ───
    User ||--|| UserStats : "1:1"
    User ||--|| UserGameSettings : "1:1"
    User ||--o{ GameResult : "player1"
    User ||--o{ GameResult : "player2"
    User ||--o{ GameAnalytic : "daily stats"
    User ||--o{ Friendship : "requester"
    User ||--o{ Friendship : "addressee"
    User ||--o{ Block : "blocker"
    User ||--o{ Block : "blocked"
    User ||--o{ ChatRoomMembership : "member"
    User ||--o{ ChatMessage : "sender"
    User ||--o{ Notification : "receives"
    User ||--o{ TournamentEntry : "participates"
    User ||--o{ OrgMembership : "belongs_to"
    User ||--o{ UserAchievement : "earns"
    User ||--o{ ApiKey : "owns"
    User ||--o{ FileUpload : "uploads"
    User ||--o{ DataExportRequest : "requests"
    User ||--o{ SprintRecord : "records"
    Tournament ||--o{ TournamentEntry : "has entries"
    Tournament ||--o{ TournamentMatch : "has matches"
    TournamentMatch ||--o| GameResult : "result"
    ChatRoom ||--o{ ChatRoomMembership : "members"
    ChatRoom ||--o{ ChatMessage : "messages"
    Organization ||--o{ OrgMembership : "members"
    Achievement ||--o{ UserAchievement : "earned by"
```

---

## 3. 中間テーブル詳細

### 3-1. `Friendship`（フレンド申請・承認）

**目的:** ユーザー間の友達関係を管理。方向性あり（申請者 → 受信者）

```
Friendship
├── id: UUID PK
├── requesterId: UUID FK → User.id ON DELETE CASCADE
├── addresseeId: UUID FK → User.id ON DELETE CASCADE
├── status: ENUM(PENDING, ACCEPTED, REJECTED)
├── createdAt: TIMESTAMP DEFAULT NOW()
└── updatedAt: TIMESTAMP

制約:
  UNIQUE(requesterId, addresseeId)        -- 重複申請防止
  CHECK(requesterId != addresseeId)       -- 自分自身へのフレンド防止

インデックス:
  INDEX(addresseeId, status)              -- 受信した申請一覧
  INDEX(requesterId, status)              -- 送信した申請一覧
  INDEX(status, createdAt DESC)           -- 未処理申請の古い順
```

**状態機械:**
```
PENDING → ACCEPTED  (受信者が承認)
PENDING → REJECTED  (受信者が拒否、再申請を防ぐためレコードは残す)
ACCEPTED → (レコード削除でフレンド解除)
```

**トランザクション例 (フレンド承認):**
```sql
BEGIN;
  UPDATE "Friendship"
    SET status = 'ACCEPTED', "updatedAt" = NOW()
    WHERE id = $friendshipId
    AND "addresseeId" = $currentUserId
    AND status = 'PENDING';

  INSERT INTO "Notification" (id, "userId", type, title, content, "relatedId", "relatedType")
  VALUES (gen_random_uuid(), $requesterId, 'FRIEND_ACCEPT',
          'フレンドリクエストが承認されました', $addresseeUsername || 'さんと友達になりました',
          $friendshipId, 'friendship');
COMMIT;
```

---

### 3-2. `Block`（ブロック）

**目的:** ユーザー間のブロック関係。チャット/通知の非表示に使用。Friendship とは独立。

```
Block
├── id: UUID PK
├── blockerId: UUID FK → User.id ON DELETE CASCADE
├── blockedId: UUID FK → User.id ON DELETE CASCADE
└── createdAt: TIMESTAMP DEFAULT NOW()

制約:
  UNIQUE(blockerId, blockedId)            -- 重複ブロック防止
  CHECK(blockerId != blockedId)           -- 自分自身をブロック防止

インデックス:
  INDEX(blockerId)                        -- ブロック一覧取得
  INDEX(blockedId)                        -- 「自分がブロックされているか」確認
```

**チャット表示ロジック (アプリケーション層):**
```
メッセージ取得時: WHERE senderId NOT IN (
  SELECT blockedId FROM Block WHERE blockerId = $currentUserId
  UNION
  SELECT blockerId FROM Block WHERE blockedId = $currentUserId
)
```

---

### 3-3. `ChatRoomMembership`（チャット部屋参加）

**目的:** ユーザーとチャットルームの N:M 関係。既読管理を兼ねる。

```
ChatRoomMembership
├── id: UUID PK
├── roomId: UUID FK → ChatRoom.id ON DELETE CASCADE
├── userId: UUID FK → User.id ON DELETE CASCADE
├── lastReadAt: TIMESTAMP NULL     -- 最後に既読にした時刻（未読バッジ計算用）
└── joinedAt: TIMESTAMP DEFAULT NOW()

制約:
  UNIQUE(roomId, userId)            -- 同じ部屋に同じユーザーが2回参加防止

インデックス:
  INDEX(userId, roomId)             -- ユーザーの参加ルーム一覧
  INDEX(roomId)                     -- ルームの参加者一覧
```

**未読数計算:**
```sql
SELECT COUNT(*) FROM "ChatMessage"
WHERE "roomId" = $roomId
  AND "createdAt" > (
    SELECT "lastReadAt" FROM "ChatRoomMembership"
    WHERE "roomId" = $roomId AND "userId" = $userId
  )
  AND "isDeleted" = false;
```

---

### 3-4. `TournamentEntry`（トーナメント参加）

**目的:** ユーザーとトーナメントの N:M 関係。シード値・最終順位を管理。

```
TournamentEntry
├── id: UUID PK
├── tournamentId: UUID FK → Tournament.id ON DELETE CASCADE
├── userId: UUID FK → User.id ON DELETE CASCADE
├── seed: INT NULL                  -- NULL = 未シード (REGISTRATION フェーズ)
├── finalRank: INT NULL             -- NULL = 進行中
└── registeredAt: TIMESTAMP DEFAULT NOW()

制約:
  UNIQUE(tournamentId, userId)      -- 同一トーナメントへの二重参加防止
  UNIQUE(tournamentId, seed)        -- 同一シードに2人割当防止（NULLは除外）

インデックス:
  INDEX(tournamentId, seed)         -- シード順でのブラケット生成
  INDEX(userId, registeredAt DESC)  -- ユーザーの参加トーナメント履歴
```

---

### 3-5. `OrgMembership`（クラン参加）

**目的:** ユーザーと組織の N:M 関係。役割（OWNER/ADMIN/MEMBER）付き。

```
OrgMembership
├── id: UUID PK
├── orgId: UUID FK → Organization.id ON DELETE CASCADE
├── userId: UUID FK → User.id ON DELETE CASCADE
├── role: ENUM(OWNER, ADMIN, MEMBER)
├── invitedBy: UUID FK NULL → User.id ON DELETE SET NULL
└── joinedAt: TIMESTAMP DEFAULT NOW()

制約:
  UNIQUE(orgId, userId)             -- 同一クランへの二重参加防止

インデックス:
  INDEX(orgId, role)                -- 役割別メンバー一覧
  INDEX(userId)                     -- ユーザーの参加クラン一覧
```

**トランザクション例 (クラン作成):**
```sql
BEGIN;
  INSERT INTO "Organization" (id, name, slug, "creatorId", ...)
  VALUES (gen_random_uuid(), $name, $slug, $userId, ...);

  INSERT INTO "OrgMembership" (id, "orgId", "userId", role)
  VALUES (gen_random_uuid(), $orgId, $userId, 'OWNER');
COMMIT;
-- ロールバック時: クランもメンバーシップも残らない（一貫性保証）
```

---

### 3-6. `UserAchievement`（実績取得）

**目的:** ユーザーと実績の N:M 関係。取得日時を記録。

```
UserAchievement
├── id: UUID PK
├── userId: UUID FK → User.id ON DELETE CASCADE
├── achievementId: UUID FK → Achievement.id ON DELETE CASCADE
└── earnedAt: TIMESTAMP DEFAULT NOW()

制約:
  UNIQUE(userId, achievementId)     -- 同じ実績の二重取得防止

インデックス:
  INDEX(userId, earnedAt DESC)      -- プロフィール表示用（最新順）
  INDEX(achievementId)              -- 実績取得者一覧
```

---


## 4. 各テーブルの定義 (DDL風)

各テーブルの物理的な構造（カラム、型、制約）です。

### 4-1. User
```sql
User (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    displayName VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(255),
    avatarUrl VARCHAR(255),
    bio TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'USER',
    isOnline BOOLEAN NOT NULL DEFAULT FALSE,
    lastSeenAt TIMESTAMP,
    bannedUntil TIMESTAMP,
    banReason VARCHAR(255),
    oauthProvider VARCHAR(50),
    oauthId VARCHAR(255),
    twoFactorEnabled BOOLEAN NOT NULL DEFAULT FALSE,
    twoFactorMethod VARCHAR(50),
    twoFactorContact VARCHAR(255),
    isEmailVerified BOOLEAN NOT NULL DEFAULT FALSE,
    deletedAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-2. UserStats
```sql
UserStats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL UNIQUE REFERENCES User(id) ON DELETE CASCADE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    totalGames INTEGER NOT NULL DEFAULT 0,
    winRate DECIMAL(5,2) NOT NULL DEFAULT 0,
    bestApm DECIMAL(8,2) NOT NULL DEFAULT 0,
    avgApm DECIMAL(8,2) NOT NULL DEFAULT 0,
    bestPps DECIMAL(6,3) NOT NULL DEFAULT 0,
    avgPps DECIMAL(6,3) NOT NULL DEFAULT 0,
    totalLinesCleared INTEGER NOT NULL DEFAULT 0,
    totalTSpins INTEGER NOT NULL DEFAULT 0,
    totalTetrises INTEGER NOT NULL DEFAULT 0,
    currentWinStreak INTEGER NOT NULL DEFAULT 0,
    bestWinStreak INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    rank VARCHAR(50) NOT NULL DEFAULT 'BRONZE',
    rankPoints INTEGER NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-3. UserGameSettings
```sql
UserGameSettings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL UNIQUE REFERENCES User(id) ON DELETE CASCADE,
    minoSkin VARCHAR(50) NOT NULL DEFAULT 'NEON',
    showGhost BOOLEAN NOT NULL DEFAULT TRUE,
    arr INTEGER NOT NULL DEFAULT 33,
    das INTEGER NOT NULL DEFAULT 170,
    dcd INTEGER NOT NULL DEFAULT 0,
    sdf INTEGER NOT NULL DEFAULT 6,
    keyBindings JSONB,
    volume INTEGER NOT NULL DEFAULT 100,
    sfxEnabled BOOLEAN NOT NULL DEFAULT TRUE,
    musicEnabled BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-4. GameResult
```sql
GameResult (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roomId VARCHAR(255) NOT NULL,
    player1Id UUID REFERENCES User(id) ON DELETE SET NULL,
    player2Id UUID REFERENCES User(id) ON DELETE SET NULL,
    winnerId UUID REFERENCES User(id) ON DELETE SET NULL,
    isAiGame BOOLEAN NOT NULL DEFAULT FALSE,
    aiDifficulty VARCHAR(50),
    player1Apm DECIMAL(8,2) NOT NULL,
    player2Apm DECIMAL(8,2),
    player1Pps DECIMAL(6,3) NOT NULL,
    player2Pps DECIMAL(6,3),
    player1LinesCleared INTEGER NOT NULL,
    player2LinesCleared INTEGER,
    player1TSpins INTEGER NOT NULL DEFAULT 0,
    player2TSpins INTEGER NOT NULL DEFAULT 0,
    player1Tetrises INTEGER NOT NULL DEFAULT 0,
    player2Tetrises INTEGER NOT NULL DEFAULT 0,
    garbageSent1to2 INTEGER NOT NULL DEFAULT 0,
    garbageSent2to1 INTEGER NOT NULL DEFAULT 0,
    durationSeconds INTEGER NOT NULL,
    gameMode VARCHAR(50) NOT NULL DEFAULT 'VERSUS',
    tournamentMatchId UUID,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-5. GameAnalytic
```sql
GameAnalytic (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    gamesPlayed INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    avgApm DECIMAL(8,2) NOT NULL DEFAULT 0,
    avgPps DECIMAL(6,3) NOT NULL DEFAULT 0,
    totalLinesCleared INTEGER NOT NULL DEFAULT 0,
    totalPlaytimeSeconds INTEGER NOT NULL DEFAULT 0,
    UNIQUE (userId, date)
);
```

### 4-6. SprintRecord
```sql
SprintRecord (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    timeMs INTEGER NOT NULL,
    lines INTEGER NOT NULL DEFAULT 40,
    pieces INTEGER,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-7. Friendship
```sql
Friendship (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requesterId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    addresseeId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (requesterId, addresseeId)
);
```

### 4-8. Block
```sql
Block (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blockerId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    blockedId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (blockerId, blockedId)
);
```

### 4-9. ChatRoom
```sql
ChatRoom (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    relatedId UUID,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-10. ChatRoomMembership
```sql
ChatRoomMembership (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roomId UUID NOT NULL REFERENCES ChatRoom(id) ON DELETE CASCADE,
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    lastReadAt TIMESTAMP,
    joinedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (roomId, userId)
);
```

### 4-11. ChatMessage
```sql
ChatMessage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roomId UUID NOT NULL REFERENCES ChatRoom(id) ON DELETE CASCADE,
    senderId UUID REFERENCES User(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    isDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    deletedAt TIMESTAMP,
    editedAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-12. Notification
```sql
Notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    relatedId UUID,
    relatedType VARCHAR(50),
    isRead BOOLEAN NOT NULL DEFAULT FALSE,
    readAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-13. Tournament
```sql
Tournament (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creatorId UUID REFERENCES User(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'REGISTRATION',
    maxPlayers INTEGER NOT NULL,
    minPlayers INTEGER NOT NULL DEFAULT 4,
    registrationDeadline TIMESTAMP,
    startedAt TIMESTAMP,
    endedAt TIMESTAMP,
    winnerId UUID REFERENCES User(id) ON DELETE SET NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-14. TournamentEntry
```sql
TournamentEntry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournamentId UUID NOT NULL REFERENCES Tournament(id) ON DELETE CASCADE,
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    seed INTEGER,
    finalRank INTEGER,
    registeredAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournamentId, userId)
);
```

### 4-15. TournamentMatch
```sql
TournamentMatch (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournamentId UUID NOT NULL REFERENCES Tournament(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    matchNumber INTEGER NOT NULL,
    player1Id UUID REFERENCES User(id) ON DELETE SET NULL,
    player2Id UUID REFERENCES User(id) ON DELETE SET NULL,
    winnerId UUID REFERENCES User(id) ON DELETE SET NULL,
    gameResultId UUID UNIQUE REFERENCES GameResult(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    scheduledAt TIMESTAMP,
    completedAt TIMESTAMP,
    UNIQUE (tournamentId, round, matchNumber)
);
```

### 4-16. Organization
```sql
Organization (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    avatarUrl VARCHAR(255),
    maxMembers INTEGER NOT NULL DEFAULT 50,
    isPublic BOOLEAN NOT NULL DEFAULT TRUE,
    creatorId UUID REFERENCES User(id) ON DELETE SET NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-17. OrgMembership
```sql
OrgMembership (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orgId UUID NOT NULL REFERENCES Organization(id) ON DELETE CASCADE,
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
    invitedBy UUID REFERENCES User(id) ON DELETE SET NULL,
    joinedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (orgId, userId)
);
```

### 4-18. Achievement
```sql
Achievement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    iconUrl VARCHAR(255),
    xpReward INTEGER NOT NULL DEFAULT 0,
    category VARCHAR(50) NOT NULL,
    isSecret BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-19. UserAchievement
```sql
UserAchievement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    achievementId UUID NOT NULL REFERENCES Achievement(id) ON DELETE CASCADE,
    earnedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (userId, achievementId)
);
```

### 4-20. ApiKey
```sql
ApiKey (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    keyPrefix VARCHAR(8) NOT NULL,
    keyHash VARCHAR(255) NOT NULL UNIQUE,
    rateLimit INTEGER NOT NULL DEFAULT 1000,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    lastUsedAt TIMESTAMP,
    expiresAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-21. FileUpload
```sql
FileUpload (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploaderId UUID REFERENCES User(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    originalName VARCHAR(255) NOT NULL,
    mimeType VARCHAR(100) NOT NULL,
    sizeBytes BIGINT NOT NULL,
    storageUrl VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    isPublic BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4-22. DataExportRequest
```sql
DataExportRequest (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    requestedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processedAt TIMESTAMP,
    fileUrl VARCHAR(255),
    expiresAt TIMESTAMP
);
```


---

## 5. カスケード削除戦略

| テーブル | 親削除時の挙動 | 理由 |
|---|---|---|
| `UserStats` | CASCADE | User に紐づく統計は User と共に削除 |
| `UserGameSettings` | CASCADE | ゲーム設定も不要 |
| `Friendship` | CASCADE | フレンド関係も消える |
| `Block` | CASCADE | ブロック関係も消える |
| `ChatMessage.senderId` | SET NULL | 発言履歴は残す（送信者は匿名化） |
| `ChatRoomMembership` | CASCADE | 退会処理 |
| `Notification` | CASCADE | 通知も不要 |
| `TournamentEntry` | CASCADE | 参加取り消し |
| `TournamentMatch.player1/2Id` | SET NULL | 試合記録は残す |
| `GameResult.player1/2Id` | SET NULL | 試合記録は残す（GDPR対応） |
| `OrgMembership` | CASCADE | クラン離脱 |
| `UserAchievement` | CASCADE | 実績も消える |
| `ApiKey` | CASCADE | APIキーも消える |
| `DataExportRequest` | CASCADE | リクエストも消える |
| `Organization.creatorId` | SET NULL | クランは残す（OWNER が引き継ぐ） |

---

## 6. インデックス戦略

```prisma
// 高頻度クエリ向けインデックス

model User {
  @@index([username])           // ユーザー検索
  @@index([email])              // ログイン
  @@index([isOnline])           // オンラインユーザー一覧
  @@index([deletedAt])          // 有効ユーザーフィルタ
}

model GameResult {
  @@index([player1Id, createdAt(sort: Desc)])   // 対戦履歴（新→旧）
  @@index([player2Id, createdAt(sort: Desc)])   // 対戦履歴
  @@index([createdAt(sort: Desc)])              // 最新試合一覧
  @@index([tournamentMatchId])                  // トーナメント結果取得
}

model GameAnalytic {
  @@unique([userId, date])                      // UPSERT 用
  @@index([userId, date(sort: Desc)])           // グラフ表示（期間指定）
}

model Friendship {
  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])               // 受信申請一覧
  @@index([requesterId, status])               // 送信申請一覧
}

model ChatMessage {
  @@index([roomId, createdAt(sort: Desc)])     // チャット履歴（最新順）
  @@index([senderId])                          // ユーザーの発言一覧
}

model Notification {
  @@index([userId, isRead, createdAt(sort: Desc)])  // 未読通知一覧
}

model TournamentEntry {
  @@unique([tournamentId, userId])
  @@unique([tournamentId, seed])
  @@index([tournamentId, seed])                // ブラケット生成
}

model TournamentMatch {
  @@unique([tournamentId, round, matchNumber])
  @@index([tournamentId, round])               // ラウンド別試合取得
}

model OrgMembership {
  @@unique([orgId, userId])
  @@index([orgId, role])                       // 役割別メンバー取得
  @@index([userId])                            // ユーザーの参加クラン
}

model UserAchievement {
  @@unique([userId, achievementId])
  @@index([userId, earnedAt(sort: Desc)])      // 実績一覧（最新順）
}

model ApiKey {
  @@index([keyHash])                           // API 認証（高頻度）
  @@index([userId, isActive])                  // ユーザーのキー一覧
}
```

---

## 7. 設計上の注意点

> [!IMPORTANT]
> **GameResult の player1Id/player2Id は SET NULL**  
> GDPR 対応のため、User 削除時に対戦記録のプレイヤー参照は NULL になります。  
> GameResult 自体は残るため、統計データの整合性は保たれます。

> [!WARNING]
> **ChatMessage のソフトデリート**  
> `isDeleted=true` 時は `content` を `[削除済みメッセージ]` に上書きします。  
> 物理削除しないことで、チャット履歴の連続性（返信スレッド等）を保ちます。

> [!IMPORTANT]
> **TournamentMatch の BYE 処理**  
> 参加者が奇数（例: 5人）の場合、最上位シードに BYE を自動付与します。  
> BYE の試合は `status='BYE'`、`player2Id=null`、`winnerId=player1Id` として即完了扱いにします。

> [!NOTE]
> **UserStats の winRate フィールド**  
> `winRate = wins / totalGames` は計算可能ですが、`ORDER BY winRate` のような  
> ソートを高速化するために DB に保存します。ゲーム終了トランザクション内で更新します。

> [!NOTE]
> **GameAnalytic (日次集計)**  
> 分析ダッシュボードで「過去 30 日間の APM 推移」を表示する際、  
> `GameResult` を毎回集計すると重い。`GameAnalytic` に日次サマリーを保持することで  
> ダッシュボードのクエリを O(30) に抑えられます。
