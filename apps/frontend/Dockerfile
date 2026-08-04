# ─── 開発ステージ ─────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY . .

# 共有パッケージをビルド
RUN npm run build --workspace=@transcendence/shared

WORKDIR /app/apps/frontend
EXPOSE 5173

CMD ["npm", "run", "dev"]

# ─── ビルドステージ ────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=development /app /app
RUN npx turbo run build --filter=@transcendence/frontend

# ─── 本番ステージ (Nginx でホスティング) ─────
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# nginx-spa.conf は用意されていない場合は後で作成します。
# COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
