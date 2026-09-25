# Remaining Tasks for `ft_transcendence`

この文書は、`subject.md`、`proceed.md`、README、および現在の実装を比較した監査結果に基づく残タスク一覧です。

- 最終更新: 2026-09-23
- 判定基準: `subject.md` version 21.1
- 現在の厳格な静的評価: 約12ポイントを強く主張可能
- 注意: 未完成のモジュールは部分点ではなく0点として扱われる

## 完了済み

- [x] ユーザーデータのエクスポートを許可リスト方式へ変更
- [x] エクスポートから `passwordHash` と `twoFactorSecret` を除外
- [x] ゲーム設定更新をDTO化
- [x] 設定インポートをネストしたDTOで検証
- [x] 管理者のロール変更・BAN・ページング入力をDTO化
- [x] フロントエンドの `durationDays` とバックエンドのBAN期間処理を一致させる
- [x] 管理者向けユーザー情報レスポンスを許可リスト化
- [x] 本人・公開プロフィールから `twoFactorSecret` を除外
- [x] 上記に対する単体テストを追加（バックエンド111テスト成功）

## 確認済みエラー履歴

この表は、監査・修正作業中にコマンド出力または画面上で確認できたエラーを
記録する。未解消のものは、対応する残タスクを完了するまで削除しない。

| 状態 | 発生箇所・操作 | エラー / 症状 | 原因・対応 |
| --- | --- | --- | --- |
| 解消済み（テスト環境制約） | 2026-09-23 Public API HTTPテスト | `listen EPERM 0.0.0.0`、続いてSupertestのport取得エラー | 一時リスナーを127.0.0.1に限定し、許可された制限外実行で成功。DB/Redisはテスト用代替実装。制限内ではローカルlistenの許可が別途必要 |
| 修正済み・実ブラウザ再確認待ち | Human vs AIの開始 | 人間のREADY終了前にAIが動く | サーバーとブラウザの独立した1秒タイマーが原因。ブラウザのREADY完了通知を受けてAIを開始する方式へ変更。試合/送信者確認、重複・遅延通知、退出時のキャンセルをテスト。2026-09-23 backend 133件、frontend全3テストファイル成功、型チェック・frontend本番build成功。C++変更なし |
| 解消済み | `npm run build --workspace=@transcendence/frontend` | `AiPreviewPage.tsx(560,8): TS2741`。`TetrisUIProps` が要求する `combo` が渡されていない | 2026-09-18、サーバーのcomboを渡し、production build成功 |
| 解消済み | `node --test apps/frontend/tests/multiplayer.test.cjs` | Game over後の観戦状態について、期待値 `SPECTATING` と実装側の状態が一致しない | 2026-09-18、明示的なREADY以外は観戦へ遷移。観戦READY中の個人盤面も拒否。観戦5件・入力5件成功 |
| 解消済み | 2026-09-18 public profile実装時のbuild | `TS1294`。`erasableSyntaxOnly` ではconstructor parameter propertyを利用できない | エラー型のstatusを通常のクラスフィールドへ変更。frontend production build成功 |
| 未解消 | 2026-09-18 `npm audit --json` | registry接続が `EAI_AGAIN`。制限外実行も承認拒否 | npm registryへの依存名・バージョン送信について実行環境が拒否。監査・更新は未実施。ユーザーの明示承認が必要 |
| 未解消 | 2026-09-18 frontend production build | 500 kBを超えるJSチャンクのwarning | 本番ビルド自体は成功。適切なコード分割を検討し、単に警告閾値を上げて隠さない |
| 未解消 | Chrome 147、トップページ | PixiJSが `renderer.plugins.interaction has been deprecated, use renderer.events` をconsoleへ出力 | PC・タブレット・スマホの全viewportで再現。依存ライブラリと`BackgroundTetris`の利用方法を更新し、production buildでも再確認する |
| 未解消 | Chrome 147、390x844 viewport | トップ画面のタイトル、幅360pxのボタン、背景盤面が右側でクリップされる | 390px幅に固定幅と配置計算が収まっていない。スマホ用の幅をviewport基準にして実機相当で再確認する |
| 未解消 | Docker image build | npmがModerate 1件、High 12件、合計13件の脆弱性を報告 | `npm audit` で到達可能性を確認し、互換性を保って更新する。第1A項に登録済み |
| 解消済み | Backend type-check | Prisma Clientがschemaより古く、`twoFactorSecret` 関連のTypeScriptエラーが8件発生 | build/type-check/Docker起動前に同一schemaから `prisma generate` するよう統一 |
| 解消済み | Vite CSS読み込み | `[plugin:vite:css] [postcss] ENOENT: no such file or directory, open 'tailwindcss'` | 存在しないTailwind importへの依存を除去。現在のソースに `tailwindcss` 参照がないことを確認 |
| 一時的・解消済み | Nodemailer依存追加 | npm registryへの接続が `EAI_AGAIN` で失敗 | sandbox外の許可済みnpm通信で再実行し、lockfile整合性を `npm ci --dry-run` で確認 |
| 解消済み（原因未確定） | `make re` | 過去にビルド失敗。ディスク容量不足が原因の可能性あり | 空き容量確保後の2026-09-15に再実行して成功。空き213GB、全image build成功、全6コンテナ起動、nginx/PostgreSQL/Redis/Vaultのhealthcheck成功を確認。元の失敗ログがないため原因自体は未確定 |

