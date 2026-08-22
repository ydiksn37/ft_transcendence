# ─── 開発ステージ ─────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

# モノレポ全体の依存関係を解決するために必要なファイルをコピー
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# Web AI preview: build the C++ search process inside the same image so the
# backend can communicate with it over JSON Lines stdin/stdout.
RUN apk add --no-cache build-base cmake git

# Prisma クライアントを生成
COPY apps/backend/prisma ./apps/backend/prisma/
RUN cd apps/backend && npx prisma generate

# ソースコード全体をコピー
COPY . .

RUN cmake -S apps/ai-agent -B build/ai-agent -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build/ai-agent --parallel --target ai_agent

# 共有パッケージをビルド
RUN npm run build --workspace=@transcendence/shared

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

WORKDIR /app

ENV NODE_ENV=production
ENV AI_AGENT_PATH=/app/build/ai-agent/ai_agent

RUN apk add --no-cache libstdc++

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/build/ai-agent/ai_agent ./build/ai-agent/ai_agent

EXPOSE 3000

CMD ["node", "dist/main"]
