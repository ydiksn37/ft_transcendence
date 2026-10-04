.DEFAULT_GOAL := help

help: ## コマンド一覧を表示する
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# --- Docker Compose 基本操作 ---
up: _shared-build _ai-web-build vault-init ## 全てのコンテナを起動し、DBマイグレーションも自動実行する
	docker compose up -d

down: ## Dockerコンテナを停止・削除する
	docker compose down

build: install _ai-web-build vault-init ## 依存関係とDockerイメージをビルドしてコンテナを起動する
	docker compose up -d --build

logs: ## 全コンテナのログをリアルタイムで表示する (Ctrl+Cで終了)
	docker compose logs -f

logs-backend: ## バックエンドのログを表示する
	docker compose logs -f backend

re: down build ## コンテナを停止し、再ビルドして起動する

fclean: ## コンテナ、ネットワーク、イメージ、ボリューム(DB含む)を完全に削除する
	docker compose down -v --rmi all --remove-orphans

studio: ## Prisma Studioを起動してDBを閲覧・編集する (ホスト側)
	@test -s secrets/dev/postgres_password.txt || { echo "Run 'make vault-init' first"; exit 1; }
	@set -a; [ ! -f .env ] || . ./.env; set +a; \
		DATABASE_URL="postgresql://$${POSTGRES_USER:-transcendence}:$$(cat secrets/dev/postgres_password.txt)@127.0.0.1:$${POSTGRES_PORT:-54320}/$${POSTGRES_DB:-transcendence_db}?schema=public" \
		npm exec --workspace apps/backend -- prisma studio --schema prisma/schema.prisma

install: ## 依存パッケージをすべてインストールする
	npm install
	npm run db:generate
	npm run build --workspace=@transcendence/shared

# --- 起動に必要な内部ビルド ---
AI_WEB_BUILD_DIR := build/ai-agent-web
AI_COMPILER_IMAGE := ft_transcendence-ai-compiler:latest

_shared-build:
	npm run build --workspace=@transcendence/shared

_ai-web-toolchain:
	@mkdir -p $(AI_WEB_BUILD_DIR)
	@if ! docker image inspect $(AI_COMPILER_IMAGE) >/dev/null 2>&1; then \
		docker compose --profile tools build ai-compiler >$(AI_WEB_BUILD_DIR)/toolchain.log 2>&1 || { status=$$?; cat $(AI_WEB_BUILD_DIR)/toolchain.log; exit $$status; }; \
	fi

_ai-web-build: _ai-web-toolchain
	@mkdir -p $(AI_WEB_BUILD_DIR)
	@docker compose --profile tools run --rm --no-deps ai-compiler >$(AI_WEB_BUILD_DIR)/docker.log 2>&1 || { status=$$?; cat $(AI_WEB_BUILD_DIR)/docker.log; exit $$status; }
	@echo "Required game agent build complete: $(AI_WEB_BUILD_DIR)"

# --- インフラ & セキュリティ ---
vault-init: ## 開発用の秘密ファイルを生成し、Vaultを初期化・同期する
	./tools/vault-init.sh

# --- コンテナ内シェル ---
exec-backend: ## backendコンテナの中に入る (シェル)
	docker compose exec backend sh

exec-db: ## postgresコンテナの中に入り、直接SQLを叩ける状態にする
	docker compose exec postgres psql -U transcendence -d transcendence_db

# --- コンテナ状態確認 ---
ps: ## このプロジェクトに関わるコンテナの状態を表示する
	docker compose ps -a

.PHONY: help up down build logs logs-backend re fclean studio _shared-build _ai-web-toolchain _ai-web-build vault-init exec-backend exec-db ps