2026-09-18時点でfrontendの `combo` prop不足は解消し、production buildは成功。
チャンクサイズwarningは残っている。GDPR変更時のbackend build、全workspaceの
type-check、backend Jest 111件は過去の成功記録であり、今回の全体再検証とは区別する。

`make re` が生成するfrontend imageはdevelopment targetであり、Viteの
production buildを実行していない。そのため、`make re` の成功だけでは
production buildの成功を保証しない。

## P0: 提出前に必ず修正する項目

### 1. 秘密情報を失効・除去する（後回し）

- [ ] `.env.example` のJWT、DB、Redis、OAuth、SMTP等の値をプレースホルダーへ置換
- [ ] 実際に使用された可能性のある資格情報を失効・再発行
- [ ] Git履歴に秘密情報が残っていないか確認
- [x] `.env` がGit管理対象外であることを再確認

完了条件:

- `.env.example` に実際の秘密情報がない
- リポジトリ内の秘密情報検査で問題が出ない

#### 1A. npm依存関係の脆弱性を解消する

2026-09-15のDocker image再ビルド時に、npmから次の報告があった。

- Moderate: 1件
- High: 12件
- 合計: 13件

残タスク:

- [ ] `npm audit` で直接依存・間接依存と影響範囲を特定
- [ ] 互換性を維持できる範囲で依存関係とlockfileを更新
- [ ] `npm audit fix --force` を無条件に使用せず、破壊的更新を個別確認
- [ ] 修正後にtype-check、Jest、frontend build、backend Docker buildを再実行
- [ ] 更新できない脆弱性は到達可能性、理由、緩和策をREADMEへ記録

完了条件:

- High/Criticalが0件、または到達不能であることを根拠付きで説明できる
- 依存関係更新後も全テストとDocker buildが成功する

### 2. Prisma Clientの生成ずれを修正する（完了）

- [x] `prisma generate` を実行し、schemaと生成済みClientを同期
- [x] `twoFactorSecret` に関する8件のTypeScriptエラーを解消
- [x] ローカルとDockerの両方で同じ生成手順を使用
- [x] 生成が必要なタイミングをMakefileおよびREADMEへ明記

完了条件:

```bash
npm run type-check --workspace @transcendence/backend
```

が成功すること。

### 3. 残りのHTTP入力をDTO化する（完了）

- [x] フレンド申請の `addresseeId` / `username`
- [x] フレンド承認・拒否の `accept`
- [x] フレンド、ブロック、プロフィール、履歴URLのUUIDパラメーター
- [x] ユーザー検索の `page` / `limit` / `status` / `sortBy`
- [x] 対戦履歴検索の `page` / `limit` / `mode` / `result`
- [x] Tournament作成・一覧・参加・開始
- [x] Public APIのquery/paramおよびAPIキー作成・失効
- [x] Game resultおよびSprint record登録
- [x] Auth、Chat、Analyticsを含む残りのHTTP入力
- [x] HTTPコントローラーの認証済みユーザー型から `any` を除去

完了条件:

- [x] HTTPコントローラーの入力に `any` がない
- [x] 数値範囲、enum、文字数、UUID、未知フィールドを検証している
- [x] 不正入力が400になり、500やPrismaエラーにならない

### 4. WebSocket payloadを検証する（後回し）

- [ ] ゲーム入力イベントをスキーマまたはDTOで検証
- [ ] ルーム作成・参加・再戦イベントを検証
- [ ] AI対戦イベントを検証
- [ ] チャット参加・送信イベントを検証
- [ ] 盤面、next、garbage等にサイズ・型・値域制限を設ける
- [ ] 不正イベントを切断またはエラー応答し、サーバーを停止させない

### 5. チャットの認可を修正する（完了）

- [x] RESTでメッセージを取得する前にroom membershipを確認
- [x] WebSocketの `chat:join` でmembershipを確認
- [x] メッセージ保存時にも送信者のmembershipを再確認
- [x] 他人のDIRECT/GAMEルームを推測したIDで閲覧できないことをテスト

### 6. HTTPS・ポート・起動手順を一致させる（後回し）

- [ ] READMEの `https://localhost`、80/443記述をComposeの8080/8443と一致させる
- [ ] HTTPからHTTPSへのリダイレクト先へ正しいHTTPSポートを含める
- [ ] `.env.example` の `http://` / `ws://` を提出環境用HTTPS/WSS設定へ整理
- [ ] OAuth callback URLを実際の公開URLと一致させる
- [ ] 外部からbackend、DB、Redis、Vaultへ直接接続する必要がないポートを閉じる
- [ ] 最新ChromeでMixed Contentが発生しないことを確認

### 7. GDPR削除処理を完成させる（完了）

- [x] UIの「永久削除」と実際のソフトデリートの矛盾を解消
- [x] 個人情報を削除または匿名化
- [x] 関連データの保持・削除方針を決定
- [x] 削除確認フローを実装
- [x] 削除完了メールを実装
- [x] 削除後にログイン・検索・プロフィール取得できないことをテスト

