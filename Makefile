.DEFAULT_GOAL := help
.NOTPARALLEL:

COMPOSE := docker compose
DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.dev.yml
BUILD := BUILDX_NO_DEFAULT_ATTESTATIONS=1 $(COMPOSE) build
DEV_BUILD := BUILDX_NO_DEFAULT_ATTESTATIONS=1 $(DEV_COMPOSE) build
WAIT_TIMEOUT ?= 180

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

help: ## コマンド一覧を表示する
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

preflight: ## Dockerと.envの必須設定を検証する
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required" >&2; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
	@test -f .env || { echo "Missing .env. Run: cp .env.example .env" >&2; exit 1; }
	@missing=""; \
	for key in POSTGRES_USER POSTGRES_DB FT_CALLBACK_URL ALLOWED_ORIGINS; do \
		value=$$(sed -n "s/^$${key}=//p" .env | tail -n 1); \
		[ -n "$$value" ] || missing="$$missing $$key"; \
	done; \
	if [ -n "$$missing" ]; then echo "Missing required values in .env:$$missing" >&2; exit 1; fi
	@$(COMPOSE) config --quiet

build: preflight ## ビルド・初期化・起動する
	@$(MAKE) --no-print-directory vault-init
	$(BUILD)
	$(COMPOSE) up -d --wait --wait-timeout $(WAIT_TIMEOUT)
	@set -a; . ./.env; set +a; echo "Application is ready: https://localhost:$${NGINX_PORT:-8443}"

up: preflight _secrets-ready ## ビルド済み環境を高速起動する
	$(COMPOSE) up -d --wait --wait-timeout $(WAIT_TIMEOUT)

down: ## 停止・削除する（volumeは保持）
	$(COMPOSE) down --remove-orphans

re: ## 停止して再ビルドする
	@$(MAKE) --no-print-directory down
	@$(MAKE) --no-print-directory build

dev: preflight ## hot reload対応の開発環境をビルド・起動する
	@$(MAKE) --no-print-directory vault-init
	$(DEV_BUILD)
	$(DEV_COMPOSE) up -d --wait --wait-timeout $(WAIT_TIMEOUT)

dev-up: preflight _secrets-ready ## ビルド済み開発環境を高速起動する
	$(DEV_COMPOSE) up -d --wait --wait-timeout $(WAIT_TIMEOUT)

dev-down: ## 開発環境を停止・削除する（volumeは保持）
	$(DEV_COMPOSE) down --remove-orphans

clean: down ## コンテナとnetworkを削除する（volume・image・secretは保持）

fclean: ## コンテナ・image・volumeを削除する（.env・secretは保持）
	$(COMPOSE) --profile tools down -v --rmi local --remove-orphans
	@for image in \
		ft_transcendence-backend:production \
		ft_transcendence-backend:development \
		ft_transcendence-frontend:production \
		ft_transcendence-frontend:development \
		ft_transcendence-vault-bootstrap:latest \
		$(AI_COMPILER_IMAGE); do \
		if docker image inspect "$$image" >/dev/null 2>&1; then \
			docker image rm "$$image"; \
		fi; \
	done

logs: ## 全serviceのログをリアルタイム表示する
	$(COMPOSE) logs -f

logs-backend: ## backendのログをリアルタイム表示する
	$(COMPOSE) logs -f backend

logs-frontend: ## frontendのログをリアルタイム表示する
	$(COMPOSE) logs -f frontend

ps: ## コンテナ状態を表示する
	$(COMPOSE) ps -a

vault-init: preflight ## secretを生成しVaultへ同期する
	./tools/vault-init.sh

_secrets-ready:
	@test -s secrets/dev/postgres_password.txt \
		-a -s secrets/dev/redis_password.txt \
		-a -s secrets/dev/vault_unseal_key.txt \
		-a -s secrets/dev/vault_token.txt || \
		{ echo "Secrets are not initialized. Run: make build" >&2; exit 1; }

reset-db: ## PostgreSQL volumeだけを削除して環境を再構築する
	-$(COMPOSE) stop backend postgres
	-$(COMPOSE) rm -f backend postgres
	@volume=$$(docker volume ls -q \
		--filter label=com.docker.compose.project=ft_transcendence \
		--filter label=com.docker.compose.volume=postgres_data); \
	[ -z "$$volume" ] || docker volume rm $$volume
	@$(MAKE) --no-print-directory build

migrate-dev: ## Prisma migrationを作成する
	@test -n "$(name)" || { echo "Usage: make migrate-dev name=<migration_name>" >&2; exit 1; }
	$(DEV_COMPOSE) exec backend npx prisma migrate dev --name "$(name)" --schema prisma/schema.prisma

studio: _secrets-ready ## Prisma Studioをホストで起動する
	@set -a; . ./.env; set +a; \
	DATABASE_URL="postgresql://$${POSTGRES_USER}:$$(cat secrets/dev/postgres_password.txt)@127.0.0.1:$${POSTGRES_PORT:-54320}/$${POSTGRES_DB}?schema=public" \
	npm exec --workspace apps/backend -- prisma studio --schema prisma/schema.prisma

