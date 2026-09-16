# Remaining Tasks for `ft_transcendence`

この文書は、`subject.md`、`proceed.md`、README、および現在の実装を比較した監査結果に基づく残タスク一覧です。

- 最終更新: 2026-09-15
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
| 未解消 | `npm run build --workspace=@transcendence/frontend` | `AiPreviewPage.tsx(560,8): TS2741`。`TetrisUIProps` が要求する `combo` が渡されていない | `AiPreviewPage` から `TetrisUI` へ現在のREN値を渡し、frontend buildを再実行する。第27項にも登録 |
| 未解消 | `node --test apps/frontend/tests/multiplayer.test.cjs` | Game over後の観戦状態について、期待値 `SPECTATING` と実装側の状態が一致しない | 観戦遷移と古いstateの破棄を修正する。第11項に登録済み |
| 未解消 | Chrome 147、トップページ | PixiJSが `renderer.plugins.interaction has been deprecated, use renderer.events` をconsoleへ出力 | PC・タブレット・スマホの全viewportで再現。依存ライブラリと`BackgroundTetris`の利用方法を更新し、production buildでも再確認する |
| 未解消 | Chrome 147、390x844 viewport | トップ画面のタイトル、幅360pxのボタン、背景盤面が右側でクリップされる | 390px幅に固定幅と配置計算が収まっていない。スマホ用の幅をviewport基準にして実機相当で再確認する |
| 未解消 | Docker image build | npmがModerate 1件、High 12件、合計13件の脆弱性を報告 | `npm audit` で到達可能性を確認し、互換性を保って更新する。第1A項に登録済み |
| 解消済み | Backend type-check | Prisma Clientがschemaより古く、`twoFactorSecret` 関連のTypeScriptエラーが8件発生 | build/type-check/Docker起動前に同一schemaから `prisma generate` するよう統一 |
| 解消済み | Vite CSS読み込み | `[plugin:vite:css] [postcss] ENOENT: no such file or directory, open 'tailwindcss'` | 存在しないTailwind importへの依存を除去。現在のソースに `tailwindcss` 参照がないことを確認 |
| 一時的・解消済み | Nodemailer依存追加 | npm registryへの接続が `EAI_AGAIN` で失敗 | sandbox外の許可済みnpm通信で再実行し、lockfile整合性を `npm ci --dry-run` で確認 |
| 解消済み（原因未確定） | `make re` | 過去にビルド失敗。ディスク容量不足が原因の可能性あり | 空き容量確保後の2026-09-15に再実行して成功。空き213GB、全image build成功、全6コンテナ起動、nginx/PostgreSQL/Redis/Vaultのhealthcheck成功を確認。元の失敗ログがないため原因自体は未確定 |

現在の既知のbuild阻害要因は、frontendの `AiPreviewPage.tsx` における
`combo` prop不足である。GDPR変更に対するbackend build、全workspaceの
type-check、backend Jest 111件は成功している。

`make re` が生成するfrontend imageはdevelopment targetであり、Viteの
production buildを実行していない。そのため、`make re` の成功は上記TS2741の
解消を意味しない。production buildは別途修正・再検証が必要である。

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

- [ ] `/profile/:id` のルートを追加するか、検索画面の遷移先を既存ルートへ合わせる
- [ ] プロフィール、avatar、オンライン状態、戦績、フレンド操作を表示
- [ ] 削除済み・存在しないユーザーを適切に処理

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

- [ ] Game over後の観戦遷移で `VS_SCREEN` ではなく `SPECTATING` になるよう修正
- [ ] 古いplayer stateと遅延イベントを破棄
- [ ] Tournament終了後に盤面が重複表示されないことを確認
- [ ] ESCで観戦から退出できることを確認

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

## P2: READMEで申告するなら完成が必要なモジュール

### 14. Public API

- [ ] GETだけでなくPOST/PUT/DELETEを含むAPIを用意
- [ ] 5つ以上の有用なendpointを保証
- [ ] API key認証、失効、期限、rate limitをテスト
- [ ] Swaggerの例・エラー応答・認証方法を完成

### 15. User statistics

- [ ] Achievement付与ロジックを実装
- [ ] AchievementとprogressionをUIに表示
- [ ] XP、level、rankPointsの更新ルールを実装
- [ ] leaderboardと実データを一致させる