### 8. Chromeで必須動作を確認する

- [ ] ブラウザconsoleのerror/warningを0にする
- [ ] 複数ユーザーが同時利用できることを確認
- [ ] 2人・3人対戦、再戦、切断、復帰を確認
- [ ] 非アクティブタブから復帰した場合の描画・同期を確認
- [x] Privacy PolicyとTerms of Serviceへ未ログイン状態でも到達可能か確認
- [ ] PC・タブレット・スマートフォン相当の表示を確認

2026-09-15 自動確認結果（Google Chrome 147.0.7727.116）:

- HTTPS経由でトップ、Privacy Policy、Terms of ServiceがHTTP 200
- 未ログインのヘッドレスChromeでPrivacy PolicyとTerms of ServiceのReact描画を確認
- 1440x900、1024x768、390x844でトップページを描画・撮影
- 1440x900と1024x768ではトップページに明らかなクリップなし
- 390x844では右端のクリップがあるため、スマートフォン表示は未合格
- 全3 viewportでPixiJSの非推奨warningが出るため、console 0件は未合格
- keyboard controlsテストは成功
- multiplayerテストは3件中2件成功、観戦遷移1件失敗
- 複数ユーザー、2人・3人の実対戦、再戦、切断復帰、非アクティブタブ復帰は
  認証済みの複数ブラウザ操作または人間による実機確認が必要

## P1: 14ポイントを確実にするための項目

### 9. 他ユーザーのプロフィール画面を修正する

- [x] `/profile/:id` のルートを追加するか、検索画面の遷移先を既存ルートへ合わせる
- [x] プロフィール、avatar、オンライン状態、戦績、フレンド操作を表示
- [x] 削除済み・存在しないユーザーを適切に処理

2026-09-18: 自分用の編集画面とは別に閲覧画面を追加。公開プロフィールAPI、
対象者視点の履歴、フレンド申請/承認/拒否/取り消し/削除を接続。
404/400はnot found表示、401はログインへ、その他の失敗には再試行を用意。
画面切替時のリクエストは中断し、旧ユーザーの結果を新しい画面に表示しない。
`public-profile.test.cjs` 5件（API取得/失敗/中断、操作ID、画面分岐）が成功。
既存の入力・観戦テストと合わせてfrontend 15件、本番ビルド成功。
backendの `users.service.spec.ts` 10件も成功（削除済みユーザーの取得拒否を含む）。
実ブラウザでの外観・操作確認は第8項で引き続き実施する。

影響するモジュール:

- User interaction
- Standard user management

### 10. リモート対戦の再接続を実装する（後回し）

- [ ] 一時切断で即敗北にしない猶予時間を追加
- [ ] user IDまたは再接続tokenで元のPlayerStateへ復帰
- [ ] 復帰時にサーバーの完全な盤面状態を送る
- [ ] 猶予時間超過後のみ敗北として確定
- [ ] Random、Custom、Tournamentで挙動を統一

影響するモジュール:

- Remote players
- WebSockets

### 11. 観戦モードの失敗テストを修正する

- [x] Game over後の観戦遷移で `VS_SCREEN` ではなく `SPECTATING` になるよう修正（明示的なREADYでは開始イベントを待つ）
- [x] 古いplayer stateと遅延イベントを破棄（試合切替の回帰テスト）
- [ ] Tournament終了後に盤面が重複表示されないことを実ブラウザで確認（hookの盤面差し替えテストは成功）
- [x] ESCで観戦から退出できることを確認（入力hookテスト、game over後・キー変更も検証）

完了条件:

```bash
node --test apps/frontend/tests/multiplayer.test.cjs
```

が全件成功すること。

### 12. Tournament実装を一本化する（後回し）

- [ ] DBベースのTournamentとインメモリCustom Room Tournamentの責務を整理
- [ ] bracket進行とGameResultをDBへ接続
- [ ] BYE、切断、再戦、優勝確定を一つの状態遷移で処理
- [ ] Tournament終了後に古いroom/stateを破棄

### 13. OAuth・2FAを実環境で確認する

- [ ] Prisma Client修正後に2FA登録・QR・ログイン・解除を確認
- [ ] OAuth callbackをHTTPS環境で確認
- [ ] OAuthのみのユーザーとpasswordユーザーの両方を確認
- [ ] 2FA secretがどのAPIレスポンスにも含まれないことを統合テスト

2026-09-24: 2FA有効化済みでもgenerateでsecretを置換できる問題を修正（409）。
generate/有効化/解除は読み出したsecretと最新DB値が一致する場合のみ更新し、競合で409。
2FAログインでは有効状態・削除・BANを再確認。7テストとbackend type-check成功。
登録APIのsecret/QRは本人の初期設定に必要な例外であり、有効化・解除・ログイン応答には
保存secretを含めないことを単体で確認。全API統合試験・HTTPS/OAuth試験は未実施。

## P2: READMEで申告するなら完成が必要なモジュール

### 14. Public API

