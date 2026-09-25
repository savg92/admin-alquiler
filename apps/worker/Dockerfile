FROM oven/bun:1.4 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json biome.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN bun install --filter '@admin-alquiler/worker'

ENV NODE_ENV=production
CMD ["bun", "run", "apps/worker/src/main.ts"]
