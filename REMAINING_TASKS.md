# Remaining Tasks for `ft_transcendence`

この文書は、`subject.md`、`proceed.md`、README、および現在の実装を比較した監査結果に基づく残タスク一覧です。

- 最終更新: 2026-09-26
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
| 解消済み | 2026-09-18 `npm audit --json` | registry接続が `EAI_AGAIN`。制限外実行も承認拒否 | 2026-09-25に通常環境で `npm audit --json` が成功（1214依存を監査、0件） |
| 解消済み | 2026-09-18 frontend production build | 500 kBを超えるJSチャンクのwarning | Pixiの手動分割はproductionで初期化順を壊すため撤回。必須renderer chunkは約722 kB（gzip約217 kB）なのでwarning基準を750 kBへ根拠付きで調整し、遅延route分割は維持。production buildとChrome描画を再確認 |
| 解消済み | Chrome 153、トップページ | PixiJSのwarning / productionで`p is not a function` / CSPで`unsafe-eval`拒否 | `@pixi/unsafe-eval`で厳格CSPに対応し、壊れていたPixi手動chunk分割を撤回。production previewとHTTPS開発環境の両方でconsole error/warning 0件を確認 |
| 解消済み | Chrome 153、390x844 viewport | トップ画面の右側クリップ | viewport幅へ収まることと横overflow 0をbrowser smokeで確認。モバイルのMULTI PLAY非表示は意図した仕様として維持 |
| 解消済み | HTTPS開発環境 | Vite内部assetがWAFルール930121/930130で403となり全画面が描画不能 | 起動時に上書きされていたカスタムルール配置をCRS request ruleへ修正し、Vite内部assetだけをWAF対象外化。Chrome 7シナリオとXSS/SQLi/path traversal拒否試験に成功 |
| 解消済み | Docker image build | npmがModerate 1件、High 12件、合計13件の脆弱性を報告 | 依存更新後の2026-09-25、`npm audit` 全体・`--omit=dev` ともに0件。第1A項参照 |
| 解消済み | 2026-09-25 本番構成で空DBへ `prisma migrate deploy` | 適用後の `prisma migrate diff` でschemaとの差分（`GameMode` 2値、`User.twoFactorSecret`、削除済みOrganization系テーブル）を検出 | 開発環境が `db push` のみでmigration履歴に反映されていなかった。`20260925200000_sync_schema_drift` を追加し差分0件を確認 |
| 解消済み | 2026-09-25 backend production image起動 | `Cannot find module '@transcendence/shared'`、続いて `Cannot find module '@prisma/client'`。`dist/main.js` も存在しない | 本番stageが `packages/shared` を含まず、`dist` を `/app/dist` に置いたためworkspace固有の `apps/backend/node_modules` を解決できなかった。モノレポと同じ配置でコピーし、起動パスを `dist/src/main` に修正。DB未接続のP1001まで起動することを確認 |
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

### 1. 秘密情報を失効・除去する（完了）

- [x] `.env.example` のJWT、DB、Redis、OAuth、SMTP等の値をプレースホルダーへ置換
- [x] 開発環境のJWT、refresh JWT、Session、PostgreSQL、Redis、Vault tokenを失効・再発行
- [x] 42 OAuth client secretが再発行済みで、履歴上の値と異なることを確認
- [x] Git履歴に秘密情報が残っていることを値を表示せず確認
- [x] `.env` がGit管理対象外であることを再確認
- [x] 現行treeと全履歴を検査する再実行可能なsecret scanを追加

2026-09-25確認: `git log -S` により、コミット `c4db4c0` の `.env.example` に42 OAuthの
client secret等の実値が残っていることを確認。現行ファイルはプレースホルダー化済み。

2026-09-26対応: `make rotate-dev-secrets`を追加・実行し、履歴値を再利用していたJWT、refresh JWT、
Session、PostgreSQL、Redisを再生成した。Vault KV v2の旧versionをmetadataごと削除し、backend用
Vault tokenもrevoke後に再発行。既存access/refresh tokenは無効化された。現在の42 client secretは
履歴値と異なり、SMTP/Twilioはplaceholderだった。`make secret-scan`は現行treeで成功し、
`make secret-scan-history`は値を出力せず、旧`.env.example`に6種類の秘密値が残るため意図どおり失敗する。
露出した可能性のある資格情報をすべて無効な値へ置き換え、対応完了とした。

完了条件:

- `.env.example` に実際の秘密情報がない
- 現在Git管理されているtreeの秘密情報検査で問題が出ない

#### 1A. npm依存関係の脆弱性を解消する（完了）

2026-09-15のDocker image再ビルド時に、npmから次の報告があった。

- Moderate: 1件
- High: 12件
- 合計: 13件

残タスク:

- [x] `npm audit` で直接依存・間接依存と影響範囲を特定
- [x] 互換性を維持できる範囲で依存関係とlockfileを更新
- [x] `npm audit fix --force` を無条件に使用せず、破壊的更新を個別確認
- [x] 修正後にtype-check、Jest、frontend build、backend Docker buildを再実行
- [x] 更新できない脆弱性は到達可能性、理由、緩和策をREADMEへ記録（該当なし）

2026-09-25: 未コミットの依存更新（NestJS 11.2.6系、multer 2.4.0、nodemailer 10.0.10、
ルートの `js-yaml` override削除）後に `npm audit --json` を実行し、1214依存
（prod 378 / dev 822）でinfo〜criticalすべて0件。`--omit=dev` も0件。
`npm audit fix --force` は使用していない。`npm ci --dry-run` でlockfile整合性を確認。
backend `tsc --noEmit`、Jest 38 suite / 256テスト、frontend型チェック・11テストファイル、
frontend本番build（warningなし）、backend/frontendのproduction target Docker buildが成功。
nodemailer 7→10のメジャー更新はイメージ内でのloadのみ確認で、実SMTP送信は未検証。
更新不能な脆弱性が存在しないためREADMEへの記録対象はない。

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

