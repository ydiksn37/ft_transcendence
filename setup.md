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
`make install` は依存関係のインストール後、
`apps/backend/prisma/schema.prisma` からPrisma Clientも自動生成します。
*(※ `package.json` の `overrides` 設定により、React 18環境が強制されるようになっています)*

### Prisma schemaを変更した場合

schemaを編集したとき、またはschema変更を含むブランチへ切り替えたときは、
型チェックやバックエンド起動の前に次を実行してください。

```bash
make generate
```

バックエンドのbuild・type-check・Docker起動時にも、同じ
`apps/backend` の `db:generate` npm scriptが自動実行されます。

## 4. 開発環境の起動
以下のコマンド一つで、インフラ環境（DB等）とアプリケーション（フロントエンド・バックエンド）の全コンテナが起動し、データベースのマイグレーションも自動で行われます。

```bash
make up
```

起動後、ブラウザで以下のURLにアクセスして動作を確認してください。
*   **フロントエンド (Tetris画面など)**: [https://localhost:8443/](https://localhost:8443/)
*   **バックエンドAPI (Swagger UI)**: [https://localhost:8443/api/docs](https://localhost:8443/api/docs)

8080は8443へのHTTP redirect専用です。開発用の3000、5173、54320、63790は
`127.0.0.1`だけにbindされ、他端末からは直接接続できません。

## 5. 初期データの投入（オプション）
初めて環境を立ち上げた後など、テスト用のダミーユーザー等が必要な場合は以下のコマンドを実行してください。
```bash
make seed
```
これによりデータベースに10人分のテストユーザーが自動作成され、すぐにログイン等のテストが可能になります。

## 7. 認証フロー（Phase 2）のテスト方法
現在、ID/パスワードによるログイン、42 OAuth認証、および2段階認証（OTP）のフローが実装されています。

### 42 API 連携のテスト
42のIntraでアプリを登録し、取得した認証情報を `.env` に設定してください。
1. `FT_CLIENT_ID` と `FT_CLIENT_SECRET` を自身のものに書き換える
2. 42 Intra側の **Redirect URI** を `https://localhost:8443/api/auth/42/callback` に設定する
3. ブラウザで `https://localhost:8443/` にアクセスし、「Login / Register」から「Login with 42」を実行する

### 2段階認証 (2FA) のテスト
2段階認証はオプトイン方式のため、デフォルトではオフになっています。以下の手順でAuthenticatorアプリを使って確認できます。
1. 一度任意の方法（ID/PASS または 42）でログインする
2. Settingsの「SECURITY & 2FA」で「SETUP 2FA」を選ぶ
3. 表示されたQRコードをAuthenticatorアプリで読み取り、6桁コードを入力して有効化する
4. ログアウト後に再ログインし、Login画面でAuthenticatorの6桁コードを入力する
5. 解除時はSettingsで「DISABLE 2FA」を選び、現在の6桁コードを入力する

---

### 💡 トラブルシューティング
*   **`Cannot read properties of undefined` などの実行時エラーが出る場合**
    依存パッケージのバージョン不整合の可能性があります。以下のコマンドでクリーンインストールをお試しください。
    ```bash
    rm -rf node_modules package-lock.json apps/*/node_modules
    npm install
    ```
*   **ポートが競合して起動しない場合 (`bind: address already in use`)**
    42のiMacなどの共有PC環境では、他の学生のプロセスがポートを占有していることがあります。
    `.env` の `NGINX_HTTP_PORT` / `NGINX_PORT`（必要なら直接接続用の各port）を変更し、`make up`を再実行してください。