- [x] GETだけでなくPOST/PUT/DELETEを含むAPIを用意（APIキー所有者のゲーム設定CRUD）
- [x] 5つ以上の有用なendpointを保証（既存5GET＋設定4操作、Swagger契約テスト）
- [x] API key認証、失効、期限、rate limitをテスト（service/guard単体テスト）
- [x] Swaggerの例・エラー応答・認証方法を完成（Public API 9操作＋APIキー管理3操作）

2026-09-23: 不正なAPIキーヘッダーをDB/ハッシュ処理前に拒否。有効期限ちょうども
失効扱いとし、削除済み/BAN中の所有者のキーも拒否する検索条件へ変更。
RedisのカウントとTTL設定を単一Luaスクリプトで行い、期限設定の中断による永久制限を防止。
認証、失効、期限、所有者確認、レート上限、発行時のみキー本体を返すことをテスト。
backend全17 suite / 151テスト、type-check成功。Redisスクリプトの実サーバー試験と
実DB/RedisのE2Eは未実施で、第26項に残る。

2026-09-23追記: `/api/public/me/settings` にGET/POST/PUT/DELETEを実装。
所有者はAPIキーから取得し、本文のuserId等は拒否。PUTは省略フィールドをschema既定値へ
戻す置換、POST重複は409、存在しないPUT/GETは404、DELETEは冪等204。
Swaggerへ設定例、認証・入力・失効・制限の応答説明を追加し、READMEへ利用方法を記載。
実Nest HTTPパイプライン＋DB/Redis代替実装でCRUD、所有者分離、認証、DTO、レート制限を検証。
backend全19 suite / 167テストとtype-check成功。HTTPテストにはloopback listen許可が必要。
既存GETの詳細な応答schema/例は未整備のため、Swagger項目はまだ未完了。

2026-09-23追記: 一覧のlimit=100に対し履歴・大会のskipが50刻みとなる重複を修正。
全3一覧でskip/takeを統一し、同点・同日時の順序をIDで安定化。
Swaggerのゲームモード・大会状態をPrisma enumに合わせ、ページングの範囲も明示。
205件を100件ずつ取得する回帰テストとDTO境界テストを追加し、設定CRUDを含む17テスト成功。
実DBでの検証や詳細な応答schemaの整備は未完了。

2026-09-23追記: Public APIのJSON成功応答8操作へ詳細schemaとフィールド例を追加。
Decimalの文字列化、削除済み参加者のnull、ページング、統計・設定項目を明記。
ポートを開かずSwaggerを生成する契約テストを追加し、関連19テスト成功。
APIキー管理側の応答schemaと共通エラー本文の詳細例は引き続き未完了。

2026-09-23追記: 上記Swaggerの残件を完了。キー発行・一覧・失効の応答schema、
発行リクエスト例、400/401/404/409/429の本文schema・例を追加。
キー管理はBearer認証、Public APIはX-API-Key認証と区別し、生成ドキュメント12操作を検証。
キー本体は発行時のみ、一覧にハッシュや秘密値を含めない契約も記載。
関連4 suite / 23テスト、backend type-check成功。実DB/Redis検証は第26項に残る。

### 15. User statistics

- [x] Achievement付与ロジックを実装（5条件、重複付与・XP二重加算を防止）
- [ ] AchievementとprogressionをUIに表示
- [x] XP、level、rankPointsの更新ルールを実装（READMEに対象モード・境界値を明記）
- [ ] leaderboardと実データを一致させる

2026-09-23: 結果保存後に統計をfire-and-forgetで更新する処理を廃止し、結果・両者の統計・
日次集計をSerializable transactionに統一。競合は最大3回試行後409、他の失敗は伝播させる。
未作成のUserStatsを初期化し、これまで加算されなかった累計T-spin/Tetris回数を更新。
単体4テストで両者更新・失敗伝播・競合再試行・ゲスト除外を確認。
実DBでのrollback/並行保存は未検証。ランク更新・実績付与/UI等は引き続き未完了。

2026-09-23追記: 登録済み人間同士の対戦のみランクを勝利+25/敗北-15（最低0）、
500点ごとの6段階へ更新。既存の勝利50XP/その他20XP、1000XPごとのレベル更新を文書化。
ソロを勝利として計上しないよう修正し、引き分け・ソロは勝敗や連勝を変更しない。
Gatewayから勝者のプレイヤー側も渡し、IDを持たないAI/ゲストへの敗北と引き分けを区別。
関連19テスト・type-check成功。旧統計の再集計は未実施（過去の勝者IDのみでは判定不能な試合あり）。

2026-09-24: 初勝利・10勝・100ゲーム・累計10T-spin・100Tetrisの実績を実装。
定義は初回付与時にupsert、UserAchievementの複合unique＋skipDuplicatesで二重付与を防止。
新規付与分のみ報酬XPを加算し、レベルまで結果と同じtransactionで更新。
実績表示API/UIは未実装で次の作業。実DB並行試験は第26項に残る。

