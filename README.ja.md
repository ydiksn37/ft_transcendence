*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## 概要 (Description)
Project Tは、`ft_transcendence` 課題のために構築された、モダンでリアルタイムな対戦型テトリス風Webアプリケーションです。高い競技性と応答性の高いゲーム体験を提供することを目的としており、リアルタイムの1v1対戦、観戦モード、AI対戦相手、および完全に機能するトーナメントシステムを備えています。

## インストールと実行手順 (Instructions)

### 前提条件
- **Docker** および **Docker Compose**
- **Node.js 20以上** および **npm 10以上**
- **GNU Make**
- Webブラウザ (Google Chromeの最新安定版を推奨)
- マシン上でポート8080と8443が利用可能であること

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
   42 OAuthのRedirect URIには `https://localhost:8443/api/auth/42/callback` を登録します。
   別のhost/portで提出する場合は、登録値と`.env`を同じURLへ変更してください。
3. Docker Composeを使用してアプリケーションをビルドし、起動します。依存関係のインストール、C++ AIのコンパイル、Vaultの初期化、データベースマイグレーションも自動的に実行されます:
   ```bash
   make build
   ```
   ビルド済みの環境を再起動する場合は、次のコマンドを使用します:
   ```bash
   make up
   ```
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

## データベーススキーマ (Database Schema)
データベースにはPostgreSQLを使用し、Prisma経由で管理しています。コアとなるエンティティとその関係は以下の通りです：
- **User:** 認証情報、プロフィールデータ、ゲーム設定を保存。
- **GameResult:** 試合結果、APM、PPS、ライン消去数を保存。Player 1 と Player 2 (User) にリレーション。
- **Tournament:** トーナメントインスタンスと状態 (登録、進行中、完了) を管理。
- **TournamentMatch:** トーナメント内の個々の試合。GameResult と Tournament にリレーション。
- **Friendship / Block:** ソーシャル機能のためのUserモデル上の自己参照リレーション。

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
- **コミュニケーション:** Discordで実施しました。隔週で対面でも集まっていました。

## 機能リスト (Features List)

- **ゲームボードUI:** ゲームボードの背景シャッフル (担当: kaisuzuk)。
- **リアルタイム1v1対戦:** おじゃまブロック付きのサーバー主導テトリス (担当: sonakamu)。
- **トーナメントシステム:** リアルタイム進行のシングルトーナメント表 (担当: sonakamu)。
- **AI対戦相手:** 難易度調整可能な賢いボットとの対戦 (担当: ssawa)。
- **観戦モード:** 進行中の試合と盤面をリアルタイム観戦 (担当: sonakamu)。
- **分析ダッシュボード:** APM, PPS, 勝率の視覚的グラフ (担当: yukusano)。
- **公開API:** レート制限とAPIキー保護を備えた統計情報取得エンドポイント (担当: yukusano)。
- **ソーシャル機能:** フレンドリスト、リアルタイムチャット、プロフィールカスタマイズ (担当: yukusano)。
- **高度なセキュリティ:** ModSecurity WAF と HashiCorp Vault の統合 (担当: yukusano)。

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
- **テトリスAI『Cold Clear』の思考部を眺める**: https://komorinfo.com/blog/cold-clear-search-algorithm/ 
- **AIの使用状況**: デバッグ、 README.md の校正
