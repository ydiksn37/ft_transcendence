.DEFAULT_GOAL := help

help: ## コマンド一覧を表示する
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# --- Docker Compose 基本操作 ---
up: shared-build ai-web-build ## 全てのコンテナを起動し、DBマイグレーションも自動実行する
	docker compose up -d

down: ## Dockerコンテナを停止・削除する
	docker compose down

build: ai-web-build ## Dockerイメージをビルドしてコンテナを起動する
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
AI_WEB_BUILD_DIR := build/ai-agent-web
AI_COMPILER_IMAGE := ft_transcendence-ai-compiler:latest
model ?= easy
games ?= 1
seed ?= $(shell od -An -N4 -tu4 /dev/urandom | tr -d ' ')
max_pieces ?= 5000
jobs ?= 1
preview ?= 1
delay_ms ?= 100
think_ms ?= 50
tune_iterations ?= 4
tune_population ?= 8
tune_elite ?= 2
tune_games ?= 2
tune_seed ?= 42
tune_validation_games ?= 4
tune_validation_seed ?= 1000000
tune_optimizer_seed ?= 1
tune_max_pieces ?= 80
tune_max_nodes ?= 6000
tune_jobs ?= 1
compare_games ?= 100
compare_seed ?= 3000000
compare_max_pieces ?= 500
compare_jobs ?= 1
versus_model_a ?= hard
versus_model_b ?= easy
versus_games ?= 10
versus_seed ?= $(seed)
versus_max_pieces ?= 500
versus_format ?= table
versus_timeout_ms ?= $(shell expr $(think_ms) \* 4 + 500)

shared-build: ## 開発コンテナへmountする共有Socket型をビルドする
	npm run build --workspace=@transcendence/shared

ai-build: ## C++ AIをReleaseモードで設定・ビルドする
	cmake -S apps/ai-agent -B $(AI_BUILD_DIR) -DCMAKE_BUILD_TYPE=Release
	cmake --build $(AI_BUILD_DIR) --parallel

ai-web-toolchain: ## Web用C++コンパイライメージを初回だけ作成する
	@docker image inspect $(AI_COMPILER_IMAGE) >/dev/null 2>&1 || \
		docker compose --profile tools build ai-compiler

ai-web-build: ai-web-toolchain ## Web用C++ AIだけを再コンパイルする（イメージ再ビルドなし）
	@mkdir -p $(AI_WEB_BUILD_DIR)
	docker compose --profile tools run --rm --no-deps ai-compiler

ai-web-restart: ai-web-build ## Web用C++ AIを再コンパイルし、VS AI用常駐プロセスも更新する
	docker compose restart backend

ai-run: ai-build ## C++ AIを実行する (例: make ai-run model=easy)
	./$(AI_BUILD_DIR)/ai_benchmark \
		--model "$(model)" \
		--games "$(games)" \
		--seed "$(seed)" \
		--max-pieces "$(max_pieces)" \
		--jobs "$(jobs)" $(if $(filter 1 true yes,$(preview)),--preview) \
		--delay-ms "$(delay_ms)" \
		--think-ms "$(think_ms)"

ai-tune: ai-build ## CEMでExpert評価関数を最適化する
	./$(AI_BUILD_DIR)/ai_tune \
		--iterations "$(tune_iterations)" \
		--population "$(tune_population)" \
		--elite "$(tune_elite)" \
		--games "$(tune_games)" \
		--seed "$(tune_seed)" \
		--validation-games "$(tune_validation_games)" \
		--validation-seed "$(tune_validation_seed)" \
		--optimizer-seed "$(tune_optimizer_seed)" \
		--max-pieces "$(tune_max_pieces)" \
		--max-nodes "$(tune_max_nodes)" \
		--jobs "$(tune_jobs)"

ai-compare: ai-build ## HardとExpertを同一seedで比較し95%信頼区間を表示する
	./$(AI_BUILD_DIR)/ai_compare \
		--games "$(compare_games)" \
		--seed "$(compare_seed)" \
		--max-pieces "$(compare_max_pieces)" \
		--jobs "$(compare_jobs)" \
		--think-ms "$(think_ms)"

ai-versus: ai-build ## TSルールでC++ AI同士を対戦 (例: make ai-versus versus_model_a=hard versus_model_b=easy)
	npm run build --workspace=@transcendence/shared
	npm run headless --workspace=@transcendence/backend -- \
		--agent "$(CURDIR)/$(AI_BUILD_DIR)/ai_agent" \
		--model-a "$(versus_model_a)" \
		--model-b "$(versus_model_b)" \
		--games "$(versus_games)" \
		--seed "$(versus_seed)" \
		--max-pieces "$(versus_max_pieces)" \
		--think-ms "$(think_ms)" \
		--timeout-ms "$(versus_timeout_ms)" \
		--format "$(versus_format)"

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

.PHONY: all help up down build logs logs-backend logs-frontend restart re clean fclean reset-db generate migrate migrate-dev seed studio install shared-build ai-build ai-web-toolchain ai-web-build ai-web-restart ai-run ai-versus test test-e2e test-cov vault-init waf-test exec-backend exec-frontend exec-db exec-vault ps lint type-check
