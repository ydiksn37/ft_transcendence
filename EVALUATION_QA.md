# ft_transcendence 評価対応 Q&A

この文書は `eval.md` の順番に沿った、評価当日に使用する回答・実演ガイドです。
回答は暗記用の例であり、質問された本人が自分の言葉で説明してください。画面だけを見せて終わらず、
「何を満たすか」「どの実装が根拠か」「どう動作確認するか」の順で説明します。

## 0. 評価開始前の準備

### 出席・環境チェック

- 4名全員（`yukusano`、`sonakamu`、`ssawa`、`kaisuzuk`）が出席する。
- 公式提出リポジトリを空のディレクトリへcloneした環境を使う。
- 最新安定版Google Chromeを使い、DevToolsのConsoleとNetworkを開けるようにする。
- `.env.example`から評価用`.env`を用意する。秘密値は画面共有やcommitに出さない。
- 42 OAuthのredirect URIを`https://localhost:8443/api/auth/42/callback`にする。
- SMTPを使うGDPR削除まで実演する場合は、送受信できる評価用SMTPを設定する。
- 2人対戦用にChromeの独立contextを2つ用意する。観戦も示す場合は3つ用意する。
- 評価用の一般ユーザー2名、ADMIN 1名、Authenticatorアプリを準備する。

### 起動と健全性確認

初回セットアップ後、アプリ全体のデプロイは1コマンドです。

```bash
cp .env.example .env
make install
make build
docker compose ps
curl -skI https://localhost:8443/
curl -skI http://localhost:8080/
```

当日の変更が検証済みであることも確認します。

```bash
npm run type-check
npm run lint
npm test --workspace @transcendence/backend -- --runInBand
node --test apps/frontend/tests/*.test.cjs
npm run build --workspace @transcendence/frontend
npm run security:secrets
node tools/schema-doc.cjs --check
```

Chromeを使う統合確認は、HTTPS stackの起動後に実行します。

```bash
npm run test:browser
npm run test:websocket
```

直近の確認では、Backend Jestは43 suites / 381 tests、Frontendは54 tests、workspaceの
type-check・lint、Frontend production build、Chrome smoke testが成功しています。
件数はコード追加により変わるため、評価当日の実行結果を正として説明します。

---

## 1. 事前確認（Preliminaries）

### チームメンバーは全員出席しているか？

**評価シートの確認内容（原文）**

> チームメンバー全員（4〜5人）が評価に出席していることを確認する。
>
> 全員が出席していない場合、レビューはここで終了する。
>
> **チームメンバーは全員出席しているか？**

**回答例**

> はい。4名全員が出席しています。Product Ownerのkaisuzuk、Project Managerのyukusano、
> Technical Leadのsonakamu、Developerのssawaです。全員がDeveloperも兼任しています。

欠席者がいる場合は取り繕わず、評価規則に従います。

### 各メンバーが自分の役割と貢献を明確に説明できるか？

**評価シートの質問項目（原文）**

各チームメンバーに個別に、次のことを説明してもらう。

- プロジェクトでの役割（PO、PM、Tech Lead、Developer）
- 具体的な貢献と担当した作業
- 本人が実装した機能またはモジュールを最低1つ

> **各メンバーが自分の役割と貢献を明確に説明できるか？**

#### kaisuzuk

> **役割:** Product Owner兼Developerで、UI/UX・Reactを担当しました。
>
> **具体的な貢献と担当作業:** 製品体験と優先順位を整理し、React SPA、ネオン調の再利用UI、
> ダッシュボードのチャート、トーナメント表示、レスポンシブ画面を担当しました。React component、
> Zustand store、custom hookへ責務を分け、チャット・フレンド・大会・統計画面を保守できる構成にしました。
>
> **最低1つの実装機能・モジュール:** Advanced Analytics Dashboardです。勝率、APM、PPS、対戦履歴を
> chartとfilterで確認できる画面を実装しました。

**操作方法**

1. Userでloginし、Menu右側の`DASHBOARD`を選ぶか、`/dashboard`を開く。
2. 勝敗、APM、PPS、履歴のchartを表示する。
3. 履歴filterを`ALL`から`VERSUS`、`AI`、`TOURNAMENT`へ変更する。
4. `apps/frontend/src/pages/Dashboard.tsx`と`components/dashboard`を開き、表示と実装を対応させる。

#### yukusano

> **役割:** Project Manager兼Developerで、Backend・Database・DevOps・Securityを担当しました。
>
> **具体的な貢献と担当作業:** Docker Compose、Nginx HTTPS、NestJS API、Prisma/PostgreSQL、Redis、
> Vault、WAF、認証・ユーザー管理を担当しました。RESTへ厳格なOWASP CRSを適用しつつSocket.IOと
> 開発assetだけを必要最小限に除外し、Vaultの初期化・unseal・secret投入を再実行可能にしました。
>
> **最低1つの実装機能・モジュール:** Standard User Management and Authenticationです。
> 登録・login、profile、avatar、friend、online status、BAN状態の確認をBackendとFrontendへ実装しました。

**操作方法**

1. `/login`で新規登録し、logout後にemail/passwordで再loginする。
2. `/profile`でdisplay name、bio、presetまたはupload avatarを変更する。
3. `/friends`で別userへ申請し、別contextで承認してonline statusを確認する。
4. `apps/backend/src/auth/auth.service.ts`、`users.service.ts`、Prismaの`User`/`Friendship`を示す。
5. Infraの担当根拠として`docker compose ps`、Nginx設定、Vault初期化scriptも示す。

#### sonakamu

> **役割:** Technical Lead兼Developerで、Game Engine・Frontend Logicを担当しました。
>
> **具体的な貢献と担当作業:** PixiJS盤面描画、local操作、multiplayer stateの表示、READY・NEXT・
> HOLD・観戦への状態遷移を担当しました。serverのauthoritative snapshotを適用しながら、操作感と
> 表示の一貫性を維持しました。
>
> **最低1つの実装機能・モジュール:** Web-based Gameです。7-bag、rotation、collision、drop、lock、
> line clear、NEXT/HOLD、勝敗を画面へ結合しました。

**操作方法**

1. `/menu`で`MARATHON`または`40 LINES`を選び、移動、rotation、HOLD、hard dropを操作する。
2. line clear、score、NEXT、ghost、game overを示す。
3. remote matchで相手盤面とserver snapshotが表示へ反映されることを示す。
4. `TetrisUI.tsx`、game hooks、PixiJS rendererを開き、表示責務を説明する。

#### ssawa

> **役割:** Developerで、AI・Multiplayer Logicを担当しました。
>
> **具体的な貢献と担当作業:** C++ headless AI、衝突判定、AIとTypeScript game engineの統合、
> WebSocket同期を担当しました。各試合のC++ processに判断時間の上限を設け、返された操作列を
> TypeScript側で再生することで、AIがgameの同じruleに従う構成にしました。
>
> **最低1つの実装機能・モジュール:** AI Opponentです。盤面のheight、holes、bumpinessなどを評価し、
> Easy/Hard/Expertの難易度で操作列を返すC++ agentとBackend連携を実装しました。

