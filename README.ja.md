*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## 概要 (Description)
Project Tは、`ft_transcendence` 課題のために構築された、モダンでリアルタイムな対戦型テトリス風Webアプリケーションです。高い競技性と応答性の高いゲーム体験を提供することを目的としており、リアルタイムの1v1対戦、観戦モード、AI対戦相手、および完全に機能するトーナメントシステムを備えています。

## インストールと実行手順 (Instructions)

### 前提条件
- **Docker** および **Docker Compose**
- **GNU Make**
- Webブラウザ (Google Chromeの最新安定版を推奨)
- マシン上でdefault portの8080、8443、54320、63790が利用可能であること（または`.env`で変更）

production deploymentで使用するNode.js、npm、CMake、OpenSSLはcontainer内で実行されます。これらを直接呼び出す任意の開発コマンドでのみhost側にも必要です。

### セットアップと実行
1. リポジトリをクローンします:
   ```bash
   git clone <repository_url> ft_transcendence
   cd ft_transcendence
   ```
2. 環境変数を設定します:
   exampleファイルをコピーし、必要に応じて調整してください。
   ```bash
   cp .env.example .env
   ```
   ローカルアカウントは42 OAuthを設定しなくても利用できます。OAuthを実演する場合は、`FT_CLIENT_ID`と`FT_CLIENT_SECRET`を設定し、Redirect URIに`https://localhost:8443/api/auth/42/callback`を登録します。別のhost/portを使用する場合は、登録値、`FT_CALLBACK_URL`、`VITE_WS_URL`、`ALLOWED_ORIGINS`を同じ接続先に合わせてください。
3. Docker Composeを使用してアプリケーションをビルドし、起動します。依存関係のインストール、C++ AIのコンパイル、Vaultの初期化、データベースマイグレーションも自動的に実行されます:
   ```bash
   make build
   ```
   `make build`は、手動で作成した`.env`を検証し、依存package、Prisma Client、共有package、C++ AIをDocker内でbuildします。その後、Git管理外の`secrets/dev/`以下のsecret生成、Vault初期化、container起動、database migration、health確認まで実行します。`.env`を自動生成または上書きすることはありません。
   ビルド済みの環境を再起動する場合は、次のコマンドを使用します:
   ```bash
   make up
   ```
   hot reloadを使用する開発構成は`make dev`で起動します。`make up`はbuild済みproduction環境を起動するだけで、依存package、C++、Vaultのbuildや再同期は行いません。
4. アプリケーションにアクセスします:
   - ブラウザを開き、`https://localhost:8443`（または設定したドメイン/IPと`NGINX_PORT`）にアクセスします。
   - *注: HTTPSに自己署名証明書を使用しているため、ブラウザのセキュリティ警告をバイパスする必要があります。*

## 技術スタック (Technical Stack)
- **フロントエンドフレームワーク:** React (Vite) + TypeScript
- **バックエンドフレームワーク:** NestJS + TypeScript
- **データベース:** PostgreSQL + Prisma ORM
- **ゲーム描画エンジン:** PixiJS (WebGL)
- **セキュリティ:** Nginx + ModSecurity (WAF), HashiCorp Vault

**技術選定の理由:** 
モダンなReact + Viteと、WebGL描画用のPixiJSを採用しました。NestJSはREST APIとWebSocket gatewayを管理し、PostgreSQL + Prismaが型安全なリレーショナル永続化を担います。

## 設計ドキュメント (Architecture Documentation)

- [サイトマップとフロントエンドルート](docs/sitemap.md)
- [全フィールド、型、制約、relationを含むデータベースER図](docs/ER.md)
- Swagger UI: アプリケーション起動中の`https://localhost:8443/api/docs`

## データベーススキーマ (Database Schema)
データベースにはPostgreSQLを使用し、Prisma経由で管理しています。特記がない限り、主キーと外部キーにはUUID形式の`String`を使用します。[docs/ER.md](docs/ER.md)には、19テーブルすべてのフィールドとPrisma型、制約、削除時の動作、Mermaid ER図を掲載しています。