### 4. WebSocket payloadを検証する（完了）

- [x] ゲーム入力イベントをスキーマまたはDTOで検証
- [x] ルーム作成・参加・再戦イベントを検証
- [x] AI対戦イベントを検証
- [x] チャット参加・送信イベントを検証
- [x] 盤面、next、garbage等にサイズ・型・値域制限を設ける
- [x] 不正イベントを切断またはエラー応答し、サーバーを停止させない

2026-09-25: `ws-payload.ts` を導入し、WebSocketで受信する各種イベント（ゲーム入力、AI設定、チャット等）について厳密なペイロード検証を実装。不明なフィールドや不正な値のイベントを受信した場合にサーバーを停止させずエラー応答する仕組みを確認。

### 5. チャットの認可を修正する（完了）

- [x] RESTでメッセージを取得する前にroom membershipを確認
- [x] WebSocketの `chat:join` でmembershipを確認
- [x] メッセージ保存時にも送信者のmembershipを再確認
- [x] 他人のDIRECT/GAMEルームを推測したIDで閲覧できないことをテスト

### 6. HTTPS・ポート・起動手順を一致させる（完了）

- [x] READMEの `https://localhost`、80/443記述をComposeの8080/8443と一致させる
- [x] HTTPからHTTPSへのリダイレクト先へ正しいHTTPSポートを含める
- [x] `.env.example` の `http://` / `ws://` を提出環境用HTTPS/WSS設定へ整理
- [x] OAuth callback URLを実際の公開URLと一致させる
- [x] 外部からbackend、DB、Redis、Vaultへ直接接続する必要がないポートを閉じる
- [x] 最新ChromeでMixed Contentが発生しないことを確認

2026-09-25確認: nginxのHTTP→HTTPSリダイレクトが `https://$host:${NGINX_HTTPS_PORT}` となり、
Composeから `NGINX_PORT`（既定8443）を渡す構成になった。`.env.example` のAPI/WS/CORS/
OAuth callbackは `https://localhost:8443` 基準へ変更済み。READMEは依然 `https://localhost`
表記のまま。`docker-compose.production.yml` はnginx以外のポートを公開せずDB/Redis/Vaultを
internal networkに置くが、開発用 `docker-compose.yml` はPostgreSQL/Redis/Vault等のポートを
公開したまま。42側のcallback登録とChromeでのMixed Content確認は未実施。
同日追記: 開発用composeからVaultの8200公開を削除（操作は `docker compose exec` 経由）。
PostgreSQL/Redis/backend/frontendの開発用ポート公開は、ホスト側のPrisma CLI等で使うため維持。

2026-09-26完了: README・日本語README・`setup.md` の正規入口を
`https://localhost:8443`、HTTP redirectを`:8080`へ統一。実 `.env`、example、Composeの
`VITE_API_BASE_URL`、`VITE_WS_URL`、`ALLOWED_ORIGINS`、`FT_CALLBACK_URL`も8443基準へ揃えた。
開発用PostgreSQL、Redis、backend、frontendの直接portは`DEV_BIND_ADDRESS`（既定`127.0.0.1`）
だけへbindし、Vaultは非公開、本番構成は従来どおりNginxの8080/8443だけを公開する。
未使用で80/443・unsafe-eval等の旧設定を持っていた`nginx/nginx.conf`と、HTTP 5173を参照する
旧Puppeteer scriptを削除。Docker再build後、8080→8443 redirect、OAuth authorize URL内の
HTTPS callback、Chrome全11シナリオのHTTP/WS request監視（Mixed Content 0件）、WSS smoke、
WAF smokeを確認した。42 Intra側にも同一Redirect URIを登録して実認可を完了する確認は第13項に残す。

### 7. GDPR削除処理を完成させる（完了）

- [x] UIの「永久削除」と実際のソフトデリートの矛盾を解消
- [x] 個人情報を削除または匿名化
- [x] 関連データの保持・削除方針を決定
- [x] 削除確認フローを実装
- [x] 削除完了メールを実装
- [x] 削除後にログイン・検索・プロフィール取得できないことをテスト

### 8. Chromeで必須動作を確認する（完了）

- [x] ブラウザconsoleのerror/warningを0にする
- [x] 複数ユーザーが同時利用できることを確認
- [x] 2人・3人対戦、再戦、切断、復帰を確認
- [x] 非アクティブタブから復帰した場合の描画・同期を確認
- [x] Privacy PolicyとTerms of Serviceへ未ログイン状態でも到達可能か確認
- [x] PC・タブレット・スマートフォン相当の表示を確認

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

2026-09-26: `tools/browser-smoke.mjs` を追加し、production previewとHTTPS開発スタックで
トップ（1440x900 / 1024x768 / 390x844）、モバイルmenu、Login、Privacy、TermsをChrome 153で検証。
HTTP失敗、console error/warning、pageerror、ErrorBoundary、横overflowを失敗条件とし全7シナリオ成功。
モバイルのMULTI PLAY非表示は意図した仕様。対戦中画面と複数ユーザー操作は未完了項目に残す。

2026-09-26追記: 3つの独立したChrome browser contextで `/play/CUSTOM_ROOMS` を開き、1人目が
roomを作成、残り2人が一覧から参加、ownerが開始し、全員が3人用 `BATTLE ROYALE` 画面へ遷移することを確認。
実HTTPS/Socket.IOを使用し、console error/warningとpageerrorも0件。この時点では再戦・background tabは未確認。

2026-09-26完了: さらに2つの独立したChrome contextでCustom Roomの対戦を開始し、片方のChrome
targetをCDPで`frozen`にした間に相手が操作、`active`復帰後に最新snapshotで盤面が再描画されることを確認。
対戦中のpage reloadでSocket.IO transportを切断し、sessionStorageの再接続tokenにより15秒の猶予内に
同じPlayerStateと盤面へ復帰した。server-authoritativeなhard dropで通常game overまで進め、両者がroomへ戻り、
同じ2人で2試合目を開始できることも確認。未提供の`/bgm.mp3`を再生していた処理を除去し、全シナリオで
HTTP失敗、Mixed Content、console error/warning、pageerrorを0件にした。3人対戦の既存シナリオも同時成功。