**操作方法**

1. `/menu`から`MULTI PLAY`、`VS AI`を選択する。
2. Easy、Hard、Expertを順に選び、move speedを変更して試合を開始する。
3. `/ai-preview`でAI同士の盤面とspeed controlを示す。
4. `apps/ai-agent/src`、`ai-agent.service.ts`、`game-instance.ts`を開き、process起動と操作再生を説明する。

**見せる根拠**

- `README.md`の「Team Information」「Individual Contributions」
- 担当機能の実コード
- `git log --all --oneline --decorate`

### README.md は必須セクションをすべて含み、完全か？

**評価シートの確認項目（原文）**

- プロジェクト名と説明
- チームメンバーと割り当てられた役割（PO、PM、Tech Lead、Developers）
- プロジェクト管理の方法（作業をどう組織したか）
- 使用技術とその選定理由
- データベーススキーマ
- 機能一覧と、それぞれの実装者
- 選択したモジュールとその理由、およびポイント計算
- 各メンバーの個人的な貢献

> **README.md は必須セクションをすべて含み、完全か？**

**回答例**

> はい。冒頭にプロジェクト名と目的、起動手順、技術stackと選定理由があります。
> 続いてPrisma schemaとER図、4名の役割、管理方法、機能と担当者、評価で主申告する14ポイント、
> 個人の貢献を記載しています。追加候補は基本14ポイントから分離し、実演できたものだけを追加申告します。

**確認箇所**

| 評価項目 | READMEの見出し |
| --- | --- |
| 名前・説明 | `Project T` / `Description` |
| 起動方法 | `Instructions` |
| 技術と理由 | `Technical Stack` |
| DB schema | `Database Schema` と `ER.md` |
| 役割 | `Team Information` |
| 管理方法 | `Project Management` |
| 機能と実装者 | `Features List` |
| 選択module・理由・点数 | `Modules Selected for Evaluation — Core 14 points` |
| 個人の貢献 | `Individual Contributions` |

**操作方法**

1. `README.md`を上から順に開く。
2. 上の8項目を評価者と一つずつ照合する。
3. `Modules Selected for Evaluation — Core 14 points`の合計をその場で再計算する。
4. `ER.md`のリンクを開き、`node tools/schema-doc.cjs --check`を実行する。

### 異なるメンバーがプロジェクトを一貫して説明できるか？

**評価シートの質問項目（原文）**

- プロジェクトのコンセプトと、何をするものか
- 主要な使用技術とその理由
- チームで作業をどう調整したか

> **異なるメンバーがプロジェクトを一貫して説明できるか？**

少なくとも2名が、以下と同じ内容を別々に説明できるようにします。

**回答例**

> Project Tは、ブラウザで遊べるリアルタイム対戦型Tetris-like gameです。Solo、AI、remote 1v1、
> Custom Room、Tournament、Spectatorに加え、認証、profile、friend、chat、statsを統合しています。
> React/ViteがSPA、PixiJSがゲーム描画、NestJSがRESTとSocket.IO、PostgreSQL/Prismaが永続data、
> Redisが短命なsecurity stateとrate limit、NginxがHTTPS reverse proxyとWAF、Vaultがsecret管理を担います。
> online対戦はserver-authoritativeにして、両clientが同じ盤面stateを受け取る設計です。

**「なぜこの構成か」への回答**

> Reactは画面と状態をcomponent化しやすく、Viteは開発とbuildが速いため選びました。PixiJSは盤面を
> WebGLで安定して描画できます。NestJSはREST、DI、guard、DTO、WebSocket gatewayを同じ規約で構成できます。
> PostgreSQLとPrismaはuser・result・tournamentのrelationとtransactionを型安全に扱えます。
> Redisは永続domain dataではなく、refresh-token失効、削除確認code hash、API rate limitに限定しています。
> Socket.IO roomとreconnect stateは単一backend process内で管理し、Redis adapterを使用しているとは説明しません。

**操作方法**

1. 1人目が画面を使い、Join → Menu → Game → Dashboardの流れで製品全体を説明する。
2. 2人目がrepositoryを使い、Frontend → Backend → Database → Nginxのdata flowを説明する。
3. 両者が同じ役割分担とserver-authoritative範囲を説明できることを確認する。

### Git履歴に適切なチームでの協力が表れているか？

**評価シートの確認項目（原文）**

- リポジトリに全メンバーのコミットがある
- コミットメッセージが明確で意味がある
- 作業がメンバー間で分担されている

> **Git履歴に適切なチームでの協力が表れているか？**

**回答例**

> はい。4名全員のcommitが既存履歴にあります。過去の端末設定によりauthor名に表記揺れがありますが、
> author email、commit内容、担当機能を合わせて4名分を確認できます。履歴の書き換えは行っていません。

**確認コマンド**

```bash
git shortlog -sne --all
git log --all --date=short --format='%ad  %an <%ae>  %s' --reverse
git log --all --stat
```

表記の対応は、`yudai.kusano` / `Yudai Kusano`がyukusano、`sen469` / `ssawa`がssawa、
`Fibonshin` / `fibonshin`がsonakamu、`Kaisei Suzuki`がkaisuzukです。数字だけでなく、各人の担当fileと
commit内容を実際に開いて説明します。

**操作方法**

1. `git shortlog -sne --all`で4名のauthorを確認する。
2. `git log --all --stat`から各人の代表commitを1件以上開く。
3. commit message、変更file、READMEの担当が対応することを説明する。
4. author表記の揺れはemailと内容で説明し、履歴を加工したとは説明しない。

---

## 2. 一般要件（General Requirements）

### 3つの構成要素がすべて揃っているか？

**評価シートの確認項目（原文）**

- フロントエンド
- バックエンド
- データベース

> **3つの構成要素がすべて揃っているか？**

**回答例**

> はい。Frontendは`apps/frontend`のReact/Vite/PixiJS SPA、Backendは`apps/backend`のNestJS REST・
> Socket.IO application、DatabaseはPostgreSQLで、`apps/backend/prisma/schema.prisma`をPrisma ORMで管理します。
> Nginxが唯一の外部入口となり、`/api`と`/socket.io`をBackendへ、それ以外をFrontendへproxyします。

**実演**

```bash
docker compose ps
curl -skI https://localhost:8443/
curl -skI https://localhost:8443/api/docs
```

必要なら`docker compose exec postgres`でtableを確認し、BrowserのNetworkでHTTPS APIとWebSocketを示します。

### 単一のコマンドでデプロイできるか？

**評価シートの確認内容（原文）**

> アプリケーション全体を、コンテナ技術（Docker、Podman など）を使って単一のコマンドでデプロイできるか。
>
> **単一のコマンドでデプロイできるか？**

**回答例**

