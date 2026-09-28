*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## 概要 (Description)
Project Tは、`ft_transcendence` 課題のために構築された、モダンでリアルタイムな対戦型テトリス風Webアプリケーションです。高い競技性と応答性の高いゲーム体験を提供することを目的としており、リアルタイムの1v1対戦、観戦モード、AI対戦相手、および完全に機能するトーナメントシステムを備えています。サーバー主導（Server-Authoritative）のゲームプレイ、チート対策、およびシームレスなリアルタイム同期を確実にするため、堅牢なバックエンドを持つフルスタックアーキテクチャを採用しています。

## インストールと実行手順 (Instructions)

### 前提条件
- **Docker** および **Docker Compose**
- **Node.js 20以上** および **npm 10以上**
- Webブラウザ (Google Chromeの最新安定版を推奨)
- マシン上でポート8080と8443が利用可能であること（既定値。`NGINX_HTTP_PORT` と
  `NGINX_PORT` で変更可能）。開発構成の直接接続用ポート3000、5173、54320、63790は
  `127.0.0.1` のみにbindし、リモートアクセスはNginxのHTTPS入口に限定します。

### セットアップと実行
1. リポジトリをクローンします:
   ```bash
   git clone <repository_url> transcendence
   cd transcendence
   ```
2. 環境変数を設定します:
   exampleファイルをコピーし、必要に応じて調整してください。
   ```bash
   cp .env.example .env
   ```
   `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` を設定して
   ください。アカウント削除はメール確認を必須とするため、SMTP未設定では
   削除を申請できません。
   42 OAuthのRedirect URIには `https://localhost:8443/api/auth/42/callback` を登録します。
   別のhost/portで提出する場合は、登録値と`.env`を同じURLへ変更してください。
3. 依存関係をインストールし、Prisma Clientを生成します:
   ```bash
   make install
   ```
   `make install` は `apps/backend/prisma/schema.prisma` から
   `prisma generate` を自動実行します。
4. Docker Composeを使用してアプリケーションを起動します:
   ```bash
   make up
   # 全イメージを再buildする場合はこちら:
   make build
   ```
   どちらもブラウザ用AIのbuildとVaultの初期化・unsealを行ってからCompose stackを起動します。
5. アプリケーションにアクセスします:
   - ブラウザを開き、`https://localhost:8443`（または設定したドメイン/IPと`NGINX_PORT`）にアクセスします。
   - *注: HTTPSに自己署名証明書を使用しているため、ブラウザのセキュリティ警告をバイパスする必要があります。*

### Prisma Clientの生成

`apps/backend/prisma/schema.prisma` を変更したとき、またはschema変更を含む
ブランチへ切り替えたときは、次を実行してください。

```bash
make generate
```

バックエンドのbuildとtype-checkでもPrisma Clientを自動生成します。Docker
imageも同じnpm scriptを使用し、開発コンテナはschema適用とNestJS起動の前に
Clientを再生成します。

### 品質確認

```bash
npm run type-check
npm run lint
npm test --workspace apps/backend -- --runInBand
node --test apps/frontend/tests/*.test.cjs
npm run build --workspace apps/frontend
npm run test:browser # Chromeと:8443のHTTPS stackが必要
npm run test:websocket # :8443のHTTPS/Socket.IO stackが必要
```

別環境を検証するときは`BROWSER_BASE_URL`を指定します。

### 秘密情報の検査とローテーション

commit前に`make secret-scan`を実行してください。`make secret-scan-history`では到達可能な
全Git履歴を監査できます。履歴で検出された資格情報は漏えい済みとして扱い、失効・再発行します。
開発用資格情報が漏えいした可能性がある場合は`make rotate-dev-secrets`を実行します。JWT/Session、PostgreSQL、
Redis、Vault KV履歴、backend用Vault tokenを更新して関連serviceを再作成するため、既存sessionは
無効になります。OAuth、SMTP、SMSの資格情報は各provider側で失効・再発行してください。

