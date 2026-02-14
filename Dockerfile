# 多阶段构建：先构建前端，再运行后端（托管前端静态）
# 用于腾讯云 Cloud Run、阿里云、自建 Docker 等

FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
COPY --from=frontend /app/web/dist ./web/dist
EXPOSE 3002
# 云平台会注入 PORT，后端已使用 process.env.PORT
CMD ["node", "server/index.js"]