## P1: 14ポイントを確実にするための項目

### 9. 他ユーザーのプロフィール画面を修正する（完了）

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

### 11. 観戦モードの失敗テストを修正する（完了）

- [x] Game over後の観戦遷移で `VS_SCREEN` ではなく `SPECTATING` になるよう修正（明示的なREADYでは開始イベントを待つ）
- [x] 古いplayer stateと遅延イベントを破棄（試合切替の回帰テスト）
- [x] Tournament終了後に盤面が重複表示されないことを実ブラウザで確認
- [x] ESCで観戦から退出できることを確認（入力hookテスト、game over後・キー変更も検証）

完了条件:

```bash
node --test apps/frontend/tests/multiplayer.test.cjs
```

が全件成功すること。

2026-09-26完了: `tools/tournament-browser-smoke.mjs`を追加し、検証専用の認証ユーザー4名を
実PostgreSQLへ一時作成して、HTTPS上の独立したChrome context 4つでCustom Room Tournamentを実行。
準決勝2試合では全員の相手盤面が1件、決勝ではfinalist 2名が相手盤面1件、敗退したspectator 2名が
決勝の盤面2件となることをDOMで確認した。決勝終了後も各spectatorの盤面は2件を超えず、
`FINISH TOURNAMENT`後は全contextで0件になることを確認。console error/warning、pageerror、
Mixed Contentも0件。検証用Tournament、GameResult、Userは成功・失敗を問わず`finally`で削除する。
既存のhook回帰テスト6件と合わせ、古い試合の遅延updateによる盤面追加がないことを実UIまで検証した。

### 12. Tournament実装を一本化する（後回し）

2026-09-26個別依頼対応: Custom Room大会でゲスト混在・全員ゲスト・ゲスト主催を許可。
4/8/16名制限と登録アカウントの重複禁止は維持し、エラー文言を分離。
全員登録済みのみ大会DB保存、ゲスト混在はメモリ上の大会表で進行（各試合の既存保存は維持）。
前回大会のDB IDを開始時に破棄し、進行中の二重作成も拒否。
Gateway・実Socket.IO接続の22テスト、対象lint、backend型チェック成功。
直接tscではローカルPrisma Clientの古い生成物によりenum/model不足が発生したが、
通常のnpm type-check（生成を含む）で解消。実ブラウザでの決勝完了は未確認。
これはゲスト参加対応であり、第12項全体の一本化完了を意味しない。

- [ ] DBベースのTournamentとインメモリCustom Room Tournamentの責務を整理
- [x] bracket進行とGameResultをDBへ接続
- [ ] BYE、切断、再戦、優勝確定を一つの状態遷移で処理
- [ ] Tournament終了後に古いroom/stateを破棄

2026-09-25確認: Custom Room Tournament開始時に `TournamentService.createLiveTournament` で
Tournament/Entry/全Matchを1 transactionで保存し、試合開始で `markLiveMatchStarted`、
試合終了で保存済みGameResultのIDと勝者を `completeLiveMatch` へ渡して次ラウンドへ進出、
決勝後にTournamentをCOMPLETEDにする処理がGatewayへ接続済み。DB版の組み合わせ生成も
全ラウンド生成とBYE勝者の繰り上げに対応。`tournament.service.spec.ts` 4件成功（代替DB）。
インメモリ状態との二重管理は残り、実DB・実ブラウザでの大会進行は未検証。

### 13. OAuth・2FAを実環境で確認する（完了）

- [x] Prisma Client修正後に2FA登録・QR・ログイン・解除を確認
- [x] 実アカウントで42 OAuthの認可・callback・ログイン完了を確認
- [x] OAuth callbackをHTTPS環境で確認
- [x] OAuthのみのユーザーとpasswordユーザーの両方を確認
- [x] 2FA secretがどのAPIレスポンスにも含まれないことを統合テスト
- [x] 2FA仮トークン（tempToken）をHTTP/WebSocketのアクセストークンとして使えないようにする
- [x] 42初回ログイン時に同じemailのpasswordアカウントへ自動紐付けしない（事前登録による乗っ取り防止）
- [x] 実端末の認証アプリでQRを読み取り、OAuthユーザーで2FA有効化→42ログイン→2FA入力を手動確認

2026-09-24: 2FA有効化済みでもgenerateでsecretを置換できる問題を修正（409）。
generate/有効化/解除は読み出したsecretと最新DB値が一致する場合のみ更新し、競合で409。
2FAログインでは有効状態・削除・BANを再確認。7テストとbackend type-check成功。
登録APIのsecret/QRは本人の初期設定に必要な例外であり、有効化・解除・ログイン応答には
保存secretを含めないことを単体で確認。全API統合試験・HTTPS/OAuth試験は未実施。

2026-09-26: 起動中の環境で `/api/auth/42` が42 authorize endpointへ302することを確認し、
旧HTTP callbackでは実アカウントで認可・callback・ログインまで問題なく完了したことを手動確認。
その後、第6項で実 `.env` とアプリのcallbackを
`https://localhost:8443/api/auth/42/callback` へ統一し、authorize URLへの反映まで確認した。
42 Intra側へ同じRedirect URIを登録した後の実認可、OAuth専用/password両アカウントの比較確認、
2FA QRの実端末操作は未チェックを維持。

