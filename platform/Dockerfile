# 田源可信 · 云托管镜像
# Phase 0：SQLite + Argon2，需要安装生产依赖
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib ./lib
COPY data ./data
COPY public ./public

EXPOSE 8080

CMD ["node", "server.js"]
