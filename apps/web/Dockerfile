FROM oven/bun:1.4 AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN bun install
RUN bun run --filter '@admin-alquiler/web' build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv/web
COPY --from=build /app/apps/web/Caddyfile /etc/caddy/Caddyfile
