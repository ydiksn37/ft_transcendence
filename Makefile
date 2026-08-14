.DEFAULT_GOAL := help

help: ## コマンド一覧を表示する
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# --- Docker Compose 基本操作 ---
up: ## 全てのコンテナを起動し、DBマイグレーションも自動実行する
	docker compose up -d

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

reset-db: ## DBボリュームを削除して初期化する (削除後、再度 make up が必要です)
	docker compose down -v

generate: ## Prisma Client を生成する (ホスト側)
	npm run db:generate

migrate: ## Prisma のマイグレーションを実行する (ホスト側)
	npm run db:migrate

migrate-dev: ## Prismaのマイグレーションを作成・適用する (例: make migrate-dev name=update_game_settings)
	@if [ -z "$(name)" ]; then \
		echo "Usage: make migrate-dev name=<migration_name>"; \
		exit 1; \
	fi
	npx prisma migrate dev --name $(name) --schema apps/backend/prisma/schema.prisma

seed: ## データベースに初期データ(Seed)を投入する (ホスト側)
	npm run db:seed

studio: ## Prisma Studioを起動してDBを閲覧・編集する (ホスト側)
	npx prisma studio --schema apps/backend/prisma/schema.prisma

install: ## 依存パッケージをすべてインストールする
	npm install
	npm run build --workspace=@transcendence/shared

# --- C++ AI ---
AI_BUILD_DIR := build/ai-agent
model ?= easy
games ?= 1
seed ?= 42
max_pieces ?= 5000
jobs ?= 1
preview ?= 1
delay_ms ?= 100

ai-build: ## C++ AIをReleaseモードで設定・ビルドする
	cmake -S apps/ai-agent -B $(AI_BUILD_DIR) -DCMAKE_BUILD_TYPE=Release
	cmake --build $(AI_BUILD_DIR) --parallel

ai-run: ai-build ## C++ AIを実行する (例: make ai-run model=easy)
	./$(AI_BUILD_DIR)/ai_benchmark \
		--model "$(model)" \
		--games "$(games)" \
		--seed "$(seed)" \
		--max-pieces "$(max_pieces)" \
		--jobs "$(jobs)" \
		$(if $(filter 1 true yes,$(preview)),--preview) \
		--delay-ms "$(delay_ms)"

# --- テスト ---
test: ## 全ての単体テストを実行する
	npm run test

test-e2e: ## E2E(結合)テストを実行する
	npm run test:e2e

test-cov: ## テストカバレッジを測定する
	npm run test:cov

# --- インフラ & セキュリティテスト ---
vault-init: ## Vault開発環境に初期テストシークレットを投入する
	docker compose exec -e VAULT_TOKEN=dev-root-token vault vault kv put secret/transcendence JWT_SECRET="vault_test_secret_12345"

waf-test: ## WAF (ModSecurity) がXSS攻撃を遮断(403)するかテストする
	curl -i -k -X POST https://localhost:8443/api/auth/login -H "Content-Type: application/json" -d '{"username": "<script>alert(1)</script>"}'

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

.PHONY: all help up down build logs logs-backend logs-frontend restart re clean fclean reset-db generate migrate migrate-dev seed studio install ai-build ai-run test test-e2e test-cov vault-init waf-test exec-backend exec-frontend exec-db exec-vault ps lint type-check