> はい。依存導入と`.env`準備後は`make build`の1コマンドです。AIのbrowser build、Vaultの初期化・unseal、
> Docker imageのbuild、全serviceの起動を行います。通常の再起動は`make up`です。

`docker compose ps`でPostgreSQL、Redis、Vault、Vault unsealer、Backend、Frontend、Nginxの状態を見せ、
`https://localhost:8443`へアクセスします。8080は8443へredirectするHTTP入口、8443が正規のHTTPS入口です。

**操作方法**

1. `make build`を実行する。
2. 完了後に`docker compose ps`を実行し、必要serviceが起動していることを確認する。
3. Chromeで`https://localhost:8443`を開く。
4. 初回だけself-signed certificateの警告を進み、Join画面が出ることを示す。
5. `docker compose logs --tail=50 backend nginx`で致命的な起動errorがないことを示す。

### 最新の Chrome でエラーや警告なく動作するか？

**評価シートの確認内容（原文）**

> 最新の安定版 Google Chrome で、コンソールにエラーや警告を出さずに動作するか。
>
> **最新の Chrome でエラーや警告なく動作するか？**

**回答例**

> 通常操作ではありません。Chrome DevToolsのConsoleでPreserve logを有効にし、error・warning filterを表示したまま、
> login、menu、profile、admin、search、room、match、reconnectを操作します。通信失敗はconsoleへ放置せず、
> 回復可能なmessageとして画面へ表示します。ErrorBoundaryは本当に未処理の描画errorが起きた場合だけ記録します。

**実演手順**

1. Consoleをclearする。
2. `/`、`/login`、`/menu`、`/profile`、`/search`を遷移する。
3. Custom Roomを作り、別contextから参加して試合を開始する。
4. 片方をreloadし、reconnect後に盤面が再同期されることを示す。
5. Consoleにerror・warningがないこと、Networkにmixed contentがないことを示す。

補助として`npm run test:browser`がconsole error、warning、page error、mixed contentを失敗扱いにします。

### 両ページにアクセスでき、適切な内容があるか？

**評価シートの確認項目（原文）**

- アプリケーションから簡単にアクセスできる（例: フッターのリンク）
- プロジェクトに関連した適切な内容を含む
- プレースホルダーや空のページではない

> **両ページにアクセスでき、適切な内容があるか？**

**回答例**

> はい。入口pageのfooterからPrivacy PolicyとTerms of Serviceへ移動できます。
> どちらもProject Tのdata利用・利用条件を記載した実ページで、空のplaceholderではありません。

**実演URL**

- `https://localhost:8443/privacy-policy`
- `https://localhost:8443/terms-of-service`

**操作方法**

1. `/`のfooterで`Privacy Policy`を選び、本文と戻る操作を確認する。
2. `/`のfooterで`Terms of Service`を選び、本文と戻る操作を確認する。
3. address barで上記routeへ直接アクセスしても表示されることを示す。

---

## 3. 技術要件（Technical Requirements）

### フロントエンドは見やすく、レスポンシブで、アクセシブルか？

**評価シートの確認内容（原文）**

> 少なくとも2つの異なる画面サイズ（デスクトップとモバイル/タブレット）で試す。画面サイズに応じて
> インターフェースが適切に変わり、デスクトップでもモバイルでも使えること。
>
> **フロントエンドは見やすく、レスポンシブで、アクセシブルか？**

**回答例**

> desktop、tablet、mobileでlayoutが切り替わり、navigation、login、legal pages、profileなどを操作できます。
> form label、button、status、alert、dialogのARIA属性、keyboard focus、Escape、Tab focus trapを実装しています。
> Mobileでは画面サイズと操作性を考慮してMULTI PLAYを意図的に表示していません。remote対戦の評価実演は
> desktopの独立contextで行います。また、WCAG 2.1 AAのMajor module自体は申告していません。

**実演viewports**

- Desktop: 1440×900
- Tablet: 768×1024
- Mobile: 390×844

Chrome DevToolsで横scroll、modal、form error、keyboard操作を確認します。

**操作方法**

1. DevToolsのDevice Toolbarを開き、1440×900で`/`、`/menu`、`/login`、`/profile`を確認する。
2. 768×1024へ変更し、navigation、panel、formが重ならないことを確認する。
3. 390×844へ変更し、縦scroll、button、入力、legal page、mobile game controlを確認する。
4. KeyboardだけでTab/Shift+Tab/Enter/Escapeを使い、login formとmodalを操作する。
5. Modal内でfocusが循環し、閉じた後に元のcontrolへ戻ることを示す。
6. MobileでMULTI PLAYが意図的に非表示であることを説明し、勝手に「全desktop機能がmobile対応」とは答えない。

### CSSフレームワークまたはスタイリング手段が使われているか？

**評価シートの確認内容（原文）**

> CSSフレームワークまたはスタイリング手段が使われているか。例: Tailwind CSS、Bootstrap、
> Material-UI、Styled Components など。
>
> **CSSフレームワークまたはスタイリング手段が使われているか？**

**回答例**

> React向けのcustom design systemとCSSを使っています。`components/design-system`にButton、IconButton、
> Panel、Heading、Input、Select、Checkbox、Field、Badge、Alert、Spinner、Icon、Modalを用意し、
> `design-system.css`でcolor、typography、focus、状態表現を統一しています。PixiJSはゲーム盤面の描画に使います。

これは一般技術要件への回答です。Custom Design Systemの追加Minorを申告する場合は、10個以上のcomponentが
実画面で再利用されていることを別途実演します。

**操作方法**

1. `apps/frontend/src/components/design-system/index.tsx`を開く。
2. ButtonからModalまで10個以上のcomponentを数える。
3. `design-system.css`でpalette、typography、focus、disabled、alertの定義を示す。
4. Loginなど実画面を開き、componentが使われている箇所を対応させる。

### 認証情報は適切に保護されているか？

**評価シートの確認項目（原文）**

- `.env` ファイルが存在し、`.gitignore` に含まれている
- `.env.example` ファイルが用意されている
- リポジトリに機密性のある認証情報が含まれていない

> **認証情報は適切に保護されているか？**

**回答例**

> `.env`はGit管理外で、設定項目だけを持つ`.env.example`を管理しています。runtime secretはVaultからBackendへ
> 読み込みます。NginxはTLS 1.2/1.3で公開し、DB・Redisなどの開発用direct portはlocalhost bindです。
> tracked fileはsecret scannerで検査し、開発secretを失効させるrotation commandも用意しています。

**確認コマンド**

```bash
git check-ignore -v .env
git ls-files '.env*' '**/.env*'
npm run security:secrets
docker compose config --quiet
```

`.env`の内容、Vault token、OAuth/SMTP credentialは表示しません。開発用self-signed証明書であることも明示し、
productionでは信頼された証明書へ置換すべきだと説明します。

### 明確なスキーマと、よく定義されたリレーションがあるか？