## 技術スタック (Technical Stack)
- **フロントエンドフレームワーク:** React (Vite) + TypeScript
- **バックエンドフレームワーク:** NestJS + TypeScript
- **データベース:** PostgreSQL + Prisma ORM
- **キャッシュ / 短期セキュリティ状態:** Redis
- **リアルタイム通信:** Socket.IO / WebSockets
- **ゲーム描画エンジン:** PixiJS (WebGL)
- **セキュリティ:** Nginx + ModSecurity (WAF), HashiCorp Vault (シークレット管理)

**技術選定の理由:** 
高速な開発サイクルを持つReact + Viteと、WebGL描画用のPixiJSを採用しました。NestJSはREST APIとWebSocket gatewayを管理し、PostgreSQL + Prismaが型安全なリレーショナル永続化を担います。Redisの用途はrefresh token失効、削除確認コード、Public APIレート制限です。Socket.IO roomと再接続状態は単一backendプロセスのメモリ内にあり、Redis adapterは使用していません。HTTP防御と秘密管理にはWAFとVaultを使用します。

## データベーススキーマ (Database Schema)
データベースにはPostgreSQLを使用し、Prisma経由で管理しています。コアとなるエンティティとその関係は以下の通りです：
- **User:** 認証情報、プロフィールデータ、ゲーム設定を保存。
- **GameResult:** 試合結果、APM、PPS、ライン消去数を保存。Player 1 と Player 2 (User) にリレーション。
- **Tournament:** トーナメントインスタンスと状態 (登録、進行中、完了) を管理。
- **TournamentMatch:** トーナメント内の個々の試合。GameResult と Tournament にリレーション。
- **Friendship / Block:** ソーシャル機能のためのUserモデル上の自己参照リレーション。
[schemaと同期したER図](ER.md)には、20モデル、15 enum、30 FK relationと制約を掲載しています。`node tools/schema-doc.cjs --check`で同期を確認できます。

## チーム情報 (Team Information)
- **Product Owner:** kaisuzuk
- **Project Manager:** yukusano
- **Technical Lead:** sonakamu
- **Developers:** kaisuzuk, sonakamu, ssawa, yukusano

- **sonakamu - Game Engine & Frontend Logic (Player 1)**: PixiJS描画、ゲーム状態同期、ローカル入力処理を担当。
- **ssawa - AI & Multiplayer Logic (Player 2)**: C++ヘッドレスAIの統合、衝突判定、WebSocketリアルタイム同期を担当。
- **kaisuzuk - UI/UX & React Developer (Player 3)**: ネオン調SPA、ダッシュボードチャート、トーナメント表、レスポンシブデザインの設計・開発。
- **yukusano - Backend, DevOps & Security (Player 4)**: Docker, Nginx, WAF, Vault, NestJS API, PostgreSQL, Redisなど、システムアーキテクチャ全般を管理。

## プロジェクト管理 (Project Management)
- **組織:** アジャイルライクな並行開発アプローチを採用。ボトルネックを防ぐため、専門的な役割 (フロントエンドゲーム、フロントエンドUI、バックエンド/インフラ) に分かれて作業しました。
- **タスク管理:** GitHubを使用してスプリントバックログを管理し、進捗を追跡しました。
- **コミュニケーション:** 毎日のスタンドアップとリアルタイムのコラボレーションはDiscordで実施しました。

## 機能リスト (Features List)

Custom Roomは公開（一覧表示）または非公開（一覧に表示しない）で作成でき、ownerは作成後も
公開範囲を変更できます。非公開roomには **JOIN BY ID** で入室します。Room IDを知っている人は
参加または観戦できるため、パスワード保護ではありません。

- **リアルタイム1v1対戦:** おじゃまブロック付きのサーバー主導テトリス (担当: sonakamu)。
- **トーナメントシステム:** リアルタイム進行のシングルトーナメント表 (担当: sonakamu)。
  Room ownerは4名以上であれば任意の参加人数で開始でき、4・8・16名には限定されません。
  ゲスト、ゲストowner、同じ登録アカウントからの複数接続も参加できます。全参加者が互いに異なる
  認証ユーザーの場合だけ大会表をDBへ保存し、それ以外は既存の試合結果保存を維持しながら
  サーバーのメモリ上で進行します。大会開始後に入室したユーザーは進行中の大会表を変更せず
  観戦者となり、優勝者の確定後に次回大会へ参加できるプレイヤーになります。
