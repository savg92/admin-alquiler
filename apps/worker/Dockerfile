FROM oven/bun:1.4 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Full workspace install: the Prisma CLI is a devDependency of packages/database, and the
# generated client must be baked in or the container cannot construct PrismaClient.
RUN bun install
RUN bun run --filter '@admin-alquiler/database' db:generate

ENV NODE_ENV=production
CMD ["bun", "run", "apps/worker/src/main.ts"]
