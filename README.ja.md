*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## 概要 (Description)
Project Tは、`ft_transcendence` 課題のために構築された、モダンでリアルタイムな対戦型テトリス風Webアプリケーションです。高い競技性と応答性の高いゲーム体験を提供することを目的としており、リアルタイムの1v1対戦、観戦モード、AI対戦相手、および完全に機能するトーナメントシステムを備えています。サーバー主導（Server-Authoritative）のゲームプレイ、チート対策、およびシームレスなリアルタイム同期を確実にするため、堅牢なバックエンドを持つフルスタックアーキテクチャを採用しています。

## インストールと実行手順 (Instructions)

### 前提条件
- **Docker** および **Docker Compose**
- **Node.js 20以上** および **npm 10以上**
- Webブラウザ (Google Chromeの最新安定版を推奨)
- マシン上でポート 80, 443, 3000 が利用可能であること。

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
3. 依存関係をインストールし、Prisma Clientを生成します:
   ```bash
   make install
   ```
   `make install` は `apps/backend/prisma/schema.prisma` から
   `prisma generate` を自動実行します。
4. Docker Composeを使用してアプリケーションを起動します:
   ```bash
   make up
   # または docker-compose up --build
   ```
5. アプリケーションにアクセスします:
   - ブラウザを開き、`https://localhost` (または適切なドメイン/IP) にアクセスします。
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

## 技術スタック (Technical Stack)
- **フロントエンドフレームワーク:** React (Vite) + TypeScript
- **バックエンドフレームワーク:** NestJS + TypeScript
- **データベース:** PostgreSQL + Prisma ORM
- **インメモリキャッシュ / Pub/Sub:** Redis
- **リアルタイム通信:** Socket.IO / WebSockets
- **ゲーム描画エンジン:** PixiJS (WebGL)
- **セキュリティ:** Nginx + ModSecurity (WAF), HashiCorp Vault (シークレット管理)

**技術選定の理由:** 
高速な開発サイクルと豊富なエコシステムを持つ React + Vite を採用し、高パフォーマンスな60FPSのWebGLゲーム描画を行う PixiJS と簡単に統合しました。NestJS は、REST APIとWebSocketゲートウェイをシームレスに管理するための堅牢でモジュール化されたアーキテクチャを提供します。PostgreSQL + Prisma により型安全でリレーショナルなデータ管理を実現し、Redis はスケーラブルなセッション管理とソケットのブロードキャストを処理します。さらに、エンタープライズレベルの防御とシークレット管理を提供するために、WAFとVaultを統合しました。

## データベーススキーマ (Database Schema)
データベースにはPostgreSQLを使用し、Prisma経由で管理しています。コアとなるエンティティとその関係は以下の通りです：
- **User:** 認証情報、プロフィールデータ、ゲーム設定を保存。
- **GameRecord:** 試合結果、APM、PPS、ライン消去数を保存。Player 1 と Player 2 (User) にリレーション。
- **Tournament:** トーナメントインスタンスと状態 (登録、進行中、完了) を管理。
- **Match:** トーナメント内の個々の試合。GameRecord と Tournament にリレーション。
- **Friendship / Block:** ソーシャル機能のためのUserモデル上の自己参照リレーション。
*(詳細なエンティティ・リレーション図については `ER.md` を参照)*

## チーム情報 (Team Information)
- **sonakamu - Game Engine & Frontend Logic (Player 1)**: PixiJS描画、ゲーム状態同期、ローカル入力処理を担当。
- **ssawa - AI & Multiplayer Logic (Player 2)**: C++ヘッドレスAIの統合、衝突判定、WebSocketリアルタイム同期を担当。
- **kaisuzuk - UI/UX & React Developer (Player 3)**: ネオン調SPA、ダッシュボードチャート、トーナメント表、レスポンシブデザインの設計・開発。
- **yukusano - Backend, DevOps & Security (Player 4)**: Docker, Nginx, WAF, Vault, NestJS API, PostgreSQL, Redisなど、システムアーキテクチャ全般を管理。

## プロジェクト管理 (Project Management)
- **組織:** アジャイルライクな並行開発アプローチを採用。ボトルネックを防ぐため、専門的な役割 (フロントエンドゲーム、フロントエンドUI、バックエンド/インフラ) に分かれて作業しました。
- **タスク管理:** GitHubを使用してスプリントバックログを管理し、進捗を追跡しました。
- **コミュニケーション:** 毎日のスタンドアップとリアルタイムのコラボレーションはDiscordで実施しました。

## 機能リスト (Features List)
- **リアルタイム1v1対戦:** おじゃまブロック付きのサーバー主導テトリス (担当: sonakamu)。
- **トーナメントシステム:** リアルタイム進行のシングルトーナメント表 (担当: sonakamu)。
- **AI対戦相手:** 難易度調整可能な賢いボットとの対戦 (担当: ssawa)。
- **観戦モード:** 進行中の試合と盤面をリアルタイム観戦 (担当: sonakamu)。
- **分析ダッシュボード:** APM, PPS, 勝率の視覚的グラフ (担当: yukusano)。
- **公開API:** レート制限とAPIキー保護を備えた統計情報取得エンドポイント (担当: yukusano)。
- **ソーシャル機能:** フレンドリスト、リアルタイムチャット、プロフィールカスタマイズ (担当: yukusano)。
- **高度なセキュリティ:** ModSecurity WAF と HashiCorp Vault の統合 (担当: yukusano)。

## モジュール (合計: 35 pts)
*注: ポイント計算: メジャー = 2pts, マイナー = 1pt*

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
  - *貢献:* PixiJSレンダリングエンジン全体を構築し、ローカル入力の遅延緩和処理を実装。
  - *課題:* 高速な60FPSのローカル入力とサーバー状態を、視覚的なカクつきなしに同期させること。クライアント側の予測（Client-side prediction）とサーバー和解（Server reconciliation）を実装して解決した。
- **ssawa**: 
  - *貢献:* C++ヘッドレスAIを開発し、Node.jsバックエンドに統合。コアとなる衝突判定ロジックを管理。
  - *課題:* 初期状態のAIが完璧すぎて勝てなかったこと。人為的な「思考遅延」と、人間らしいミスをシミュレートする非最適手の確率マトリクスを導入して解決した。
- **kaisuzuk**: 
  - *貢献:* React SPA、カスタムUIコンポーネント、およびチャートライブラリを使用した分析ダッシュボードの設計と開発。
  - *課題:* 複数のリアルタイムコンポーネント（チャット、フレンドリスト、トーナメント表）にまたがる複雑な状態管理。React Contextとカスタムフックを活用し、UIから状態管理を分離することで解決した。
- **yukusano**: 
  - *貢献:* Dockerインフラストラクチャ、NestJSバックエンドの設計、WAF/Vaultセキュリティの実装。
  - *課題:* RESTエンドポイントへの厳格な保護を維持しつつ、高頻度のWebSocketパケットをModSecurityがブロックしないように設定すること。Socket.IOトラフィックをWAFの検査から除外するカスタムSecRulesを記述して解決した。

## リソースとAIの使用 (Resources and AI Usage)
- **NestJS ドキュメント**: https://docs.nestjs.com/
- **PixiJS ドキュメント**: https://pixijs.com/
- **Socket.IO ドキュメント**: https://socket.io/
- **AIの使用状況**: 
  - *アルゴリズム支援:* テトリスAIの評価関数（平坦さや穴のペナルティ計算）を最適化するためにAIを活用し調査した。
  - *デバッグ:* 複雑なDockerネットワーキングやVaultの初期化エラーの追跡・解決にAIを利用した。