2026-09-24追記: 認証ユーザー本人の `/api/users/me/progression` を追加し、プロフィールに
5実績の取得状態・条件進捗・報酬XP、レベル進捗・ランクポイントを表示。
欠損統計は初期値、削除済みユーザーは404。付与済みと条件達成のみの状態を区別する。
通信失敗の明示・再試行・unmount時のabortを実装。関連20テスト成功。
実ブラウザでのレイアウト・遷移・再試行確認は未実施のため、UI項目はまだ未チェック。

2026-09-24追記: Advanced Searchへランクポイント降順と実際のrank/RP表示を追加。
APIの同点順序をIDで固定。検索確定時にページ1と確定クエリを同時反映し、古い通信をabortして
遅い旧応答の上書きを防止。取得エラーと再試行も表示。検索・進捗の4テスト、型チェック、
frontend build成功（既存chunk警告あり）。実DB・ブラウザでのランキング一致検証は未完了。

### 16. Advanced permissions

- [ ] 管理者によるユーザー作成・編集・削除を追加
- [x] ADMIN/MODERATOR/USER/GUESTの権限表を定義（README、既存ロール/BAN APIの範囲）
- [x] MODERATORがADMINや他のMODERATORをBANできないよう階層を検証
- [x] 自分自身のBANや最後のADMIN削除などを防止
- [ ] 操作監査ログを検討

2026-09-18: 管理操作へ認証済み操作者IDを渡し、最新DB権限を検証。
自己BAN/解除/ロール変更を禁止し、最後の有効なADMINの降格・BAN・GDPR削除を拒否。
確認と書き込みをSerializable transactionへまとめ、競合は最大3回試行後409。
権限階層、失効した権限、削除済み対象、最後の管理者、競合再確認の回帰テストを追加。
backend全14 suite / 130テストとtype-check成功。実DBでの並行操作は未検証。
管理者のユーザー作成/編集/削除APIは未実装のため、第16項全体は未完了。

2026-09-24追記: ADMIN専用POST `/api/admin/users` とPATCH `/api/admin/users/:id` を追加。
作成はUSER固定・password hash化・統計/設定の初期化、編集は表示名/自己紹介のみ。
ルートguardに加えtransaction内でも最新のADMIN権限・BAN・削除状態を確認。
秘密値を含まないselect、重複409、未知の権限/資格情報フィールド拒否をテスト。
管理UIと管理者削除は未実装のため項目は未チェックを維持。

2026-09-24追記: AdminPanelにADMIN専用の作成フォーム・表示名/自己紹介の編集フォームを追加。
同期refで連続送信を防止し、送信中フォームを無効化、エラー/完了を明示。
送信後はパスワードを消去。自分への編集・ロール変更UIを無効化し、編集用に管理者一覧へbioを追加。
frontend buildと管理API7テスト成功。実ブラウザの作成/編集送信と削除機能は未完了。

2026-09-24追記: ADMIN専用DELETE `/api/admin/users/:id` を追加し、UIで対象usernameの
入力確認後にのみ送信。自己削除・非ADMIN/削除済み/BAN中の操作者・最後の有効ADMINを拒否。
対象読み込みと削除をSerializable transactionで実施。既存のGDPR後処理を共通化して
ファイル整理・削除コード破棄・完了メールを再利用。実データ削除は行わず、代替DBで検証。
関連19テストとfrontend build成功。管理CRUDの実DB/ブラウザ操作確認は残るため未チェック。

2026-09-24追記: localhostのNest HTTPテストで管理CRUDのルーティング、CurrentUserの
操作者ID受け渡し、RolesGuard、DTO、UUID検証を確認。非ADMIN全3roleを403、
未認証401、資格情報/権限注入・無効UUID・削除確認欠落を400として拒否。
表示名nullがDTOを通る点も修正。HTTP＋serviceの18テスト成功。
JWT検証とDB保存は代替実装なので本番認証・実DB統合の確認とは区別する。

### 17. Customization

- [ ] `minoSkin` を実ゲーム描画へ反映
- [ ] `showGhost` を実ゲームへ反映
- [ ] theme/map/background選択をユーザー設定として保存
- [ ] カスタムルールとデフォルトルールをUI上で明確化
- [ ] 設定が対戦相手やサーバールールを不正に変更しないよう分離

2026-09-24: SettingsにshowGhostとNEON/RETRO/MINIMAL選択を追加し、useConfig経由で
ゲストはlocalStorage、認証ユーザーは既存設定APIへ保存。DB読み込みも反映。
PlayPage→TetrisUI→自分のGameBoardへ渡し、ゴーストの表示と固定/操作中セルの描画を変更。
相手盤面や当たり判定・ゲームルールへは渡さない。ローカル設定移行はHTTP成功後のみ削除。
ゴースト以外のセル不変・全3skinのセル伝達テストとfrontend build成功（既存chunk警告あり）。
実DB保存→再ログインと実画面の比較は未確認のためチェックは保留。

2026-09-24追記: 設定GET/移行PATCHの失敗時に初期値で自動保存できてしまう経路を修正。
読み込み成功までDB保存を停止し、Settingsへエラーと保存済み設定の再読み込み操作を追加。
初期通信はunmount/再読込でabortし、保存予約時と実行時のトークン一致も確認。
部分的なkeyBindingsは既定キーとマージし、未指定のハードドロップ等が失われないよう修正。
取得失敗後の書き込み禁止・移行失敗時のlocal保持・部分キーと表示設定保存の回帰テスト成功。
frontend build成功（既存サイズ警告あり）。実DBの保存確認は引き続き未実施。

