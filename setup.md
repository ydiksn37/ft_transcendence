# 開発環境セットアップガイド (ft_transcendence)

チームメンバー全員が同じ環境でスムーズに開発を進めるためのセットアップ手順です。

## 1. 前提条件
手元のPCに以下のソフトウェアがインストールされていることを確認してください。
*   **Node.js**: `v20.0.0` 以上
*   **npm**: `v10.0.0` 以上
*   **Docker** & **Docker Compose**

## 2. 環境変数の設定
プロジェクトのルートディレクトリで、テンプレートから環境変数ファイル（`.env`）を作成します。
```bash
cp .env.example .env
```
*(必要に応じて `.env` の中身をローカル環境に合わせて変更してください。`.env` は Git にコミットしないよう注意してください)*

## 3. 依存パッケージのインストール
このプロジェクトは npm workspaces と Turborepo を使用したモノレポ構成です。ルートディレクトリで以下のコマンドを実行し、全パッケージの依存関係を一括インストールします。
```bash
make install
```
*(※ `package.json` の `overrides` 設定により、React 18環境が強制されるようになっています)*

## 4. インフラ環境の起動 (DB / Redis / Vault)
ローカルでの開発時は、ミドルウェア（データベース等）のみを Docker で起動し、アプリケーションコード（フロント・バック）は手元の Node.js で実行してホットリロードを効かせる構成を推奨します。

```bash
make up-infra
```

## 5. データベースのセットアップ (Prisma)
Docker で立ち上げた PostgreSQL に対してマイグレーションを適用し、同時に Prisma Client の型定義を生成します。
```bash
make generate
```
```bash
make migrate
```

## 6. 開発サーバーの起動
以下のコマンドを実行すると、Turborepo がフロントエンドとバックエンドの開発サーバーを並列で起動します。
```bash
make dev
```

起動後、ブラウザで以下のURLにアクセスして動作を確認してください。
*   **フロントエンド (Tetris画面など)**: [http://localhost:5173/](http://localhost:5173/)
*   **バックエンドAPI (Swagger UI)**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## 7. 認証フロー（Phase 2）のテスト方法
現在、ID/パスワードによるログイン、42 OAuth認証、および2段階認証（OTP）のフローが実装されています。

### 42 API 連携のテスト
42のIntraでアプリを登録し、取得した認証情報を `.env` に設定してください。
1. `FT_CLIENT_ID` と `FT_CLIENT_SECRET` を自身のものに書き換える
2. 42 Intra側の **Redirect URI** を `http://localhost:5173/api/auth/42/callback` に設定する
3. ブラウザで `http://localhost:5173/` にアクセスし、「Login / Register」から「Login with 42」を実行する

### 2段階認証 (2FA) のテスト
2段階認証はオプトイン方式のため、デフォルトではオフになっています。UI上にはまだ設定画面がありませんが、以下の手順でAPI経由で有効化してフローをテストできます。
1. 一度任意の方法（ID/PASS または 42）でログインする
2. バックエンドのSwagger UI（`http://localhost:3000/api/docs`）を開き、右上の「Authorize」ボタンから現在ログイン中のJWT（Access Token）をセットする
3. `POST /api/auth/2fa/setup` を実行し、EmailベースでOTPを発行する
4. **バックエンドのターミナル（`make dev` を実行している画面）** にテスト用のOTPコードが出力されるので確認する
5. `POST /api/auth/2fa/confirm` を実行し、取得したOTPを送信して有効化を完了する
6. アプリケーション（`http://localhost:5173/`）をリロードしてログアウトし、再ログインすると自動的に2段階認証画面 (`/auth/2fa`) へ遷移します。再度ターミナルに出力された新しいOTPを入力してログインを完了させてください。

---

### 💡 トラブルシューティング
*   **`Cannot read properties of undefined` などの実行時エラーが出る場合**
    依存パッケージのバージョン不整合の可能性があります。以下のコマンドでクリーンインストールをお試しください。
    ```bash
    rm -rf node_modules package-lock.json apps/*/node_modules
    npm install
    ```
*   **ポートが競合して起動しない場合 (`bind: address already in use`)**
    42のiMacなどの共有PC環境では、他の学生のプロセスがデフォルトポート（5432や6379）を占有していることがよくあります。
    `.env` 内の `POSTGRES_PORT` や `REDIS_PORT` を、他の人が使っていなさそうな別の番号（例: `54321`, `63791` など）に変更してから、再度 `make up-infra` を実行してください。（※ `docker-compose.yml` 側は `.env` の値を読み取るようになっているため、`.env` を変更するだけで大丈夫です）