| 領域 | テーブルと主要フィールド・型 | 主なrelation |
| --- | --- | --- |
| 認証・ユーザー | `User`（`email: String`、`passwordHash: String?`、`role: Role`、`twoFactorSecret: String?`）、`UserStats`（`wins: Int`、`winRate: Decimal`、`rank: Rank`）、`UserGameSettings`（`keyBindings: Json?`、`arr/das/dcd/sdf: Int`） | `User`は統計と設定をそれぞれ0または1件持つ。 |
| ゲーム・分析 | `GameResult`（`gameMode: GameMode`、APM/PPSは`Decimal`、line数は`Int`）、`GameAnalytic`（`date: DateTime`と集計値）、`SprintRecord`、`ImportedGameArchive` | 対戦結果はPlayer 1、Player 2、勝者を参照し、分析・Solo記録は1ユーザーに属する。削除されたUserと保持対象の対戦記録との参照は解除する。 |
| ソーシャル | `Friendship`（`status: FriendshipStatus`）、`Block`、`ChatRoom`（`type: ChatRoomType`）、`ChatRoomMembership`、`ChatMessage`（`content: String`） | FriendshipとBlockは2人のUserを結び、MembershipはUserとRoom、MessageはRoomと任意の送信者に属する。 |
| トーナメント | `Tournament`（`status: TournamentStatus`、`minPlayers/maxPlayers: Int`）、`TournamentEntry`、`TournamentMatch`（`round/matchNumber: Int`、`status: MatchStatus`） | EntryはUserとTournamentを結び、MatchはTournament、各Player、勝者、任意のGameResultを参照する。 |
| プラットフォーム機能 | `Achievement`、`UserAchievement`、`ApiKey`（`keyHash: String`、`rateLimit: Int`）、`FileUpload`（`mimeType: String`、`sizeBytes: BigInt`） | 中間テーブルがUserにAchievementを付与し、API keyとuploadは所有Userに属する。 |

## チーム情報 (Team Information)
- **Product Owner:** kaisuzuk
- **Project Manager:** yukusano
- **Technical Lead:** sonakamu
- **Developers:** kaisuzuk, sonakamu, ssawa, yukusano

- **sonakamu - Game Engine & Frontend Logic (Player 1)**: PixiJS描画、ゲーム状態同期、ローカル入力処理を担当。
- **ssawa - AI & Multiplayer Logic (Player 2)**: C++ヘッドレスAIの統合、衝突判定、WebSocketリアルタイム同期を担当。
- **kaisuzuk - UI/UX & React Developer (Player 3)**: レトロアーケード調SPA、ダッシュボードチャート、トーナメント表、レスポンシブデザインの設計・開発。
- **yukusano - Backend, DevOps & Security (Player 4)**: Docker, Nginx, WAF, Vault, NestJS API, PostgreSQL, Redisなど、システムアーキテクチャ全般を管理。

## プロジェクト管理 (Project Management)
- **組織:** アジャイルライクな並行開発アプローチを採用。ボトルネックを防ぐため、専門的な役割 (フロントエンドゲーム、フロントエンドUI、バックエンド/インフラ) に分かれて作業しました。
- **タスク管理:** GitHubを使用してスプリントバックログを管理し、進捗を追跡しました。
- **コミュニケーション:** Discordで実施しました。隔週で対面でも集まっていました。

## 機能リスト (Features List)

| 機能 | 説明 | 主担当 |
| --- | --- | --- |
| ローカルゲーム | Marathon、40 Lines、4-Wide、score、Hold/Next、ghost、操作設定。 | sonakamu |
| リアルタイム1v1 | Server-authoritative matchmaking、盤面同期、garbage attack、切断処理、再接続。 | sonakamu |
| Custom Room・多人数対戦 | Public/private room、Room ID参加、3人以上のgame session。 | sonakamu |
| トーナメント | 4人以上の登録、single-elimination bracket、match進行、勝者管理。 | sonakamu |
| AI対戦 | 難易度を選べるC++ AIとの対戦。 | ssawa |
| 観戦 | 進行中のTournament matchについて、両Playerの盤面と試合状態をリアルタイム表示。 | sonakamu |
| アカウント・認証 | ローカル登録/login、bcrypt password hash、42 OAuth、TOTP 2FA、refresh session、アカウント削除。 | yukusano |
| Profile・Avatar | 表示名とbioの編集、presetまたはupload/cropしたavatar、公開profile、online状態。 | ssawa |
| ソーシャル | Friend request、block、global chat、DM、chat・検索からprofileへの遷移。 | yukusano |
| ユーザー検索 | 文字列検索、online filter、rank・勝率・対戦数sort、pagination。 | ssawa |
| 統計・Progression | 対戦履歴、APM/PPS/勝率chart、期間filter、rank、XP、level、連勝、achievement。 | ssawa |
| データ可搬性 | JSON/CSV account export、PDF/CSV分析export、validation付きpreview、設定・履歴import。 | ssawa |
| Customization・Responsive UI | Key binding、操作速度、skin、背景、audio設定、再利用可能なdesign-system component、desktop/mobile layout。 | kaisuzuk |
| 公開API | API keyで保護した設定、leaderboard、profile、統計、履歴、tournament endpoint、rate limit、Swagger文書。 | yukusano |
| 管理機能 | Roleに基づくUserの閲覧、作成、編集、ban、role変更、削除。 | yukusano |
| インフラセキュリティ | Nginx HTTPS、ModSecurity/OWASP CRS、Vaultによるsecret管理、input validation、service境界の保護。 | yukusano |

