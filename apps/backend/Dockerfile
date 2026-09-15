# ─── AI Agent ツールチェーン ────────────────────────────
FROM node:22-alpine AS ai-toolchain
RUN apk add --no-cache cmake make g++

# ─── AI Agent ビルドステージ ────────────────────────────
FROM ai-toolchain AS ai-builder
WORKDIR /app
COPY apps/ai-agent ./apps/ai-agent
RUN cmake -S apps/ai-agent -B build -DCMAKE_BUILD_TYPE=Release \
      >/tmp/ai-configure.log 2>&1 \
    && cmake --build build --parallel --target ai_agent \
      >/tmp/ai-build.log 2>&1 \
    || { status=$?; cat /tmp/ai-configure.log /tmp/ai-build.log; exit $status; }

# ─── 開発ステージ ─────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

# モノレポ全体の依存関係を解決するために必要なファイルをコピー
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,target=/root/.npm npm ci

RUN apk add --no-cache libstdc++

# Prisma クライアントを生成
COPY apps/backend/prisma ./apps/backend/prisma/
RUN npm run db:generate --workspace=@transcendence/backend

# ソースコード全体をコピー
COPY . .

# AI Agentバイナリはローカルからマウントするため開発環境ではコピーしない

# 共有パッケージをビルド
RUN --mount=type=cache,target=/app/node_modules/.cache npm run build --workspace=@transcendence/shared

WORKDIR /app/apps/backend
EXPOSE 3000

CMD ["npm", "run", "dev"]

# ─── ビルドステージ ────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=development /app /app
RUN npx turbo run build --filter=@transcendence/backend

# ─── 本番ステージ ─────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache libstdc++

WORKDIR /app

ENV NODE_ENV=production
ENV AI_AGENT_PATH=/usr/local/bin/ai_agent

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=ai-builder /app/build/ai_agent /usr/local/bin/ai_agent

EXPOSE 3000

CMD ["node", "dist/main"]