**評価シートの確認内容（原文）**

> データベースに、明確に定義されたリレーションを持つ分かりやすいスキーマがあるか。
>
> **明確なスキーマと、よく定義されたリレーションがあるか？**

**回答例**

> PostgreSQLをPrisma ORMで管理しています。Userを中心にUserStatsとUserGameSettingsが1対1、GameResultは
> player1/player2/winnerとしてUserへrelationを持ちます。FriendshipとBlockはUser間の自己relationです。
> TournamentはEntryとMatchを持ち、TournamentMatchは必要に応じてGameResultへ関連します。
> unique、foreign key、onDelete、enum、indexをschemaに定義し、結果保存とstats更新など整合性が必要な処理は
> transactionで行います。

**見せるもの**

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/migrations/`
- `ER.md`（20 models、15 enums、30 foreign-key relationships）
- `node tools/schema-doc.cjs --check`

**操作方法**

1. `schema.prisma`のUserからrelation fieldを辿り、UserStats、GameSettings、GameResultを開く。
2. GameResultのplayer1/player2/winnerがUserを参照することを示す。
3. Tournament → TournamentEntry/TournamentMatch → GameResultを辿る。
4. Friendship/BlockがUser間の自己relationであることを示す。
5. `node tools/schema-doc.cjs --check`を実行し、20 tables / 15 enums / 30 relationsを確認する。
6. 必要ならPrisma Studioをread-onlyの説明用途で開き、実dataとrelationを示す。

### 安全な認証が提供されているか？

**評価シートの確認項目（原文）**

- メールアドレスとパスワードによる登録/ログイン
- 適切にハッシュ化され、ソルトが付与されたパスワード

> **安全な認証が提供されているか？**

**回答例**

> 登録時にpasswordをbcryptのcost 12でsalt付きhashへ変換し、DBには`passwordHash`だけを保存します。
> loginはbcrypt compareを使い、user不存在とpassword不一致で同じ401 messageを返して列挙を避けます。
> JWT access/refresh tokenを発行し、logoutしたrefresh tokenはRedis blacklistへTTL付きで保存します。
> BAN中・削除済みuserもloginで拒否します。2FA有効時は通常tokenを発行せず、5分の一時tokenとTOTP確認を要求します。

**実演**

1. 新規登録してloginできることを示す。
2. DBの`passwordHash`が平文でないことを、値全体を公開せず形式だけ示す。
3. 誤passwordが401になることを示す。
4. 2FA userではcode入力前にauthenticated pageへ入れないことを示す。

### すべてのフォームと入力が両側でバリデーションされているか？

**評価シートの確認内容（原文）**

> すべてのフォームとユーザー入力が、フロントエンドとバックエンドの**両方**でバリデーションされているか。
> 不正な入力（空欄、誤った形式、SQLインジェクションの試み、XSSの試みなど）で試し、バリデーションを確認する。
>
> **すべてのフォームと入力が両側でバリデーションされているか？**

**回答例**

> はい。Frontendはrequired、length、format、整数範囲、file size/typeを送信前に検証し、fieldまたはoperation errorを
> 画面へ出します。Backendはglobal ValidationPipeの`whitelist`、`transform`、`forbidNonWhitelisted`とclass-validator DTOで、
> Frontendを迂回したrequestも拒否します。Prismaのquery builderを使うためSQL文字列を連結しません。
> Reactは通常の文字列をescapeします。XSS/SQL injection文字列が単なる自由文として許可されるfieldでは、実行せずdataとして
> 扱うことが重要です。HTTP層にはさらにWAFがあります。Avatarは申告MIMEだけでなくPNG/JPEG/GIF/WebPのmagic byteと2MB上限を検証します。

**その場で試す入力**

- 空email、壊れたemail、長すぎるusername/password
- 2FA codeに文字、5桁、7桁
- BAN期間に`0`、`-1`、`1.5`、`999999`
- Room IDに空白や記号、存在しないID
- 検索へ`' OR 1=1 --`、messageへ`<script>alert(1)</script>`
- 拡張子だけPNGにしたtext file、2MB超のavatar
- DTOに`role`や未知fieldを追加したrequest

期待結果は、無効な形式・境界値はFrontendまたは400で拒否、未知fieldは400、注入文字列はqueryやscriptとして実行されず、
偽装画像は400、容量超過は413です。

**操作方法**

1. `/login`のregister formで空email、`abc`、2文字username、101文字passwordを順に入力する。
2. Browser validationまたは画面の`role="alert"`が表示され、requestが送信されないことをNetworkで確認する。
3. DevToolsまたはSwaggerから同じ不正payloadを直接Backendへ送り、Frontendを迂回しても400になることを示す。
4. 正常DTOへ`"role":"ADMIN"`や`"unknown":true`を追加し、`forbidNonWhitelisted`で400になることを示す。
5. `/search`へSQL injection風文字列を入力し、DB全件取得やquery実行が起きないことを示す。
6. ChatへHTML文字列を送り、scriptとして実行されずtextとして扱われることを確認する。
7. Profileで偽装PNGと2MB超fileを選び、400/413とfile未保存を示す。
8. `http-input-validation.spec.ts`、`form-validation.test.cjs`、avatar HTTP testを開いて境界testも示す。

### すべてのバックエンド接続に HTTPS が使われているか？

**評価シートの確認内容（原文）**

> バックエンドとの接続すべてに HTTPS が使われているか。
>
> **すべてのバックエンド接続に HTTPS が使われているか？**

**回答例**

> browserの正規入口は`https://localhost:8443`だけです。NginxがTLS terminationを行い、同一originの`/api`と
> `/socket.io`を内部networkのBackendへproxyします。WebSocketもHTTPSからWSSへupgradeされます。
> 8080はHTTPSへredirectするだけで、application UI/APIの正規入口ではありません。3000、5173、54320、63790の開発用portは
> localhost限定で、remote clientへ公開しません。

Chromeのaddress bar、Network requestの`https://`、Socket.IO connectionの`wss://`、mixed content 0件を示します。

**操作方法**

1. Chromeで`https://localhost:8443`を開き、鍵表示とschemeを確認する。
2. DevTools NetworkでFetch/XHRを選び、request URLが`https://localhost:8443/api/...`であることを示す。
3. WSを選び、Socket.IOがsecure contextから接続していることを示す。
4. Consoleのmixed-content warningが0件であることを確認する。
5. `curl -sI http://localhost:8080/`でHTTPSへのredirectを確認する。

---

## 4. モジュール確認（Core 14 points）

### モジュールで少なくとも14ポイントを申告しているか？

**評価シートの確認項目（原文）**

- 申告されたモジュールをすべて列挙する（Major = 2ポイント、Minor = 1ポイント）
- 合計ポイントを計算する

> **モジュールで少なくとも14ポイントを申告しているか？**

**回答例**

> 動作確認の優先順位を明確にするため、基本申告を14ポイントに限定しています。
> Majorが5件で10ポイント、Minorが4件で4ポイント、合計14ポイントです。