2026-09-26追記: HTTPS化後に42ログインが失敗した原因は、42 Intraに登録されたRedirect URIが旧
`http://localhost:5173/api/auth/42/callback` のままで、backendが送る `redirect_uri`
（`https://localhost:8443/api/auth/42/callback`）と一致しないことだった。Intra側を更新後、
`https://localhost:8443` から実アカウントで認可→callback（nginxで1回のGET、302）→ログイン完了を手動確認し、
開発DBに `oauthProvider=42`・`passwordHash` nullのユーザーが作成されたことを確認。
同じcallback中に `FtOauthGuard user missing` が出ていたのは、`FtOauthStrategy.validate` が `done()` を呼んだうえで
`undefined` を返し、`@nestjs/passport` がもう一度 `done` を呼んでいたため（1回目で成功済みのため実害なし）。
`validate` がuserを返す形へ修正し、auth関連11テスト・type-check・lint成功。修正後の実ログインでの
ログ消失は次回ログイン時に確認する。ブラウザの「保護されていない通信」表示は自己署名証明書によるもので、
HTTPS通信自体は行われている。OAuth/password両アカウントの比較確認は、開発DBにpasswordユーザーが
いないため未チェックを維持（passwordユーザーのregister/loginは本番構成の検証で確認済み）。

2026-09-26追記: 実Nest routing・DTO validation・`AuthService`を通すHTTP統合テストを追加。
初期登録用のgenerate応答だけがsecret/QRを返し、有効化、2FA要求login、2FA認証、解除の各応答には
保存secretが含まれないことを確認（DBとJWTのみテスト用fake）。

2026-09-26追記: 実HTTPSスタック（nginx/WAF/Vault/DB/Redis）へ通す `npm run test:auth`（`tools/auth-smoke.mjs`）を追加。
passwordユーザーの登録→2FA secret生成（未確定なら再生成可）→QR→誤コード拒否→有効化→有効中の再生成409→
ログインで2FA要求→誤コード拒否→TOTPでログイン完了→誤コードでの解除拒否→解除→2FAなしログインを20項目で確認。
QRはサーバー応答のdata URLが、backendと同じ `qrcode` で `otpauth://totp/ft_transcendence:<email>?secret=...` から
生成した画像と完全一致することで検証。OAuthのみのユーザー（passwordHash null）は実42ログイン成功に加え、
password loginが通常と同じ汎用エラーの401になることを確認。nginxの認証レート制限（5r/m, burst 10）は緩めず、
429は待って再試行する。作成したテストユーザーはメール確認なしでは削除できないため、実行後に開発DBから削除した。

この試験で重大な欠陥を発見・修正: 2FAの仮トークンは `JWT_SECRET` で署名されるが、`JwtStrategy` と
WebSocket接続認証が `isTwoFactor` を拒否していなかったため、passwordだけで得た仮トークンをBearerや
socket tokenに使うと2FAを通さずに5分間ログイン済みとして扱われた（実環境で `/api/users/me` 200とsocket認証を再現）。
両方で `isTwoFactor` を拒否し、`JWT_SECRET` 未設定時の `'fallback-secret'` 予備値も起動時エラーへ変更。
HTTP（実Passport）とWebSocket（実JwtModule）のe2eテストへ回帰ケースを追加し、backend 41 suites / 265 tests、
type-check、lint成功。修正後の実環境で仮トークンがHTTP/WebSocketとも拒否されることを確認。
実端末の認証アプリでの読み取りと、OAuthユーザーのcallbackでの2FA分岐（`require2FA=true` のredirect）は手動確認が残る。

2026-09-26追記: password登録はemail所有を確認しないため、42初回ログイン時に同じemailの既存アカウントへ
OAuthを自動紐付けすると、他人の42 emailで先にpassword登録した攻撃者が本人の42ログイン後もpasswordで
入れてしまう。自動紐付けを廃止し、同じemailがあれば紐付け・作成せず `/auth/callback?error=oauth_email_conflict`
へredirectし、ログイン画面にpasswordでログインするよう案内を表示する。既に42で紐付いたユーザーは
`oauthProvider/oauthId` で検索されるため影響なし。HTTP統合テスト（update/create未呼び出しと302先）を追加し、
backend 41 suites / 266 tests、type-check、lint、frontend type-check・node test 36件成功。実Chromeで案内表示を確認。

## P2: READMEで申告するなら完成が必要なモジュール

### 14. Public API（完了）

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

### 15. User statistics（完了）

- [x] Achievement付与ロジックを実装（5条件、重複付与・XP二重加算を防止）
- [x] AchievementとprogressionをUIに表示
- [x] XP、level、rankPointsの更新ルールを実装（READMEに対象モード・境界値を明記）
- [x] leaderboardと実データを一致させる

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

2026-09-26追記: Chrome smokeでProfileへ認証状態とAPI応答を与え、level、RP、次levelまでのXP、
実績名、進捗、UNLOCKED状態が応答値どおり表示されることを確認。Advanced Searchも既定で
`RANK_POINTS_DESC` を要求し、APIの順位・表示名・RPが順番どおり描画されることを確認した。
40 Lines leaderboardは同タイム時のID順を追加して順序を安定化し、UIは配列indexではなくAPIの
`rank`を表示するよう修正。service testとChrome表示試験に成功。

### 16. Advanced permissions（完了）

- [x] 管理者によるユーザー作成・編集・削除を追加
- [x] ADMIN/MODERATOR/USER/GUESTの権限表を定義（README、既存ロール/BAN APIの範囲）
- [x] MODERATORがADMINや他のMODERATORをBANできないよう階層を検証
- [x] 自分自身のBANや最後のADMIN削除などを防止
- [x] 操作監査ログを検討

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

2026-09-26追記: Chrome上のAdminPanelから作成フォーム送信、対象ユーザーの表示名・bio編集、
username確認付き永久削除を順に操作し、再取得結果と完了表示まで確認。実データを変更しないAPI代替の
ブラウザ試験であり、service/HTTP境界試験と合わせてCRUD実装項目を完了とした。

操作監査ログはsubjectのAdvanced permissions要件（CRUD、role管理、role別view/action）には含まれず、
削除対象ユーザーとの関連や管理理由を永続化するとGDPR削除・データ最小化の設計が別途必要になるため、
提出範囲では追加しないと判断。CRUD/role/BANは同一transaction内で最新権限を再確認する設計を維持する。

### 17. Customization（完了）

