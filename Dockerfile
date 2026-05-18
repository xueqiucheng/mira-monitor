# syntax=docker/dockerfile:1.7
# ============================================================================
# Mira Monitor — Next.js standalone 生产镜像
# 3 阶段：deps（装依赖）→ builder（编译）→ runner（瘦身）
# ============================================================================

ARG NODE_VERSION=22-alpine

# ---------- 1. deps：装生产 + dev 依赖（构建阶段需要 tailwind / typescript）
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# alpine 上 next/sharp 不需要额外 libc6-compat（Node 22 内置足够）
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
# npmmirror 在国内 CI 上快很多；GitHub runner 用官方源回退
RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --no-audit --no-fund --ignore-scripts

# ---------- 2. builder：next build
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- 3. runner：只带 standalone + static + public
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