### 18. Advanced analytics

- [x] `GameAnalytic` のAPM、PPS、lines、playtimeを実際に更新（新規保存試合）
- [x] Dashboardのmode値をPrismaの `GameMode` と一致させる（履歴色分けの旧名も修正）
- [ ] リアルタイム更新を追加
- [ ] 日付範囲とフィルターを追加
- [ ] CSV/PDFの内容を検証
- [ ] グラフと集計APIの数値が一致するテストを追加

2026-09-24: 結果保存transaction内で日次APM/PPSを当日の試合数による加重平均へ更新し、
消去行数・プレイ秒数を加算。初日のcreateにも全値を設定。
試合完了日時を一度取得して両者・競合再試行で共有し、日付境界はUTCへ統一。
関連19テスト、backend type-check成功。過去のゼロ集計の再計算と実DB試験は未実施。

2026-09-24追記: 履歴API・DashboardにUTCの日付範囲from/toを追加。
終了日は翌日00:00未満で判定し、逆転・不正日付を拒否。API境界テスト2件成功。
条件変更時の旧リクエストをabortし、取得エラーを画面へ表示。
履歴/グラフは条件一致の最新50件、統計カードは全期間と明示。
日付範囲の実ブラウザ確認・集計APIとの照合は未実施なので該当項目は未チェック。

2026-09-24追記: CSV/PDFの履歴行生成を共有し、同じ選択結果・数値精度を出力。
nullの勝敗をDRAWと決めつけずUNSPECIFIEDに変更。CSVはBOM・CRLF・引用符エスケープ・
文字列の数式評価防止を追加し、ダウンロード後にObject URLを解放。
PDFに全期間統計と絞り込み済み履歴の範囲を明示。行一致・特殊文字・空履歴のテストと
frontend build成功。PDFのレイアウト・実ブラウザの保存確認は未実施で未チェックを維持。

2026-09-24追記: Dashboardを表示中15秒周期＋タブ復帰時に再取得するよう変更。
非表示中の定期取得・同時リクエストの重複を抑止し、条件変更/unmountでタイマー・イベント・
通信を破棄。更新失敗後の再試行、初期非表示、重複防止、破棄後の停止を単体テスト。
frontend build成功（既存chunk警告あり）。ポーリングによる自動更新であり、
サーバープッシュ型の即時更新ではない。実ブラウザ検証も未実施のため第18項は未チェック。

2026-09-24追記: 日次集計取得の下限をUTC当日を含む指定日数の00:00、上限を翌日00:00未満へ修正。
時刻依存で当日分が落ちる問題を防ぎ、年越し・閏日を含む境界4ケースをテスト。
推移グラフはPPSの10倍表示をやめ、APM/PPS別軸で履歴APIの実数値を表示。
最新30試合の順序・値・非破壊性・空データ表示をコンポーネントテストで確認。
backend関連15テスト、frontendグラフテスト、TypeScript build成功。
グラフは試合単位、日次APIは日単位の平均であり同一の集計ではない。
実DBでの保存→日次取得→表示の統合照合は未実施なのでチェックは保留。

### 19. Data import/export

- [x] JSON以外にCSV/XMLを実装するか、モジュール申告から外す（アカウントCSV出力を追加）
- [x] format validationを実装（JSON設定の構造・型・範囲・未知フィールド、出力形式DTO）
- [ ] bulk import/exportを実装
- [ ] インポート前のpreviewとエラー行表示を検討

2026-09-24: `/api/users/me/export/download?format=json|csv` とSettingsのCSVボタンを追加。
CSVはdataset/record/field/valueの縦持ち形式で、取得した履歴全件やネストした設定を出力。
引用符・改行・数式文字列をエスケープし、no-storeと固定ダウンロード名を設定。
JSONから設定再取込時はID/日時等を除いて設定項目だけを送信し、成功後に再読込。
関連5テスト、backend型チェック、frontend build成功。CSV実ダウンロード・再取込の
ブラウザ確認、一括importとpreviewは未完了。

2026-09-24追記: 保存しないPOST `/api/users/me/export/preview` を追加し、Settingsで
サーバー検証後の変更前/後を確認してからimportするよう変更。
配列等の不正settingsを拒否し、必須DB列へのnullを400にする。keyBindings:nullは
DB NULLとして正しくクリアする。ネットワーク失敗とJSON構文エラーの表示も区別。
関連10テスト・型チェック・frontend build成功。ブラウザ確認と一括importは未完了。

### 20. WAF + Vault

- [ ] Vaultのdev modeと固定root tokenを廃止
- [ ] 永続化された暗号化storageを使用
- [ ] Vault取得失敗時に秘密情報へ無条件フォールバックしない
- [ ] WAFルールをstrict modeとして検証
- [ ] SQLi、XSS、異常payloadの拒否テストを用意

この要件を満たさない場合は、WAF/VaultモジュールをREADMEの申告から外す。

