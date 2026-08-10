# syntax=docker/dockerfile:1

# node:22-alpine, khớp soosky-weather-marine-api và soosky-plant-care-api
# (dùng chung base layer -> VPS chỉ lưu một bản).

# ---- Stage 1: cài full deps, test, build ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test ./test

# Test không cần credentials và không gọi network ngoài.
RUN npm test

# tsc --noEmit + esbuild -> dist/app.js
RUN npm run build

# ---- Stage 2: runtime, chỉ prod deps ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Bundle build với --packages=external nên runtime vẫn cần node_modules prod.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Chỗ mount file .p8. Tạo rỗng; key được bind-mount read-only lúc chạy,
# không bao giờ nằm trong image.
RUN mkdir -p /run/secrets/apns && chown -R node:node /run/secrets /app

USER node

EXPOSE 3000

CMD ["node", "dist/app.js"]
