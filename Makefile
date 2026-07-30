.DEFAULT_GOAL := help

help: ## コマンド一覧を表示する
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# --- Docker Compose 基本操作 ---
up: ## Dockerコンテナを起動する (バックグラウンド)
	docker compose up -d

up-infra: ## 開発用にDB等のインフラコンテナのみを起動する
	docker compose up -d postgres redis vault

down: ## Dockerコンテナを停止・削除する
	docker compose down

build: ## Dockerイメージをビルドしてコンテナを起動する
	docker compose up -d --build

logs: ## 全コンテナのログをリアルタイムで表示する (Ctrl+Cで終了)
	docker compose logs -f

logs-backend: ## バックエンドのログを表示する
	docker compose logs -f backend

logs-frontend: ## フロントエンドのログを表示する
	docker compose logs -f frontend

restart: ## コンテナを再起動する
	docker compose restart

re: down build ## コンテナを停止し、再ビルドして起動する

# --- データベース & 環境リセット ---
clean: down ## コンテナとネットワークを削除する (ボリュームは残す)

fclean: ## コンテナ、ネットワーク、イメージ、ボリューム(DB含む)を完全に削除する
	docker compose down -v --rmi all --remove-orphans

reset-db: ## DBボリュームを削除し、コンテナを再起動する
	docker compose down -v
	docker compose up -d postgres redis vault
	@echo "Waiting for database to start..."
	@sleep 3
	npm run db:migrate -- -- --name init

# --- 開発用コマンド ---
dev: ## 開発サーバーを起動する (フロント・バック両方)
	npm run dev

generate: ## Prisma Client を生成する (ホスト側)
	npm run db:generate

migrate: ## Prisma のマイグレーションを実行する (ホスト側)
	npm run db:migrate

studio: ## Prisma Studioを起動してDBを閲覧・編集する (ホスト側)
	npm run db:studio

install: ## 依存パッケージをすべてインストールする
	npm install
	npm run build --workspace=@transcendence/shared
	@ln -sf ../../.env apps/backend/.env
	@ln -sf ../../.env apps/frontend/.env

# --- コンテナ内シェル ---
exec-backend: ## backendコンテナの中に入る (シェル)
	docker compose exec backend sh

exec-frontend: ## frontendコンテナの中に入る (シェル)
	docker compose exec frontend sh

exec-db: ## postgresコンテナの中に入り、直接SQLを叩ける状態にする
	docker compose exec postgres psql -U transcendence -d transcendence_db

exec-vault: ## vaultコンテナの中に入る
	docker compose exec vault sh

# --- コンテナ状態確認 ---
ps: ## このプロジェクトに関わるコンテナの状態を表示する
	docker compose ps -a

lint: ## リンターを実行する
	npm run lint

type-check: ## 型チェックを実行する
	npm run type-check

.PHONY: all help up up-infra down build logs logs-backend logs-frontend restart re clean fclean reset-db dev generate migrate studio install exec-backend exec-frontend exec-db exec-vault ps lint type-check