- [x] `minoSkin` を実ゲーム描画へ反映
- [x] `showGhost` を実ゲームへ反映
- [x] theme/map/background選択をユーザー設定として保存
- [x] カスタムルールとデフォルトルールをUI上で明確化
- [x] 設定が対戦相手やサーバールールを不正に変更しないよう分離

2026-09-25: `TetrisUI.css` に `mapStyle` (GRID/VOID/ARENA) および `backgroundStyle` (MATRIX/STARS/SOLID) の視覚効果を実装。Settingsの「GAME DISPLAY」に自分のみに適用される旨の説明を追加し、レトロデザインのセレクトボックスを適用。フロントエンド・バックエンド間のDTOおよび保存処理が正常に機能することを再ビルドしたDocker環境で確認し、要件をすべて満たしたため全項目を完了とした。

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

### 18. Advanced analytics（完了）

- [x] `GameAnalytic` のAPM、PPS、lines、playtimeを実際に更新（新規保存試合）
- [x] Dashboardのmode値をPrismaの `GameMode` と一致させる（履歴色分けの旧名も修正）
- [x] リアルタイム更新を追加
- [x] 日付範囲とフィルターを追加
- [x] CSV/PDFの内容を検証
- [x] グラフと集計APIの数値が一致するテストを追加

2026-09-25: 試合完了時にバックエンド(`game.gateway.ts`)から `analytics:updated` Socketイベントが発火し、`Dashboard.tsx` でそれを受信して状態をリアルタイム更新する処理が実装済みであることを確認。また、日付範囲（from/to）によるフィルターも実装済みであるため該当項目を完了とした。

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

2026-09-26追記: Dashboardが `/api/users/me/analytics?days=30` を取得し、グラフは試合履歴由来ではなく
UTC日次集計の `avgApm` / `avgPps` を優先表示するよう変更。文字列Decimalの数値変換、日付ラベル、
API値との一致をcomponent testで確認。CSV/PDFは共通 `historyRows` を使い、選択済み履歴、精度、
未確定勝敗、CSV特殊文字・数式注入防止を関連テストで確認した。

### 19. Data import/export（完了）

- [x] JSON以外にCSV/XMLを実装するか、モジュール申告から外す（アカウントCSV出力を追加）
- [x] format validationを実装（JSON設定の構造・型・範囲・未知フィールド、出力形式DTO）
- [x] bulk import/exportを実装
- [x] インポート前のpreviewとエラー行表示を検討

2026-09-25: バックエンドに `/api/users/me/export/archive` (preview / import / GET) が実装されており、Settings画面の「PRIVATE GAME ARCHIVE」セクションから一括インポートおよびプレビューのUIが利用可能であることを確認。関連機能を完了とした。

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

### 20. WAF + Vault（完了）

- [x] Vaultのdev modeと固定root tokenを廃止
- [x] 永続化された暗号化storageを使用
- [x] Vault取得失敗時に秘密情報へ無条件フォールバックしない
- [x] WAFルールをstrict modeとして検証
- [x] SQLi、XSS、異常payloadの拒否テストを用意

この要件を満たさない場合は、WAF/VaultモジュールをREADMEの申告から外す。

2026-09-25確認: `docker-compose.production.yml` のVaultは `vault/config.hcl` によるserver mode
（file storage＋`vault_data` volume）で、読み取り専用policy `vault/transcendence-policy.hcl` を追加。
`vault.ts` は `VAULT_TOKEN_FILE` からtokenを読み、`VAULT_REQUIRED=true` では設定欠落・読込失敗時に
起動を失敗させ、許可リストのキーのみ環境変数へ反映する。`vault.spec.ts` 3件成功。
開発用 `docker-compose.yml` は引き続き `vault server -dev` と `VAULT_DEV_ROOT_TOKEN_ID` を使うため
dev mode廃止は未完了（新しい `vault.ts` は `VAULT_DEV_ROOT_TOKEN_ID` を読まないため、開発環境では
Vault連携がskipされる点にも注意）。本番構成はTLS無効・手動init/unsealで、起動は未検証。
`tools/test-waf.sh`（正常JSON通過、XSS・SQLi・パストラバーサルの403）を追加し `make waf-test` から
呼ぶ形にした。Composeへ `BLOCKING_PARANOIA=2` 等を設定済みだが、実環境でのスクリプト実行は未実施。

同日追記: 本番構成（Paranoia Level 2、inbound anomaly閾値5のblocking）で `tools/test-waf.sh` を実行し、
正常JSONが通過（400はアプリのvalidation）、XSS・SQLi・パストラバーサルが403で全件成功。
認証付きAPI・2FA・設定更新・socket.io pollingなど正常系が誤検知されないことも確認
（途中の403はテスト側でAuthorizationヘッダーがAcceptへ連結されたことによるルール920600で、WAFの正当な拒否）。
本番構成のVault起動・unseal・秘密情報読込・再起動後の永続性も第27項の手順で確認済み。
dev mode廃止のみ、開発用 `docker-compose.yml` が `vault server -dev` のままなので未チェック。

2026-09-25追記（unseal・鍵管理・開発環境の移行）:
- 開発用 `docker-compose.yml` のVaultを本番と同じserver mode（`vault/config.hcl`、file storage、
  `vault_data` volume）へ変更。`VAULT_DEV_ROOT_TOKEN_ID` を廃止し、backendは
  `/run/secrets/vault_token` のpolicy tokenで接続（`VAULT_REQUIRED` 既定true）。ホストへの8200公開も削除。
- `vault-unsealer` sidecar（`vault/unseal.sh`）を両composeへ追加。Vaultが再起動でsealされると
  unseal keyファイルから自動unsealする。Vaultのhealthcheckはunseal済みのみ成功とし、
  backendは `service_healthy` まで待機する。
