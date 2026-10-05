# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
ENV TURBO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS shared-builder
COPY packages/shared ./packages/shared
RUN --mount=type=cache,target=/app/.turbo \
    npm run build --workspace=@transcendence/shared

FROM node:22-alpine AS ai-toolchain
RUN apk add --no-cache cmake make g++

FROM ai-toolchain AS ai-builder
WORKDIR /src
COPY apps/ai-agent ./
RUN --mount=type=cache,id=ft-ai-build,target=/build \
    cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
    && cmake --build /build --parallel --target ai_agent \
    && cp /build/ai_agent /tmp/ai_agent

FROM dependencies AS backend-builder
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN --mount=type=cache,target=/app/.turbo \
    npm run build --workspace=@transcendence/backend
RUN npm prune --omit=dev

FROM node:22-alpine AS backend-production
RUN apk add --no-cache libstdc++
WORKDIR /app
ENV NODE_ENV=production
ENV AI_AGENT_PATH=/usr/local/bin/ai_agent
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=backend-builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=backend-builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=backend-builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=backend-builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=backend-builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=ai-builder /tmp/ai_agent /usr/local/bin/ai_agent
WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["sh", "-c", "node dist/src/migrate && exec node dist/src/main"]

FROM dependencies AS backend-development
RUN apk add --no-cache libstdc++
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY --from=ai-builder /tmp/ai_agent /usr/local/bin/ai_agent
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
ENV AI_AGENT_PATH=/usr/local/bin/ai_agent
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS frontend-builder
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend
RUN --mount=type=cache,target=/app/.turbo \
    npm run build --workspace=@transcendence/frontend

FROM nginx:1.27-alpine AS frontend-production
COPY --from=frontend-builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM dependencies AS frontend-development
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]