ai-web-toolchain: ## Web用C++ compiler imageを構築する
	@mkdir -p $(AI_WEB_BUILD_DIR)
	@BUILDX_NO_DEFAULT_ATTESTATIONS=1 $(COMPOSE) --profile tools build ai-compiler >$(AI_WEB_BUILD_DIR)/toolchain.log 2>&1 || \
		{ code=$$?; cat $(AI_WEB_BUILD_DIR)/toolchain.log; exit $$code; }

ai-web-build: ai-web-toolchain ## Web用C++ AIをincremental buildする
	@mkdir -p $(AI_WEB_BUILD_DIR)
	@$(COMPOSE) --profile tools run --rm --no-deps ai-compiler >$(AI_WEB_BUILD_DIR)/docker.log 2>&1 || \
		{ code=$$?; cat $(AI_WEB_BUILD_DIR)/docker.log; exit $$code; }
	@echo "C++ web AI build complete: $(AI_WEB_BUILD_DIR)"

ai-web-restart: ai-web-build ## Web用AIを再buildして再起動する
	$(DEV_COMPOSE) restart backend

ai-build: ## C++ AIのCLI・benchmarkをbuildする
	@mkdir -p $(AI_BUILD_DIR)
	@cmake -S apps/ai-agent -B $(AI_BUILD_DIR) -DCMAKE_BUILD_TYPE=Release >$(AI_BUILD_DIR)/configure.log 2>&1 || \
		{ code=$$?; cat $(AI_BUILD_DIR)/configure.log; exit $$code; }
	@cmake --build $(AI_BUILD_DIR) --parallel >$(AI_BUILD_DIR)/build.log 2>&1 || \
		{ code=$$?; cat $(AI_BUILD_DIR)/build.log; exit $$code; }

ai-run: ai-build ## C++ AI benchmarkを実行する
	./$(AI_BUILD_DIR)/ai_benchmark --model "$(model)" --games "$(games)" \
		--seed "$(seed)" --max-pieces "$(max_pieces)" --jobs "$(jobs)" \
		$(if $(filter 1 true yes,$(preview)),--preview) --delay-ms "$(delay_ms)" --think-ms "$(think_ms)"

ai-versus: ai-build ## TypeScriptルールでC++ AI同士を対戦させる
	npm run build --workspace=@transcendence/shared
	npm run headless --workspace=@transcendence/backend -- \
		--agent "$(CURDIR)/$(AI_BUILD_DIR)/ai_agent" --model-a "$(versus_model_a)" \
		--model-b "$(versus_model_b)" --games "$(versus_games)" --seed "$(versus_seed)" \
		--max-pieces "$(versus_max_pieces)" --think-ms "$(think_ms)" \
		--timeout-ms "$(versus_timeout_ms)" --format "$(versus_format)"

ai-tune: ai-build ## CEMでExpert評価関数を最適化する
	./$(AI_BUILD_DIR)/ai_tune --iterations "$(tune_iterations)" \
		--population "$(tune_population)" --elite "$(tune_elite)" \
		--games "$(tune_games)" --seed "$(tune_seed)" \
		--validation-games "$(tune_validation_games)" --validation-seed "$(tune_validation_seed)" \
		--optimizer-seed "$(tune_optimizer_seed)" --max-pieces "$(tune_max_pieces)" \
		--max-nodes "$(tune_max_nodes)" --jobs "$(tune_jobs)"

ai-compare: ai-build ## HardとExpertを同一seedで比較する
	./$(AI_BUILD_DIR)/ai_compare --games "$(compare_games)" --seed "$(compare_seed)" \
		--max-pieces "$(compare_max_pieces)" --jobs "$(compare_jobs)" --think-ms "$(think_ms)"

test: ## unit testを実行する
	npm test

test-e2e: ## E2E testを実行する
	npm run test:e2e

lint: ## lintを実行する
	npm run lint

type-check: ## TypeScript型検査を実行する
	npm run type-check

check: preflight ## Compose設定、lint、型、production image buildを検証する
	$(DEV_COMPOSE) config --quiet
	npm run lint
	npm run type-check
	$(BUILD)

exec-backend: ## backendコンテナへ入る
	$(COMPOSE) exec backend sh

exec-db: ## PostgreSQLへ接続する
	@set -a; . ./.env; set +a; $(COMPOSE) exec postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"

exec-vault: ## Vaultコンテナへ入る
	$(COMPOSE) exec vault sh

.PHONY: help preflight build up down re dev dev-up dev-down clean fclean logs \
	logs-backend logs-frontend ps vault-init _secrets-ready reset-db migrate-dev studio \
	ai-web-toolchain ai-web-build ai-web-restart ai-build ai-run ai-versus ai-tune ai-compare test test-e2e \
	lint type-check check exec-backend exec-db exec-vault