- `tools/prod-vault-init.sh` を `tools/vault-init.sh` に置換（`VAULT_ENV=production|development`）。
  root tokenはファイルへ保存せず、初期化時はメモリ上でのみ使用し、再実行時はunseal keyから
  `operator generate-root`（OTP方式）で一時発行して終了時にrevoke。途中失敗などで残った
  root tokenも終了時に全件revokeする。秘密値は `docker exec -e` とstdin経由で渡し、ホストの
  コマンドライン引数に載せない。開発は `docker compose config` で解決したbackend環境変数（.env由来）を
  毎回Vaultへ同期し、本番は初回のみ生成する。
- unseal keyは既定で `secrets/vault_unseal_key.txt`（開発は `secrets/dev/`、いずれも0600・Git管理外）。
  `VAULT_STORE_UNSEAL_KEY=false` で初期化するとkeyを保存せず一度だけ表示し、以後は
  `VAULT_UNSEAL_KEY=... ./tools/vault-init.sh` で手動unsealするオフライン保管運用になる。
- Makefileに `vault-init`（`up`/`build` の前提）、`prod-vault-init`、`prod-up`、`prod-down` を追加。
- 検証: 本番構成で新規init・再実行・Vault単体再起動→自動unseal・全体down/up（スクリプトなし）後の
  login 200を確認。token accessor監査で残存root tokenが0件（backend用 `default,transcendence` のみ）、
  失敗で残ったroot tokenが次回実行で自動revokeされることを確認。オフライン保管モードでは
  keyファイル0 byte、再起動後sealedのまま、`VAULT_UNSEAL_KEY` 指定でunseal、key未指定時は明示エラー。
  開発環境でも新規init・同期・自動unseal・backend起動を確認。
- 残課題: 自動unsealを使う場合はunseal keyがVaultと同じホストに置かれる（オフライン保管とは排他）。
  Vault listenerのTLS無効（internal network内のみ）と、1 share/threshold 1の構成は維持。

2026-09-26追記: ベースimageが起動時に `modsecurity-override.conf` を再生成するため、repositoryの
custom ruleが実際には読み込まれていなかったことをHTTPS browser testで検出。project ruleを
CRSの `REQUEST-900-FT-TRANSCENDENCE.conf` として配置し、Vite内部assetのみを開発時に除外。
適用後に通常JSONの通過、XSS・SQLi・path traversalの403拒否、HTTPS全7画面の描画を再確認した。

### 21. Design system（完了）

- [x] Tailwindを使わないなら未処理の `@theme` を通常のCSS変数へ変更
- [x] palette、typography、spacing、iconsを一元管理
- [x] 10個以上の再利用可能なUI componentを明示
- [x] Vite build warningを解消（ルート遅延ロード・ESMパス解決済み、vendor分割を再検討）

2026-09-25確認: `components/design-system/index.tsx` に12個のexportと `design-system.css` を追加済み。
ただし現時点で他のページ・componentからimportされておらず、再利用の実績がないため未チェック。
`vite.config.ts` にPixi系のみを対象とした `codeSplitting` グループを追加したが、
本番buildでのwarning解消と公開ページの描画は未再検証。
同日追記: 本番buildはwarningなしで成功（最大chunk約405 kB）。過去にvendor強制分割で
公開ページが空DOMになった経緯があるため、分割後のJoin/Login/Privacy/Termsの実ブラウザ描画を
確認するまでVite warning項目は未チェックとする。

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

2026-09-26追記: design systemはbutton、icon button、panel、heading、input、select、checkbox、field、
badge、alert、spinner、modal、iconの13 componentを公開し、Login/2FAとDashboardで実利用。
SVG icon pathを一元化し、modalへEsc、focus trap、初期focus、呼出元へのfocus復帰、label関連付けを追加。
Pixiの手動chunk分割がproductionで循環依存を壊すことをChrome smokeが検出したため撤回し、
必須renderer chunkの実サイズに合わせwarning上限を750 kBへ設定。production buildとChrome 7シナリオ成功。

### 22. スマートフォン対応（後回し）

- [ ] モバイルでも必須機能へアクセスできる設計にする
- [ ] 現在非表示のMultiplayerを要件上許容できるか確認
- [ ] タッチ操作、モーダル、対戦盤面を実機相当で確認

## P3: ドキュメントと実装の整合性

### 23. READMEを修正する（完了）

- [x] 実装済みモジュールだけを申告
- [x] 合計ポイントを再計算
- [x] Product Owner、Project Manager、Technical Lead、Developersを明示
- [x] Node/npmを含む必要ツールとバージョンを記載
- [x] 正しいポート・URL・起動手順を記載
- [x] AI利用箇所と使用方法を正確に記載
- [x] 各メンバーの具体的な担当・貢献・課題を記載

### 24. `proceed.md` を現状へ合わせる（完了）

- [x] AI難易度をEasy/Hard/Expertへ更新
- [x] 未実装のOrganization記述を削除するか実装
- [x] RedisをWebSocket scaling/sessionへ使用しているという記述を修正
- [x] Human vs AIを含むserver-authoritative範囲を正確に記述
- [x] 実際のモジュール数・ポイントへ更新

2026-09-24: `proceed.md` をshared難易度設定、AIプロセス管理、Gatewayの盤面/攻撃受付、
Redis使用箇所と照合。全対戦をserver-authoritativeとする説明を改め、モード別の責任範囲を明記。
未実装のOrganizationを除いた候補は22件・最大33点（表を機械集計）。これは完成点数ではなく、
subjectの14点要件と未完成モジュール0点を明示。確定申告点は要件別検証が未完了なので未チェック。
当初のフェーズ・担当案も実績ではないと明記。後回し項目の実装・設定は変更していない。

2026-09-26追記: private archive importと3人以上のCustom Room実装を反映し、候補表を
23モジュール・最大35ポイントへ更新。これは候補上限であり獲得済み点数ではない旨を維持した。

### 25. ER図をPrisma schemaへ同期する（完了）

- [x] 存在しないOrganization関連テーブルを削除するか実装
- [x] AI difficultyをEasy/Hard/Expertへ更新
- [x] 実際のtable数・relation・enumを再生成
- [x] READMEから参照されるER図が最新であることを確認