### 16. Advanced permissions

- [ ] 管理者によるユーザー作成・編集・削除を追加
- [ ] ADMIN/MODERATOR/USER/GUESTの権限表を定義
- [ ] MODERATORがADMINや他のMODERATORをBANできないよう階層を検証
- [ ] 自分自身のBANや最後のADMIN削除などを防止
- [ ] 操作監査ログを検討

### 17. Customization

- [ ] `minoSkin` を実ゲーム描画へ反映
- [ ] `showGhost` を実ゲームへ反映
- [ ] theme/map/background選択をユーザー設定として保存
- [ ] カスタムルールとデフォルトルールをUI上で明確化
- [ ] 設定が対戦相手やサーバールールを不正に変更しないよう分離

### 18. Advanced analytics

- [ ] `GameAnalytic` のAPM、PPS、lines、playtimeを実際に更新
- [ ] Dashboardのmode値をPrismaの `GameMode` と一致させる
- [ ] リアルタイム更新を追加
- [ ] 日付範囲とフィルターを追加
- [ ] CSV/PDFの内容を検証
- [ ] グラフと集計APIの数値が一致するテストを追加

### 19. Data import/export

- [ ] JSON以外にCSV/XMLを実装するか、モジュール申告から外す
- [ ] format validationを実装
- [ ] bulk import/exportを実装
- [ ] インポート前のpreviewとエラー行表示を検討

### 20. WAF + Vault

- [ ] Vaultのdev modeと固定root tokenを廃止
- [ ] 永続化された暗号化storageを使用
- [ ] Vault取得失敗時に秘密情報へ無条件フォールバックしない
- [ ] WAFルールをstrict modeとして検証
- [ ] SQLi、XSS、異常payloadの拒否テストを用意

この要件を満たさない場合は、WAF/VaultモジュールをREADMEの申告から外す。

### 21. Design system

- [ ] Tailwindを使わないなら未処理の `@theme` を通常のCSS変数へ変更
- [ ] palette、typography、spacing、iconsを一元管理
- [ ] 10個以上の再利用可能なUI componentを明示
- [ ] Vite build warningを解消

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

- [ ] AI難易度をEasy/Hard/Expertへ更新
- [ ] 未実装のOrganization記述を削除するか実装
- [ ] RedisをWebSocket scaling/sessionへ使用しているという記述を修正
- [ ] Human vs AIを含むserver-authoritative範囲を正確に記述
- [ ] 実際のモジュール数・ポイントへ更新

### 25. ER図をPrisma schemaへ同期する

- [ ] 存在しないOrganization関連テーブルを削除するか実装
- [ ] AI difficultyをEasy/Hard/Expertへ更新
- [ ] 実際のtable数・relation・enumを再生成
- [ ] READMEから参照されるER図が最新であることを確認

## P4: 品質保証

### 26. 自動テスト

- [x] Backend type-checkを成功させる
- [x] Backend Jestを全件成功させる
- [x] Frontend type-checkを成功させる
- [ ] Frontend multiplayer testsを全件成功させる
- [x] C++ CTestを全件成功させる
- [ ] HTTP/WebSocketの認証・認可E2Eを追加
- [ ] 2人・3人・Tournament・Spectatorの統合テストを追加

### 27. lint・build

- [ ] Backend ESLintエラーを解消
- [ ] Frontend lint warningを解消
- [ ] `AiPreviewPage.tsx` から `TetrisUI` へ必須の `combo` propを渡し、TS2741を解消
- [ ] Viteの `@theme` warningを解消
- [ ] production用frontend/backend imageを用意
- [ ] development serverに依存せずproduction構成で起動確認

### 28. 負荷・同期試験

- [ ] 複数試合を同時実行して状態が混ざらないことを確認
- [ ] 非アクティブタブでもサーバー上の進行が変化しないことを確認
- [ ] 遅延・切断・重複イベント・順序逆転を再現
- [ ] reconnect後に盤面、next、hold、garbage、scoreが一致することを確認

## 現在の検証コマンド

```bash
npm run type-check
npm test --workspace @transcendence/backend -- --runInBand
node --test apps/frontend/tests/keyboard.test.cjs
node --test apps/frontend/tests/multiplayer.test.cjs
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