| 種別 | Module | 点 |
| --- | --- | ---: |
| Major | Frontend and Backend Frameworks | 2 |
| Major | WebSockets | 2 |
| Major | Standard User Management | 2 |
| Major | Web-based Game | 2 |
| Major | Remote Players | 2 |
| Minor | Database ORM | 1 |
| Minor | Game Statistics and Match History | 1 |
| Minor | OAuth 2.0 | 1 |
| Minor | Two-Factor Authentication | 1 |
|  | **合計** | **14** |

以下の順で、各moduleを個別に実演します。

**操作方法**

1. READMEの`Modules Selected for Evaluation — Core 14 points`を開く。
2. Major 5件を指し、`5 × 2 = 10`と計算する。
3. Minor 4件を指し、`4 × 1 = 4`と計算する。
4. `10 + 4 = 14`であることを評価者と確認する。

### 申告された Major モジュールはすべて適切に実装され、機能しているか？

**評価シートの確認項目（原文）**

- チームに実演してもらう
- 完全に実装され、機能していることを確認する
- Major モジュールとしての複雑さの要件を満たしているか確認する
- プロジェクトに実際の価値を加えていることを確認する
- モジュールの依存関係が満たされていることを確認する

> **申告された Major モジュールはすべて適切に実装され、機能しているか？**

次の5件をまとめて「実装済み」と答えるだけでなく、1件ずつ以下の操作で確認します。

### Major 1: Frontend and Backend Frameworks（2点）

**回答例**

> FrontendはReact 18とVite、BackendはNestJS 11です。React RouterでSPA route、hook/storeでstate、
> NestJSのmodule/controller/service/guard/DTO/gatewayでserverを構成しています。単にdependencyへ追加しただけでなく、
> application全体の構造として両frameworkを使用しています。

**操作方法**

1. Chromeで`/` → `/menu` → `/login` → `/dashboard`と遷移し、reloadしてもSPA routeが表示されることを示す。
2. `apps/frontend/src/App.tsx`を開き、React Routerとlazy componentを示す。
3. `apps/backend/src/app.module.ts`を開き、Auth/Users/Game/Tournament等のNest moduleを示す。
4. User取得を例にcontroller → service → Prismaの順でcodeを辿る。
5. `/api/docs`を開き、NestJSが生成するSwagger routeを示す。

### Major 2: WebSockets（2点）

**回答例**

> Socket.IOでmatchmaking、game state、input、garbage、room、chat、tournament、spectatorをreal-time配信します。
> serverはroom単位にbroadcastし、disconnect時は相手へ通知します。guestにはrandomなreconnect tokenを発行し、hashをserver側で保持して
> session hijackを防ぎます。grace期間内のreloadでは新socketへplayer stateを付け替えてsnapshotを再送します。

**操作方法**

1. Chrome Context A/Bで`/menu` → `MULTI PLAY` → `RANDOM MATCH`を選ぶ。
2. 両方が同じroomでREADY後に開始することを示す。
3. DevTools Network → WS → Framesで`game:state`等のreal-time frameを示す。
4. Aでmove/hard dropし、Bのopponent boardへ即時反映されることを確認する。
5. Aをreloadし、Bにdisconnect表示、grace期間内にAの盤面が復元、Bにreconnected表示されることを示す。
6. `game.gateway.ts`と`useMultiplayer.ts`でlistener、room broadcast、reconnect tokenを示す。

### Major 3: Standard User Management（2点）

**回答例**

> email/password登録・login、profile編集、default preset avatarと画像upload、public profile、friend request、
> add/remove、online statusを実装しています。認証guardに加え、所有者・role・BAN・削除状態をserver側で確認します。

**操作方法**

1. Context Aの`/login`で`REGISTER`へ切り替え、email、username、passwordを入力して登録する。
2. `/profile`でdisplay nameとbioを編集し、preset avatarを選ぶ。
3. 画像uploadではPNG/JPEG/GIF/WebPを選び、保存後にreloadして永続化を示す。
4. Context Bで別userとしてloginし、`/search`でAを検索してprofileを開く。
5. `/friends`からfriend requestを送り、A側で承認する。
6. A/Bのonline表示を確認し、片方をlogoutしてoffline/last seenの変化を示す。

### Major 4: Web-based Game（2点）

**回答例**

> Tetris-like gameとして、7-bag、移動、rotation、collision、soft/hard drop、lock delay、line clear、score、level、
> NEXT、HOLD、ghost、game over、勝敗条件を実装しています。PixiJSで盤面を描画し、online gameはserver engineが
> stateを決定します。明確なruleと終了条件があり、live matchを実際に遊べます。

**操作方法**

1. `/menu`で`MARATHON`を選び、`START GAME`を押す。
2. 左右移動、rotation、soft drop、hard dropを行う。
3. HOLD、NEXT、ghost、score、level表示を指す。
4. lineを完成させてclearとscore更新を示す。
5. blockを上端まで積み、game overとrestart/quitを示す。
6. `packages/shared`のrule型、game engine、`TetrisUI.tsx`を開き、画面操作とruleを対応させる。

### Major 5: Remote Players（2点）

**回答例**

> 独立した2つのbrowser context、または別PCから同じmatchへ接続できます。入力はserverへ送り、server-authoritativeな
> board stateとgarbage attackを両clientへ配信します。latencyでclientがsource of truthにならないようにし、disconnect、
> reconnect、forfeit、rematchを処理します。

**操作方法**

1. 2つの独立Chrome contextで`MULTI PLAY` → `RANDOM MATCH`へ入る。
2. matchmaking後、両方で相手名と相手盤面が一致することを確認する。
3. 片方で複数lineを消し、相手側へgarbageが追加されることを示す。
4. 片方のtabをbackgroundにしてもserver側のgravityとstate配信が進むことを示す。
5. 片方をreloadし、同じplayer/boardとしてreconnectすることを示す。
6. game overでwinner/loserを確認し、rematchまたは新規matchを開始する。

### 申告された Minor モジュールはすべて適切に実装され、機能しているか？

**評価シートの確認項目（原文）**

- チームに実演してもらう
- 完全に実装され、機能していることを確認する
- プロジェクトに意味のある価値を加えていることを確認する
- モジュールの依存関係が満たされていることを確認する

> **申告された Minor モジュールはすべて適切に実装され、機能しているか？**

次の4件を1件ずつ確認します。Game Statisticsは、依存するWeb-based Gameの実演後に確認します。

### Minor 1: Database ORM（1点）

**回答例**

> PrismaでPostgreSQLの20 models、relation、enum、unique/index、migration、transactionを管理し、生成clientによる
> 型付きqueryをserviceから使用します。生SQL文字列の連結をapplication queryに使いません。

**操作方法**