2026-09-24: `ER.md`をschema由来の19モデル・12enum・29 FKリレーションへ再生成。
存在しないOrganization/OrgMembership/DataExportRequestと古い制約説明を除去し、
nullable・unique・onDelete・複合制約を実際の定義で掲載。ORG_INVITE enumの残存は注記。
`tools/schema-doc.cjs --check`成功、生成済みPrisma ClientのDMMFとも全モデル・enum・FKを照合。
READMEの参照をリンク化し、GameRecord/Matchの旧称も修正。DB/migration自体は変更していない。

2026-09-26再確認: schema生成ツールで20モデル・15 enum・30 FK relationの同期に成功し、
英語・日本語READMEの件数とモデル名も現在のschemaへ合わせた。

## P4: 品質保証

### 26. 自動テスト（完了）

- [x] Backend type-checkを成功させる
- [x] Backend Jestを全件成功させる
- [x] Frontend type-checkを成功させる
- [x] Frontend multiplayer testsを全件成功させる（2026-09-18、5件）
- [x] C++ CTestを全件成功させる
- [x] HTTP/WebSocketの認証・認可E2Eを追加
- [x] 2人・3人・Tournament・Spectatorの統合テストを追加

2026-09-25再検証（ファイル生成を伴わない範囲）: backend `tsc --noEmit` 成功、backend Jest
38 suite / 256テスト全件成功、frontend `tsc --noEmit -p tsconfig.app.json` 成功、
frontend `node --test` 11ファイル / 35テスト全件成功（multiplayer 6件を含む）。
Vite本番build、Docker build、C++ CTestは今回未実行。

2026-09-26再検証: 全workspace type-check、backend 41 suite / 265テスト、frontend 11ファイル /
36テスト、frontend/backend lint、warningなしのVite production build、Docker AI toolchain内の
CTest 5件、ER同期、Compose構文、npm audit（全依存・productionのみ、ともに0件）が成功。
HTTP 6件は通常sandboxでlisten EPERMになった後、localhost待受許可環境で全件成功した。

2026-09-26追記: guardを差し替えず実Passport JWT/JwtStrategyを通すHTTP試験を追加し、tokenなし、
不正形式、期限切れ、権限不足を401/403で拒否し、ADMINの署名済みsubjectだけが管理操作へ渡ることを確認。
実Socket.IO server/client試験ではtokenなし・不正JWTのchat拒否、署名済みsubjectの復元、
ChatServiceによるroom membership拒否を確認。DB/serviceの副作用部分のみtest doubleを使用。

同試験で署名JWTを持つ4ユーザーがCustom Roomへ参加し、永続Tournament作成serviceとの接続、
同時2試合への分離、外部5人目のactive match観戦と盤面snapshot受信までを実Socket.IOで確認。
実HTTPS stackのsmoke testでも3人Custom Matchと外部Spectatorを追加し、2人Random Match、再接続と合わせて成功。

### 27. lint・build（完了）

- [x] Backend ESLintエラーを解消
- [x] Frontend lint warningを解消
- [x] `AiPreviewPage.tsx` から `TetrisUI` へ必須の `combo` propを渡し、TS2741を解消
- [x] Viteの `@theme` warningを解消（通常の `:root` へ置換、本番ビルド成功）
- [x] production用frontend/backend imageを用意
- [x] development serverに依存せずproduction構成で起動確認

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

2026-09-25追記: backend全体の `eslint "{src,apps,libs,test}/**/*.ts" --max-warnings 0`
（`--fix` なし）がエラー・警告0件で成功。`lint` scriptは自動修正なしの検査へ変更し、
自動修正は `lint:fix` に分離。spec向けに一部ルールを緩和している。
`docker-compose.production.yml`、backend/frontendのproduction target、`nginx-spa.conf` を追加したが、
production imageのbuild・起動は未実施。静的確認では、backend production stageが
`node_modules` のみをコピーし、symlink先の `packages/shared` を含まないため
`@transcendence/shared` の解決に失敗する懸念がある。また `prisma migrate deploy` を
実行する手順がなく、追加migrationが本番DBへ適用されない。このため第27項の該当2件は未チェック。

2026-09-25追記: backend production imageを実際にbuild・起動し、上記の `@transcendence/shared`
解決失敗を確認。さらに `@prisma/client` 解決失敗と、存在しない `dist/main` を起動していた問題も判明。
本番stageを `/app/apps/backend` 配下のモノレポ配置へ変更し、`packages/shared` の
`package.json`/`dist` をコピー、CMDと `start:prod` を `dist/src/main` へ修正。
Vault必須設定ではVault未設定時に起動を停止し、Vault任意設定では全モジュールの初期化後に
DB未接続（Prisma P1001）で停止することを確認。frontend production imageはnginxで
`/` と `/dashboard`（SPA fallback）が200、`nginx -t` 成功。
`docker-compose.production.yml` 全体（Vault init/unseal、DB、Redis、nginx）の起動と
migration適用手順（`prisma migrate deploy`。DATABASE_URLはVaultから読むため実行位置の設計が必要）は未完了。

2026-09-25追記（本番構成の全体起動確認）: 開発スタックと分離するため
`COMPOSE_PROJECT_NAME=ft-prod-check NGINX_PORT=9443 NGINX_HTTP_PORT=9080` で実施。
- `tools/prod-vault-init.sh`（後に `tools/vault-init.sh` へ置換、第20項参照）を追加。Vaultのinit（1 share）・unseal・kv-v2有効化・
  `secret/transcendence` 投入（DB/Redis URL、JWT/refresh/session secretを生成）・policy適用・
  backend用のperiodic orphan token発行を行い、Git管理外の `secrets/` へ保存。再実行時は既存値を再利用する。
- `src/migrate.ts` を追加し、backend CMDを `node dist/src/migrate && exec node dist/src/main` に変更。
  Vaultから読んだDATABASE_URLで `prisma migrate deploy` を実行してからアプリを起動する。