- **AI対戦相手:** 難易度調整可能な賢いボットとの対戦 (担当: ssawa)。
- **観戦モード:** 進行中の試合と盤面をリアルタイム観戦 (担当: sonakamu)。
- **分析ダッシュボード:** APM, PPS, 勝率の視覚的グラフ (担当: yukusano)。
- **公開API:** レート制限とAPIキー保護を備えた統計情報取得エンドポイント (担当: yukusano)。
- **ソーシャル機能:** フレンドリスト、リアルタイムチャット、プロフィールカスタマイズ (担当: yukusano)。
- **高度なセキュリティ:** ModSecurity WAF と HashiCorp Vault の統合 (担当: yukusano)。

## 評価で申告するモジュール — 基本14ポイント

以下を合格ラインの主申告とします。各モジュールに実装と実演手順があり、追加候補は実演に成功した場合だけ
別途申告します。

| モジュール | 点 | 選定理由・実装 | 主担当 | 実演 |
| --- | ---: | --- | --- | --- |
| Frontend / Backendフレームワーク | 2 | React/ViteのSPAとNestJSのREST・WebSocket backendで全体を構成。 | kaisuzuk / yukusano | stackを起動し、SPA routeとNest moduleを提示。 |
| Database ORM | 1 | PrismaでPostgreSQLのrelation、migration、constraint、型付きqueryを管理。 | yukusano | schema、migration、保存済みUser/GameResultを提示。 |
| WebSockets | 2 | Socket.IOでゲーム状態、chat、room、再接続、観戦をリアルタイム配信。 | sonakamu / ssawa | 独立したChrome contextで対戦と観戦を実演。 |
| 標準ユーザー管理 | 2 | 登録、profile、avatar、friend、presence、設定を実装。 | yukusano / kaisuzuk | 登録、profile編集、avatar設定、friend追加を実演。 |
| ゲーム統計と履歴 | 1 | 勝敗、APM、PPS、rank、progression、対戦履歴を保存・表示。 | yukusano | 対戦完了後にDashboard/Profileを表示。 |
| OAuth 2.0 | 1 | 42 OAuthをHTTPS callbackで処理し、安全にOAuth identityを作成・再利用。 | yukusano | 42 loginからprofile表示まで実演。 |
| 2FA | 1 | TOTP登録、QR、login challenge、認証、解除を実装。 | yukusano | 2FA有効化後に再loginしてcodeを入力。 |
| Webベースゲーム | 2 | 7-bag、rotation、lock delay、score、line clearを持つゲームengine。 | sonakamu / ssawa | Solo gameで主要mechanicを実演。 |
| Remote players | 2 | Server-authoritativeな2人対戦とgarbage attackを同期。 | sonakamu / ssawa | 2つのChrome contextで1v1を実演。 |
| **合計** | **14** | 合格に必要な基本申告。 |  |  |

## 追加の実装済みモジュール候補

*以下は基本14ポイントには含めません。要件全体と実演が成功した項目だけを追加申告します。
検証状況は`REMAINING_TASKS.md`を参照してください。*

### Web
1. **フロント/バックエンドにフレームワークを使用 (Major - 2pts)**: React (Vite) と NestJS。
2. **データベースにORMを使用 (Minor - 1pt)**: Prisma。
3. **WebSockets (Major - 2pts)**: ゲーム状態、チャット、ライブ観戦用のSocket.IO。
4. **ユーザー間対話 (Major - 2pts)**: リアルタイムチャット、フレンドシステム、プロフィール閲覧。
5. **高度な検索 (Minor - 1pt)**: ユーザーと対戦履歴のフィルタリング・検索。
6. **公開API (Major - 2pts)**: APIキーで保護された5つ以上のエンドポイントとSwaggerドキュメント。
7. **カスタムデザインシステム (Minor - 1pt)**: 再利用可能なネオン/サイバーパンク調UIコンポーネント。