### 21. Design system

- [x] Tailwindを使わないなら未処理の `@theme` を通常のCSS変数へ変更
- [ ] palette、typography、spacing、iconsを一元管理
- [ ] 10個以上の再利用可能なUI componentを明示
- [ ] Vite build warningを解消（ルート遅延ロード・ESMパス解決済み、vendor分割を再検討）

2026-09-24: Join以外のページをReact.lazy/Suspenseで遅延ロードし、vendor群も分割。
最大JSは約2.26MBから約327KBへ縮小（総転送量の比較ではない）。警告閾値の引き上げはせず、
`__dirname`もimport.meta.urlからのパス解決へ変更。frontend buildは警告なしで成功、
既存frontendテスト5ファイル成功。遅延ロード後の実ブラウザ遷移は第8項の確認に残る。

2026-09-24検証訂正: Headless Chromeでvendor強制分割後の公開4ページが空DOMになることを検出。
追加したvendor分割設定を撤回し、login/privacy-policy/terms-of-serviceの描画復旧を確認。
ルートのJoinはGPU無効のheadless環境で `Cannot read properties of null (reading 'stage')` を
ErrorBoundaryが表示するため、引き続き原因調査が必要。サイズ警告も再発しており完了を取り消す。
検証は一時localhost配信＋未認証API代替応答で、実DBや対戦のE2Eではない。
backend回帰試験はHTTP試験を除く25 suite / 195テスト成功。

2026-09-24追加切り分け: ChromeのソフトウェアWebGL（ANGLE/SwiftShader）を有効にすると
Joinの `stage` エラーは再現せず、Project Tを描画。先のJoinエラーはGPU無効化条件による。
vendor強制分割を外したビルドでJoin/Login/Privacy/Terms/Dashboard/Profileの6ページを
headless Chrome 147で読み込み、空DOM・ErrorBoundaryがないことを確認。
Dashboard/Profileはlocalhostの固定API応答を使用し、50%勝率・日付入力・更新周期説明、
First victory/UNLOCKED/170÷1000XP/25RPのDOM表示を確認。実DB・クリック操作・
多人数対戦・スクリーンショットの目視比較は未検証。検証成果物は `/tmp/browser_*.html`。

### 22. スマートフォン対応（後回し）

- [ ] モバイルでも必須機能へアクセスできる設計にする
- [ ] 現在非表示のMultiplayerを要件上許容できるか確認
- [ ] タッチ操作、モーダル、対戦盤面を実機相当で確認

## P3: ドキュメントと実装の整合性

### 23. READMEを修正する

- [ ] 実装済みモジュールだけを申告
- [ ] 合計ポイントを再計算
- [ ] Product Owner、Project Manager、Technical Lead、Developersを明示
- [ ] Node/npmを含む必要ツールとバージョンを記載
- [ ] 正しいポート・URL・起動手順を記載
- [ ] AI利用箇所と使用方法を正確に記載
- [ ] 各メンバーの具体的な担当・貢献・課題を記載

### 24. `proceed.md` を現状へ合わせる

- [x] AI難易度をEasy/Hard/Expertへ更新
- [x] 未実装のOrganization記述を削除するか実装
- [x] RedisをWebSocket scaling/sessionへ使用しているという記述を修正
- [x] Human vs AIを含むserver-authoritative範囲を正確に記述
- [ ] 実際のモジュール数・ポイントへ更新

2026-09-24: `proceed.md` をshared難易度設定、AIプロセス管理、Gatewayの盤面/攻撃受付、
Redis使用箇所と照合。全対戦をserver-authoritativeとする説明を改め、モード別の責任範囲を明記。
未実装のOrganizationを除いた候補は22件・最大33点（表を機械集計）。これは完成点数ではなく、
subjectの14点要件と未完成モジュール0点を明示。確定申告点は要件別検証が未完了なので未チェック。
当初のフェーズ・担当案も実績ではないと明記。後回し項目の実装・設定は変更していない。

### 25. ER図をPrisma schemaへ同期する

- [x] 存在しないOrganization関連テーブルを削除するか実装
- [x] AI difficultyをEasy/Hard/Expertへ更新
- [x] 実際のtable数・relation・enumを再生成
- [x] READMEから参照されるER図が最新であることを確認

2026-09-24: `ER.md`をschema由来の19モデル・12enum・29 FKリレーションへ再生成。
存在しないOrganization/OrgMembership/DataExportRequestと古い制約説明を除去し、
nullable・unique・onDelete・複合制約を実際の定義で掲載。ORG_INVITE enumの残存は注記。
`tools/schema-doc.cjs --check`成功、生成済みPrisma ClientのDMMFとも全モデル・enum・FKを照合。
READMEの参照をリンク化し、GameRecord/Matchの旧称も修正。DB/migration自体は変更していない。

## P4: 品質保証

### 26. 自動テスト

- [x] Backend type-checkを成功させる
- [x] Backend Jestを全件成功させる
- [x] Frontend type-checkを成功させる
- [x] Frontend multiplayer testsを全件成功させる（2026-09-18、5件）
- [x] C++ CTestを全件成功させる
- [ ] HTTP/WebSocketの認証・認可E2Eを追加
- [ ] 2人・3人・Tournament・Spectatorの統合テストを追加