## 選択モジュール (Modules)

Majorは2点、Minorは1点として計算しています。

| カテゴリ | モジュール | 区分 | 点 | 選定理由・実装 | 主担当 | 実演 |
| --- | --- | --- | ---: | --- | --- | --- |
| Web | Frontend / Backendフレームワーク | Major | 2 | REST・リアルタイム通信を一貫した構成で開発するため、React/ViteとNestJSを採用。 | kaisuzuk | 画面遷移とNestJSのmodule構成を提示。 |
| Web | Database ORM | Minor | 1 | PostgreSQLのrelation、migration、constraintを型安全に管理するため、Prismaを使用。 | yukusano | Prisma schemaを提示。 |
| Web | WebSockets | Major | 2 | 対戦中の盤面と状態を低遅延で同期するため、Socket.IOでgame、chat、room、再接続、観戦を配信。 | sonakamu | 独立したChrome contextで対戦と観戦を実演。 |
| Web | ユーザー間対話 | Major | 2 | 対戦相手との交流を支えるため、リアルタイムチャット、プロフィール閲覧、フレンド追加・解除を実装。 | yukusano | 2ユーザーでチャット、プロフィール、フレンド操作を実演。 |
| Web | 高度な検索 | Minor | 1 | 対戦相手を見つけやすくするため、ユーザー検索にオンライン状態filter、sort、paginationを実装。 | ssawa | 条件、並び順、ページを変更して検索結果を提示。 |
| Web | 公開API | Major | 2 | 外部クライアントから統計や設定を安全に利用できるよう、API key、rate limit、Swagger文書、GET/POST/PUT/DELETE endpointを実装。 | yukusano | Swagger UIから、各種endpointを実行。 |
| Web | カスタムデザインシステム | Minor | 1 | 画面間でUIとアクセシビリティを統一するため、色、typography、iconと10個以上の再利用componentを実装。 | kaisuzuk | design-system componentと使用画面を提示。 |
| User Management | 標準ユーザー管理 | Major | 2 | 継続的に対戦・交流できるよう、登録、login、profile、avatar、friend、online状態、設定を実装。 | ssawa | 登録、profile編集、avatar設定、friend追加を実演。 |
| User Management | ゲーム統計と履歴 | Minor | 1 | 成績と上達を確認できるよう、勝敗、APM、PPS、rank、level、achievement、対戦履歴を保存・表示。 | ssawa | 対戦完了後にProfileの統計、履歴、progressionを提示。 |
| User Management | OAuth 2.0 | Minor | 1 | 42アカウントでも安全にloginできるよう、HTTPS callbackでOAuth identityを作成・再利用。 | yukusano | 42 OAuth loginからprofile表示まで実演。 |
| User Management | 二要素認証 (2FA) | Minor | 1 | アカウント保護を強化するため、TOTPのQR登録、login challenge、認証、解除を実装。 | yukusano | 2FA有効化後に再loginしてTOTP codeを入力。 |
| Gaming and UX | Webベースゲーム | Major | 2 | ブラウザ上で競技性のある対戦を提供するため、7-bag、rotation、lock delay、score、line clear、勝敗条件を実装。 | sonakamu | Solo gameと1v1で主要ruleと勝敗を実演。 |
| Gaming and UX | Remote players | Major | 2 | 別端末の2人が対戦できるよう、server-authoritativeな状態管理、garbage attack、切断・再接続を実装。 | sonakamu | 2つのChrome contextで1v1と再接続を実演。 |
| Gaming and UX | マルチプレイヤー (3人以上) | Major | 2 | 3人以上が参加するゲーム体験のため、複数参加者のcustom room、状態同期、観戦broadcastを実装。 | sonakamu | 3人以上でroomへ参加し、同期された進行を提示。 |
| Gaming and UX | ゲームのカスタマイズ | Minor | 1 | プレイ環境を好みに合わせられるよう、key binding、mino skin、背景、操作速度などの設定とdefault値を実装。 | sonakamu | 設定変更後のゲーム画面と保存結果を提示。 |
| Gaming and UX | トーナメントシステム | Minor | 1 | 複数参加者の対戦順と勝者を管理するため、登録、matchmaking、bracket、match結果の進行を実装。 | sonakamu | 4人で登録し、決勝までbracketを進行。 |
| Gaming and UX | 観戦モード | Minor | 1 | 進行中の試合を他ユーザーが視聴できるよう、両プレイヤーの盤面と試合状態をリアルタイム配信。 | sonakamu | 第3ユーザーで進行中の試合を観戦。 |
| Artificial Intelligence | AI対戦相手 | Major | 2 | 1人でも対戦練習できるよう、難易度と人間的な思考時間を持つC++ AIを実装し、TypeScript game engineと統合。 | ssawa | 難易度を変更し、AIが判断して対戦する様子を提示。 |
| Data and Analytics | データエクスポート/インポート | Minor | 1 | ユーザーが設定と履歴を持ち出し・復元できるよう、JSON/CSV export、validation付きpreview、bulk importを実装。 | ssawa | exportしたデータをpreview後にimport。 |
| Data and Analytics | 高度な分析ダッシュボード | Major | 2 | プレイ傾向を比較・分析できるよう、期間filter付きの対話的chartとPDF/CSV exportを実装。 | ssawa | 期間を変更してchartを表示し、PDF/CSVを出力。 |
| **合計** |  |  | **30** |  |  |  |

