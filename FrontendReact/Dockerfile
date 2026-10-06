# ==========================================
# STAGE 1: build della PWA React con Vite
# ==========================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# --include=optional installa i binari nativi di Rollup/esbuild per Linux (musl)
RUN npm ci --include=optional --no-audit --no-fund

COPY . .

# Stesso dominio del backend: le API sono servite da Nginx sotto /api
ENV VITE_API_URL=/api \
    VITE_WS_URL=

RUN npm run build

# ==========================================
# STAGE 2: Nginx serve la build statica e fa da reverse proxy
# (la configurazione viene montata da backend/nginx/nginx.conf)
# ==========================================
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443