### ユーザー管理 (User Management)
8. **標準ユーザー管理 (Major - 2pts)**: アバター、表示名、フレンド状態。
9. **ゲーム統計 (Minor - 1pt)**: APM, PPS, 勝率の追跡。
10. **OAuth 2.0 (Minor - 1pt)**: 42 イントラネット認証。
11. **二要素認証 (2FA) (Minor - 1pt)**: 認証アプリによるTOTPベースの2FA。
12. **高度な権限システム (Major - 2pts)**: BAN機能付きのAdmin/Moderatorロール。

### ゲームとUX (Game and User Experience)
13. **Webベースのゲーム (Major - 2pts)**: T-Spin、7-bagシステム、ロック遅延を備えたテトリス風ゲーム。
14. **リモートプレイヤー (Major - 2pts)**: WebSocket経由のネットワーク1v1マルチプレイヤー。
15. **マルチプレイヤー (3人以上) (Major - 2pts)**: カスタムルームと観戦ブロードキャストのサポート。
16. **ゲームのカスタマイズ (Minor - 1pt)**: キーバインド変更、ゴーストピースのON/OFF。
17. **トーナメントシステム (Minor - 1pt)**: 自動マッチメイキングとトーナメント表の進行。
18. **観戦モード (Minor - 1pt)**: 進行中の試合のライブ視聴。

### 人工知能 (Artificial Intelligence)
19. **AI対戦相手 (Major - 2pts)**: 高さ、穴、平坦さを評価するヘッドレスC++ボット。

### データと分析 (Data and Analytics)
20. **データエクスポート/インポート (Minor - 1pt)**: ユーザー設定と統計のJSON入出力。
21. **高度な分析ダッシュボード (Major - 2pts)**: ユーザーパフォーマンスのインタラクティブなチャートとグラフ。
22. **GDPRコンプライアンス (Minor - 1pt)**: パスワード/2FAでの再認証、メール確認コード、個人データの完全削除、対戦履歴の匿名保持、削除完了メール。

### サイバーセキュリティ (Cybersecurity)
23. **WAF と HashiCorp Vault (Major - 2pts)**: ModSecurityを搭載したNginxとシークレット管理用Vault。

## 個人の貢献 (Individual Contributions)
- **sonakamu**: 
  - *貢献:* PixiJS盤面描画、ローカル操作、マルチプレイヤー状態表示を実装。
  - *課題:* サーバーsnapshotを適用しながらREADY、操作中ミノ、Next/Hold、観戦遷移の整合性を維持。
- **ssawa**: 
  - *貢献:* C++ヘッドレスAIを開発し、Node.jsバックエンドに統合。コアとなる衝突判定ロジックを管理。
  - *課題:* 試合単位のC++ processを制限時間付きで管理し、返された操作列をTypeScript game engineで再生。
- **kaisuzuk**: 
  - *貢献:* React SPA、カスタムUIコンポーネント、およびチャートライブラリを使用した分析ダッシュボードの設計と開発。
  - *課題:* チャット、フレンド、トーナメント、ダッシュボードを再利用component、Zustand store、custom hookで分離。
- **yukusano**: 
  - *貢献:* Dockerインフラストラクチャ、NestJSバックエンドの設計、WAF/Vaultセキュリティの実装。
  - *課題:* RESTへのOWASP CRS検査を維持したままSocket.IOとVite開発assetだけを限定除外し、永続Vaultの初期化/unseal運用を整備。

## リソースとAIの使用 (Resources and AI Usage)
- **NestJS ドキュメント**: https://docs.nestjs.com/
- **PixiJS ドキュメント**: https://pixijs.com/
- **Socket.IO ドキュメント**: https://socket.io/
- **AIの使用状況**: 
  - *アルゴリズム支援:* 高さ、穴、凹凸などのAI評価特徴の調査・レビューに利用。最終動作はrepository内のC++ sourceとCTestで確認する。
  - *開発支援:* Docker/Vault/WAFの調査、修正案、test、文書草案に利用。採用前にsource、build、自動testで確認した。