1. `apps/backend/prisma/schema.prisma`でUser、UserStats、GameResult、Tournamentのrelationを示す。
2. `apps/backend/prisma/migrations`を開き、schema変更がmigrationとして管理されることを示す。
3. `users.service.ts`またはgame result保存serviceで`this.prisma...`の型付きqueryを示す。
4. `make studio`または`make exec-db`を使い、評価用UserとGameResultが保存されていることを確認する。
5. `node tools/schema-doc.cjs --check`でER文書との同期を確認する。

### Minor 2: Game Statistics and Match History（1点）

**回答例**

> match完了時にwinner、opponent、日時、APM、PPS、line、play timeを保存し、wins/losses、rank points、XP、level、
> achievementsを更新します。Dashboard/Profileでhistory、leaderboard、progressionを表示します。

**操作方法**

1. 認証済みUser A/Bでremote matchを1試合完了する。
2. winner側で`/dashboard`を開き、wins、rank、APM/PPS、直近historyを確認する。
3. loser側でもlossと同じmatch/opponentが記録されていることを確認する。
4. `/profile`でXP、level、achievement progressを確認する。
5. pageをreloadし、値が消えずDBから再取得されることを示す。
6. leaderboardで更新された順位を確認する。

### Minor 3: OAuth 2.0（1点）

**回答例**

> 42 OAuthをPassport strategyで実装しています。認可後はproviderとoauthIdでidentityを検索し、初回だけuserを作成します。
> password登録済みの同一emailへ自動linkするとidentity takeoverになるため、email衝突は明示的に拒否します。
> callbackはHTTPSの`/api/auth/42/callback`です。

**操作方法**

1. `/login`で`SCHOOL 42`を選ぶ。
2. 42の認可画面で評価用accountを認証する。
3. `https://localhost:8443/api/auth/42/callback`からappへ戻ることをaddress barで確認する。
4. `/dashboard`または`/profile`に認証user情報が表示されることを示す。
5. logout後に再度42 loginし、同じuserが再利用され重複作成されないことを示す。
6. `ft-oauth.strategy.ts`と`loginOrRegisterOauth`を開き、provider ID検索とemail衝突拒否を説明する。

credential、authorization code、access/refresh token自体は画面へ表示しません。

### Minor 4: Two-Factor Authentication（1点）

**回答例**

> TOTP方式です。SettingsでsecretとQRを生成し、Authenticatorの6桁codeで有効化します。以後のloginはpassword確認後に
> 5分の一時tokenだけを返し、正しいTOTPを確認して初めてaccess/refresh tokenを発行します。解除にもcodeを要求します。

**操作方法**

1. Login後、`/profile` → `SETTINGS` → `SECURITY & 2FA`へ進む。
2. `SETUP 2FA`を押し、AuthenticatorでQRをscanする。
3. 6桁codeを入力して`CONFIRM & ENABLE`を押す。
4. logoutし、email/passwordでloginする。通常画面へ移動せず`2FA CODE`入力になることを示す。
5. 誤った6桁codeが拒否され、Authenticatorの正しいcodeでloginできることを示す。
6. Settingsの`DISABLE 2FA`から正しいcodeを入力し、解除後の通常loginを確認する。

### 独自モジュールは適切な理由があり、実装されているか？

**評価シートの確認項目（原文）**

- なぜそのモジュールを選んだのか
- どのような技術的課題に取り組むのか
- プロジェクトにどのような価値を加えるのか
- なぜ Major/Minor に値するのか

> **独自モジュールは適切な理由があり、実装されているか？**

**回答例**

> いいえ。基本14ポイントにも今回の追加候補にも独自moduleは含めません。subjectに明記されたmoduleだけを申告します。
> そのため、この項目は該当なしです。

**操作方法**

1. READMEのCore 14表と追加候補を開く。
2. 各名称がsubjectの既定moduleに対応することを確認する。
3. Modules of choiceを点数へ加えていないことを説明する。

---

## 5. コード品質（Code Quality）

### コードは適度に整理され、読みやすいか？

**評価シートの確認項目（原文）**

- ファイル/フォルダ構成が明確
- コードが理解できる
- 大きなコード品質上の問題がない
- コーディングスタイルが一貫している

> **コードは適度に整理され、読みやすいか？**

**回答例**

> npm workspace/Turborepoのmonorepoです。`apps/frontend`、`apps/backend`、`apps/ai-agent`を分離し、
> WebSocket payloadやgameの共通型は`packages/shared`に置きます。Frontendはpages/components/hooks/lib/store、
> BackendはdomainごとのNest module/controller/service/dto/guardへ分けています。Infraはcompose、Nginx、toolsに分離しています。
> TypeScript type-check、Frontend oxlint、Backend ESLint/Prettier、Jest、Node tests、CTest、browser smokeを使います。

**その場で実行**

```bash
npm run type-check
npm run lint
git diff --check
```

続いてFrontendの1画面、Backendの1domain、shared payloadを順に開き、巨大な1fileだけで構成されていないこと、
controllerからservice、Prismaへ責務が流れることを説明します。

### チームはプロジェクトへの理解を示しているか？

**評価シートの質問項目（原文）**

- なぜその技術スタックを選んだのか
- アプリケーションをどう構成したのか
- 直面した課題と実装した解決策
- 開発中に行ったトレードオフ

> **チームはプロジェクトへの理解を示しているか？**

**回答例**

> 最重要の判断は、online matchをserver-authoritativeにしたことです。cheatとclient間の不一致を抑えられますが、
> inputから表示までのlatencyとreconnect設計が必要になります。Soloは操作感を優先してFrontend engineを使います。
> Backendは評価範囲と運用規模に合わせたmodular monolithで、microservice moduleは申告しません。
> Socket.IO stateは単一process memoryに置いて実装を明確にし、Redis adapterによる水平scaleは行っていません。
> Custom Room tournamentはguestや同一accountの複数接続を許可するため、その場合のbracketはmemoryで進行し、
> 全参加者が異なる認証userのときだけDBへ永続化します。private roomはpassword式ではなく、一覧へ出さずJOIN BY IDで入室します。
> 開発HTTPSは再現性のためself-signed certificateで、公開運用時はtrusted certificateが必要です。

**操作方法**

1. `README.md`のTechnical Stackを開き、各技術を実装directoryと対応させる。
2. Browser入力 → Socket.IO → GameGateway → GameInstance → broadcast → PixiJS描画の流れを辿る。
3. Custom Room tournamentの認証user時とguest時の分岐をcodeで示す。
4. Redisを使用する箇所と使用しない箇所を検索し、trade-offを説明する。

### プロジェクトは効果的なチームでの協力を示しているか？

**評価シートの確認項目（原文）**

- 全メンバーが貢献している（Git履歴を確認）
- メンバーがお互いの作業を説明できる
- 作業が調整・統合されているように見える
- README に作業分担が明確に示されている
- 1人がすべての作業をしたのではない

> **プロジェクトは効果的なチームでの協力を示しているか？**

**回答例**