## 個人の貢献 (Individual Contributions)
- **sonakamu**: 
  - *貢献:* PixiJS盤面描画、ローカル操作、マルチプレイヤー状態表示を実装。
  - *課題と解決:* Server snapshotでREADY、操作中ミノ、Next/Hold、観戦遷移がずれる問題に対し、snapshot適用処理と状態遷移を集約して表示を一致させた。
- **ssawa**: 
  - *貢献:* C++ヘッドレスAIを開発し、Node.jsバックエンドに統合。コアとなる衝突判定ロジックを管理。
  - *課題と解決:* AI processが試合終了後も残ることや遅い操作列に対し、試合単位のprocess所有、timeout、cleanup、検証済み操作列の再生を実装した。
- **kaisuzuk**: 
  - *貢献:* React SPA、カスタムUIコンポーネント、およびチャートライブラリを使用した分析ダッシュボードの設計と開発。
  - *課題と解決:* 共有状態とUI重複による保守性低下に対し、チャット、フレンド、トーナメント、分析を再利用component、Zustand store、custom hookへ分離した。
- **yukusano**: 
  - *貢献:* Dockerインフラストラクチャ、NestJSバックエンドの設計、WAF/Vaultセキュリティの実装。
  - *課題と解決:* OWASP CRSがSocket.IOの長時間通信とVite assetに干渉する問題に対し、REST検査を維持した限定的な除外を設定し、Vaultの初期化とunsealをscript化した。

## リソースとAIの使用 (Resources and AI Usage)
- **NestJS ドキュメント**: https://docs.nestjs.com/
- **PixiJS ドキュメント**: https://pixijs.com/
- **Socket.IO ドキュメント**: https://socket.io/
- **Prisma ドキュメント**: https://www.prisma.io/docs
- **OWASP Core Rule Set ドキュメント**: https://coreruleset.org/docs/
- **HashiCorp Vault ドキュメント**: https://developer.hashicorp.com/vault/docs
- **テトリスAI『Cold Clear』の思考部を眺める**: https://komorinfo.com/blog/cold-clear-search-algorithm/ 
- **AIの使用状況**: 実行時・描画問題の原因調査、設定とsecurity-sensitiveなcodeのreview、cleanupとvalidation caseの提案、READMEと設計文書の校正に使用しました。提案は各担当者がsubjectと実装に照らしてreviewし、採用した変更は内容に応じてtype-check、lint、test、またはbrowserで確認しました。
