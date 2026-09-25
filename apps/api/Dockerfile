FROM oven/bun:1.4 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json biome.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN bun install --filter '@admin-alquiler/api'

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "apps/api/src/main.ts"]