> 4名全員のcommitがあり、game/rendering、AI/multiplayer、UI/UX、Backend/Infraという担当を並行して進めました。
> 境界ではshared type、Socket.IO event、REST DTO、Prisma schemaを合意し、統合段階でbrowserとWebSocketの試験を追加しました。
> 各自が担当外も説明でき、READMEに役割と具体的な貢献を記載しています。

Git履歴、shared package、実際にFrontendとBackendをまたぐ1機能を示します。

**操作方法**

1. Q2と同じGit確認で4名の代表commitを示す。
2. READMEのTeam InformationとIndividual Contributionsを開く。
3. 例としてRemote Playersを選び、sonakamu/ssawaのgame実装、yukusanoのgateway/infra、
   kaisuzukのUIが一つの機能へ統合されていることを示す。

---

## 6. 機能と安定性（Functionality）

### アプリケーションは機能し、ある程度安定しているか？

**評価シートの確認項目（原文）**

- デモ中に致命的なバグやクラッシュがない
- 主要機能が期待どおりに動作する
- 基本的なエラー処理がある
- ユーザー体験が許容できる
- 複数ユーザーに対応している（複数のユーザーが同時にアプリを使える）

> **アプリケーションは機能し、ある程度安定しているか？**

**回答例**

> はい。主要経路は自動testと実Chromeで確認しています。入力errorは400/401/403/409/413/429など適切なstatusと
> 画面messageで処理し、matchは複数context、spectator、disconnect/reconnectまで確認しています。
> database更新に失敗したavatar fileを削除するなど、途中失敗時のcleanupも行います。

**推奨する通し実演**

1. User A/Bをloginする。
2. Profile更新とfriend承認を行う。
3. 2人でremote matchを開始する。
4. 第3contextでspectateする。
5. Aをreloadしてreconnectする。
6. 試合を完了し、historyとstatsを確認する。
7. 無効入力を1件送り、画面がcrashせずerrorになることを示す。

### プロジェクトは実際の努力と学びを反映しているか？

**評価シートの確認項目（原文）**

- Web開発の概念への理解を示している
- 最低限の要件を超えている
- チームが新しい技術や概念を学んだ
- 創造性や興味深い実装が見られる
- プロジェクトのコンセプトがうまく実現されている

> **プロジェクトは実際の努力と学びを反映しているか？**

**回答例**

> 単一画面のgameではなく、認証・認可、relational data、real-time state、rendering、security infrastructure、
> failure recoveryを一つのproductへ統合しました。とくに、server-authoritative game loop、Socket reconnect、
> typed shared protocol、Prisma transaction、OAuth/2FA、HTTPS/WAF/Vault、C++ AIとのprocess連携を実装し、
> unit・HTTP・WebSocket・browserという異なる層で検証した点に学びと技術的な深さがあります。

**操作方法**

1. 実際のremote matchを見せ、Frontend・Backend・Databaseが統合された成果を示す。
2. C++ AI、Vault/WAF、OAuth/2FAから最低2つの実装codeを開く。
3. unit、HTTP、WebSocket、browser testを各1つ示し、学んだ内容を品質保証へ反映したことを説明する。

---

## 7. 最終確認（Final Verification）

### 検証済みモジュールの合計は14ポイント以上か？

**評価シートの確認項目（原文）**

- 実演に成功し、正しく動作したモジュール**だけ**を数える
- Major モジュール = 各2ポイント
- Minor モジュール = 各1ポイント
- 機能しない、または未完成のモジュール = 0ポイント

> **検証済みモジュールの合計は14ポイント以上か？**

**回答例**

> はい。先ほど個別に成功したMajor 5件が10ポイント、Minor 4件が4ポイントで、合計14ポイントです。
> 実演に失敗したmoduleは数えません。まずこの基本14ポイントを確定し、その後に時間があれば追加moduleを実演します。

評価者と一緒に、次の表へ実演結果を記入します。

| Module | 点 | 実演結果 |
| --- | ---: | --- |
| Frontend and Backend Frameworks | 2 | □ 成功 / □ 0点 |
| WebSockets | 2 | □ 成功 / □ 0点 |
| Standard User Management | 2 | □ 成功 / □ 0点 |
| Web-based Game | 2 | □ 成功 / □ 0点 |
| Remote Players | 2 | □ 成功 / □ 0点 |
| Database ORM | 1 | □ 成功 / □ 0点 |
| Game Statistics and Match History | 1 | □ 成功 / □ 0点 |
| OAuth 2.0 | 1 | □ 成功 / □ 0点 |
| Two-Factor Authentication | 1 | □ 成功 / □ 0点 |
| **検証済み合計** | **__/14** |  |

**操作方法**

1. 各実演直後に表の`成功`または`0点`へ印を付ける。
2. Majorの成功数を2倍し、Minorの成功数を加算する。
3. 14以上であることを評価者と相互確認する。
4. 失敗したmoduleを別のmoduleの説明だけで補完せず、追加候補を実演する場合も個別に確認する。

### 成功したグループプロジェクトだと考えるか？

**評価シートの確認項目（原文）**

- 必須部分は完成し、機能しているか
- 全メンバーが意味のある貢献をしたか
- チームは自分たちの作業と判断を説明できるか
- プロジェクトは課題の要件を満たしているか
- README は完全かつ正確か

> **成功したグループプロジェクトだと考えるか？**

**回答例**

> はい。Frontend、Backend、Databaseを1コマンドで起動でき、HTTPS上で主要機能が連携します。
> 4名が異なる専門領域で実装しながら、shared protocolと統合testで一つのapplicationにまとめました。
> READMEは実装と主申告moduleを区別しており、基本14ポイントを個別に実演しました。
> 未実装や実演に失敗した候補を点数へ含めず、実際に確認できた範囲だけを申告します。

**操作方法**

1. 出席、README、Git、一般要件、技術要件、14ポイントの順に未確認項目がないか振り返る。
2. `docker compose ps`とChromeを最後に再確認する。
3. 4名それぞれが、自分の担当と他メンバーとの接続点を一言ずつ説明する。

---

## 8. Bonus（基本要件がすべて成功した場合のみ）

**評価シートの確認項目（原文）**

各追加モジュールについて、次を行う。

- 完全に機能していることを確認する
- subject PDF のモジュール要件を満たしていることを確認する
- プロジェクトに価値を加えていることを確認する
- README に適切な理由があることを確認する

> **ボーナスポイント: ____ / 5**

基本14ポイントが確定する前にBonusを始めません。上限5ポイントなので、次の順が説明しやすい構成です。

### Bonus候補A: Advanced Permissions（Major、2点）

**回答例**

> ADMIN/MODERATOR/USER/GUESTのroleを持ち、ADMINはuserの一覧・作成・編集・削除・role変更・BAN解除、
> MODERATORは許可された範囲のBAN操作を行えます。server側guardだけでなく、mutation時にDBの最新role、BAN、削除状態を再確認します。
> 自分自身への危険な操作、最後の有効ADMINのdemote/BAN/delete、権限昇格を拒否します。