### 27. lint・build

- [ ] Backend ESLintエラーを解消
- [x] Frontend lint warningを解消
- [x] `AiPreviewPage.tsx` から `TetrisUI` へ必須の `combo` propを渡し、TS2741を解消
- [x] Viteの `@theme` warningを解消（通常の `:root` へ置換、本番ビルド成功）
- [ ] production用frontend/backend imageを用意
- [ ] development serverに依存せずproduction構成で起動確認

2026-09-24: Frontend lintの一部を修正。共有ミノ色をcomponentから独立させFast Refreshの警告を解消。
Profileの到達不能な重複分岐を除去、Dashboardの戻り先mode依存を修正。
AdvancedSearchの通信関数をeffect内へ移動し、abortによる古い検索結果の抑止を維持。
Chatの初期ルーム選択をfunctional updateにして、取得中の手動選択を上書きしないよう修正。
未使用catch変数も整理。frontendテスト9ファイル・TypeScript build成功。
ゲーム入力・対戦callbackなどの依存配列警告は残るため、第27項は未完了。

2026-09-24追記: useStageにspawnCount単位の固定済みガードを追加し、effect再実行や
callback変更による同一ミノの二重固定・NEXT二重消費を防止。行消去後の再実行、
次のミノの正常固定、disableSweep変更をhookテストで確認。
soft/hard drop等の依存配列も整理。途中の型チェックでheldKeysの宣言前参照（TS2448）を検出し、
該当effectをuseKeyboardControlsの後へ移動。Frontend lintはまだ未完了。

2026-09-24追記: JoinPageのゲスト入場を多重起動防止・unmount時タイマー破棄付きに変更し、
クリック連打と途中離脱をテスト。Friendsの検索をabortし古い応答の反映を防止。
TetrisUIの背景loaderを安定化し、失敗時の未処理Promiseとunmount後の更新を抑止。
Lobbyのlogout依存も修正。frontendテスト11ファイル・TypeScript build成功。
lint警告はuseMultiplayer/PlayPageの13件が残るため未完了を維持。

2026-09-24追記: useMultiplayerの共通リスナー登録関数をuseCallback化し、呼出側の依存を明示。
PlayPageは固定イベントIDの重複防止を維持したまま参照するstate/ref/setterを依存へ追加。
Frontend lint警告0件、TypeScript build、テスト11ファイル、Vite build成功。
lintへ`--deny-warnings`を追加して警告の再発を失敗扱いにした。Viteの大きいchunk警告と
実ブラウザでの対戦検証は別項目として未完了のまま。

2026-09-24追記: Backend lintの非修正診断で整形662件・その他56件を確認。
Chat/SprintでPrismaの推論型をanyで消していた箇所を修正し、CSV変換は対応型を明示。
対象5ファイルのESLintと関連12テスト、backend型チェック成功。
CSVのscalar保持・非対応値拒否、Sprintの日付形式・個人/全体クエリを追加検証。
Backend全体のlintは未完了。診断中、backend直下のeslint実行パスが存在せずexit127となり、
workspaceルートのnode_modules/.binへ修正して実行した。後回しの復帰・Tournamentは変更していない。

2026-09-25チェックポイント: 認証・ユーザー管理・Public APIの3ディレクトリを整形し、
テスト内transaction callbackの型を明示。対象範囲のESLint（max-warnings 0）とbackend型チェック成功。
関連128テストは122件が通常環境で成功、HTTP6件は127.0.0.1待受のEPERMで一旦失敗した後、
許可付きの再実行で全6件成功。HTTPテストはDB/Redisをmockし、実DB統合試験ではない。
他領域のBackend lint、Vite chunk警告、実ブラウザ/実DB検証などは引き続き未完了。
ユーザーの「キリいいところまで」に合わせ、今回はこの検証済み範囲で一区切りとする。

### 28. 負荷・同期試験

- [ ] 複数試合を同時実行して状態が混ざらないことを確認
- [ ] 非アクティブタブでもサーバー上の進行が変化しないことを確認
- [ ] 遅延・切断・重複イベント・順序逆転を再現
- [ ] reconnect後に盤面、next、hold、garbage、scoreが一致することを確認

## 現在の検証コマンド

```bash
npm run type-check
npm test --workspace @transcendence/backend -- --runInBand
node --test apps/frontend/tests/keyboard-controls.test.cjs
node --test apps/frontend/tests/multiplayer.test.cjs
node --test apps/frontend/tests/public-profile.test.cjs
make ai-build
ctest --test-dir build/ai-agent --output-on-failure
docker compose config --quiet
```

## 推奨作業順

1. フレンド・検索・履歴HTTP入力
2. Tournament・Public API・Game result入力
3. WebSocket payloadとチャット認可
4. HTTPS・ポート・README起動手順
5. Spectatorと再接続
6. GDPR削除
7. 14ポイント分のモジュールを実機で確定
8. README・`proceed.md`・ER図の更新
9. 後回し中の秘密情報失効・除去を提出前に必ず実施