- `AuthModule` の `JwtModule.register` がimport時に `process.env.JWT_SECRET` を読んでおり、
  Vaultの値が入る前に評価される問題を `registerAsync` へ修正。
- 空DBへ既存6 migrationを適用後、`prisma migrate diff` でschemaとの差分を検出
  （`GameMode` の `LINES_40`/`MARATHON`、`User.twoFactorSecret`、削除済みOrganization/
  DataExportRequest関連）。開発環境の `db push` でのみ反映されていたため、
  `20260925200000_sync_schema_drift` を追加し、適用後の差分が0件であることを確認。
- 確認結果: 全6コンテナ起動（postgres/redis/nginx healthy）、Vault読込・migration・DB/Redis接続成功。
  HTTP→`https://localhost:9443` の301、`/` と `/dashboard` 200、`/api/docs` 200、
  register 201・login 200・`/api/users/me` 200（passwordHash/twoFactorSecretを含まない）、
  2FA generate 201、表示設定PATCH 200、archive GET 200、不正token 401、socket.io polling 200。
  `WAF_BASE_URL=https://localhost:9443 ./tools/test-waf.sh` 全件成功。
  公開ポートはnginxの9080/9443のみ。停止→再起動後も再unsealでVault/DBのデータを保持し、
  既存ユーザーでlogin 200、`No pending migrations`。検証後はコンテナ・volume・image・secretsを削除済み。
- 当時の残課題: Vault listenerはTLS無効（internal network内のみ）、unsealは手動、root tokenと
  unseal keyが `secrets/vault-init.json` に残る、開発DBが `db push` 管理。42 OAuth・SMTPは実値未投入で未検証（後回し）。
  unseal・鍵保管は第20項の追記で解消。開発DBは下記で解消。

2026-09-25追記（開発DBのmigration移行）: 開発backendの起動コマンドを `prisma db push --accept-data-loss` から
`ts-node --transpile-only src/migrate.ts` へ変更（schema変更は `make migrate-dev name=...` で作成）。
`MIGRATE_BASELINE_EXISTING=true` の場合のみ、`_prisma_migrations` がなくテーブルが存在するDBについて
`prisma migrate diff --exit-code` でschemaと完全一致を確認したうえで全migrationを `migrate resolve --applied` で
baseline化し、差分がある場合はDBへ書き込まずに停止する。事前に `pg_dump` でバックアップ
（`/tmp/ft-dev-backup/dev-db-before-baseline.dump`）を取得して既存開発DBへ適用し、7件をbaseline化、
User件数不変、再起動時は `No pending migrations`。差分のある使い捨てDBでは起動が停止し
`_prisma_migrations` も作成されないことを確認（検証DBは削除済み）。backend 38 suite / 256テスト、
lint、type-check成功。

### 28. 負荷・同期試験（完了）

- [x] 複数試合を同時実行して状態が混ざらないことを確認
- [x] 非アクティブタブでもサーバー上の進行が変化しないことを確認
- [x] 遅延・切断・重複イベント・順序逆転を再現
- [x] reconnect後に盤面、next、hold、garbage、scoreが一致することを確認

2026-09-26: 4 socket相当を同時にqueueへ入れ、2つの一意なroomへ正しく分離されqueueが空になる
Gateway testを追加。2つの `GameInstance` を同時進行し、一方のhard dropと重複した古いpieceIdが
他方の盤面・piece数へ影響しないこと、各roomIdのsnapshotだけが送られることを確認。
既存の自動lock後の遅延入力、Hold後/再戦後の古いpieceId、guest/authenticated disconnect/rebind試験と
合わせて対象2項目を完了。さらに実HTTPS/Socket.IOスタックへ4 guestを接続するsmoke testで、
一意なsession、2試合のroom分離、不正payload拒否を確認。1 clientの切断・token再接続後に同一roomへ復帰し、
`game:state` のboard、nextMinos、holdMino、garbageQueue、scoreを照合した。実ブラウザのbackground tabは未完了。

2026-09-26追記: `tools/browser-smoke.mjs` の2人CUSTOM_ROOMS試合に、実Chromeの片方のタブを
`Page.setWebLifecycleState: frozen` で4秒凍結する測定を追加（JS停止は通常のbackground tabのthrottlingより厳しい条件）。
Playwrightがブラウザ外で記録した各自の `game:state` フレームから、無入力の間の `activeMino.y` の増分を比較し、
凍結側の落下がサーバー重力で継続すること、同じpieceIdのままであること、アクティブ側と同じ行数進むこと、
凍結中もサーバーからフレームが送られ続けることを検証。2回実行し、凍結側/アクティブ側が5/5行と4/4行で一致、
凍結中のフレームは4件。既存の復帰後再描画・reload再接続・再戦も継続成功。
対象はサーバー進行のONLINE_1V1/CUSTOM_ROOMS。VS_AIの人間側盤面はフロントエンドで計算する設計のため対象外。

## 現在の検証コマンド

```bash
npm run type-check
npm test --workspace @transcendence/backend -- --runInBand
node --test apps/frontend/tests/*.test.cjs
npm run build --workspace apps/frontend
npm run test:browser
npm run test:websocket
npm run test:auth   # 実行ごとにauthsmoke_*ユーザーを作成する。OAuth確認は AUTH_SMOKE_OAUTH_EMAIL を指定
make ai-build
ctest --test-dir build/ai-agent --output-on-failure
docker compose config --quiet

# 本番構成（開発スタックと並行する場合はプロジェクト名とポートを分ける）
export COMPOSE_PROJECT_NAME=ft-prod-check NGINX_PORT=9443 NGINX_HTTP_PORT=9080
make prod-up   # = VAULT_ENV=production ./tools/vault-init.sh + compose up -d --build
WAF_BASE_URL=https://localhost:9443 ./tools/test-waf.sh
docker compose -f docker-compose.production.yml down -v --rmi local
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
