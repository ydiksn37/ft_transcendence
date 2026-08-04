# ─── 開発ステージ ─────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

# モノレポ全体の依存関係を解決するために必要なファイルをコピー
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# Prisma クライアントを生成
COPY apps/backend/prisma ./apps/backend/prisma/
RUN cd apps/backend && npx prisma generate

# ソースコード全体をコピー
COPY . .

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

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/main"]