**実演**: ADMINのCRUD・role変更・BAN、MODERATORの制限、一般userの403、最後のADMIN保護を示す。

**詳細な操作方法**

1. ADMINでloginし、Profileの`ADMIN PANEL`から`/admin`を開く。
2. `CREATE USER`で評価用USERを作る。
3. 作成userの`EDIT PROFILE`でdisplay nameとbioを変更する。
4. role selectをUSER → MODERATORへ変更する。
5. BANを押し、1〜3650日の整数と理由を入力してlogin拒否を確認し、その後UNBANする。
6. 別の一般USERから`/api/admin/users`を呼び403になることをNetworkで示す。
7. 最後の有効ADMINに対するdemote/BAN/deleteが409で拒否されることを示す。
8. 作成userを`PERMANENTLY DELETE`し、確認文字列を入力して一覧から消えることを示す。

### Bonus候補B: Public API（Major、2点）

**回答例**

> 64文字のAPI keyを発行し、`X-API-Key`で保護します。leaderboard、profile、stats、history、tournament、
> settingsのGET/POST/PUT/DELETEがあり、5 endpoints以上、Swagger、key単位の1時間rate limit、失効・期限・所有者のBAN/削除確認を実装しています。

**実演**: `/api/docs`、key発行、GET/POST/PUT/DELETE、keyなし401、未知field 400、quota 429、key失効を示す。

**詳細な操作方法**

1. Login後にSettingsを開き、API key labelを入力して作成する。
2. 一度だけ表示されるkeyを評価用terminalへ安全に保持し、画面共有後は破棄する。
3. `/api/docs`で`X-API-Key` schemeとendpointを示す。
4. key付きでleaderboard/profile/history/settingsをGETする。
5. settingsをPOST、PUT、DELETEし、201、200、204を確認する。
6. keyなしの401、未知fieldの400、quota超過時の429を確認する。
7. Settingsからkeyをrevokeし、同じkeyが401になることを示す。

### Bonus候補C: Tournament System（Minor、1点）

**回答例**

> Room ownerが4名以上で開始し、single-elimination bracket、組合せ、各match、勝者の次round進出、champion確定を管理します。
> 4・8・16名限定ではありません。guest、guest owner、同じ登録accountからの複数接続を許可します。
> 全員が異なる認証userならDBへbracketを保存し、それ以外はmemoryで進行します。開始後の入室者は観戦者です。

**実演**: 4 contextで開始、同時match、勝者進出、外部spectator、champion確定を示す。

**詳細な操作方法**

1. Context Aで`MULTI PLAY` → Custom Roomへ進み、roomを作成する。
2. Context B/C/DでRoom IDを入力して参加する。
3. ownerのAが4名以上を確認してTournamentを開始する。
4. bracketの組合せと同時に進むmatchを各contextで確認する。
5. 5つ目のcontextを開始後に入室させ、bracketへ追加されずspectatorになることを示す。
6. 各matchを終了させ、勝者が次roundへ進み、最後にchampionが確定することを示す。
7. champion確定後、途中入室者が次回のplayer poolへ入ることを示す。

以上がすべて成功した場合、Bonusは2 + 2 + 1 = 5点です。どれかが失敗した場合は0点として、必要なら次の候補を
subjectの全要件と照合してから個別実演します。候補にはAI Opponent、Spectator Mode、Game Customization、
Advanced Analytics、GDPR、WAF/Vaultがあります。READMEの「実装済み候補」という記載だけでは点にせず、
その場で全要件を実演できたものだけを申告します。

---

## 9. よくある追加質問

### 「Custom Roomのprivateはpassword保護ですか？」

> いいえ。privateは公開一覧へ表示しないという意味で、JOIN BY ID方式です。IDを知るuserは参加・観戦できます。

### 「Tournamentは4、8、16名だけですか？」

> いいえ。4名以上の任意人数です。byeを含むbracketを構成します。

### 「Tournamentへguestは参加できますか？」

> はい。guest、guest owner、同じ登録accountの複数接続も参加できます。永続化条件だけが異なります。

### 「Tournament進行中に新規参加するとどうなりますか？」

> 進行中bracketは変更せずspectatorになります。champion確定後、次回大会のplayer poolへ入れます。

### 「RedisでWebSocketをscaleしていますか？」

> いいえ。Redis adapterは使っていません。Redisはrefresh-token blacklist、削除確認code hash、Public API rate limitなどに使います。
> Socket.IO roomとreconnect stateは単一Backend process内です。

### 「全gameがserver-authoritativeですか？」

> Online 1v1とCustom Roomはserver-authoritativeです。Soloの人間盤面はFrontend engineです。VS AIはC++ AIの判断を
> Backendで管理しつつ、人間側の描画・操作責務もあるため、modeごとの責任範囲を区別して説明します。

### 「なぜNginx内部はHTTPなのですか？」

> TLSは外部境界のNginxで終端し、Backend/Frontendとは隔離されたDocker network内で通信する構成だからです。
> BrowserからBackendへの経路はHTTPS/WSSです。

### 「WAFがSocket.IOを全面除外していませんか？」

> WebSocket protocolとVite開発assetに必要な範囲だけをrule対象から外し、通常のREST `/api`にはOWASP CRSを適用します。
> 除外範囲と理由をNginx/ModSecurity設定とWAF testで示します。

### 「AIが完璧にplayするだけでは人間らしくないのでは？」

> Easy/Hard/Expertで探索量、評価、速度を変えます。C++ agentはheight、holes、bumpinessなどを評価し、時間上限内に操作列を返します。
> `mistakeRate`というshared設定名だけを根拠に、C++が一定確率で故意にミスすると説明はしません。実際のcodeと対戦結果で説明します。

### 「既知の制約はありますか？」

> 開発証明書はself-signedです。Socket.IO stateは単一Backend processなので水平scaleにはRedis adapter等が別途必要です。
> MobileではMULTI PLAYを意図的に表示せず、remote対戦はdesktopで実演します。guestを含むTournament bracketはmemory管理なので、
> Backend processの再起動をまたぐ永続化対象ではありません。これらを隠さず、現在のscopeとtrade-offとして説明します。

---

## 10. 回答時の原則

- 最初に結論を答え、その後に理由と実装根拠を示す。
- 「あります」だけで終えず、その場で操作する。
- READMEの候補数ではなく、成功した基本14ポイントを先に確定する。
- 自動testは補助証拠であり、live demonstrationの代わりにはしない。
- 実装していないRedis WebSocket scaling、password式private room、全mode server-authoritativeなどを誤って主張しない。
- 一時的なfailureが出たら隠さず、status code、server log、再現条件を評価者と確認する。
- token、password、OAuth secret、SMTP credential、Vault keyを画面へ出さない。
- 質問に不明点があれば推測せず、該当code・schema・testを開いて確認してから答える。
