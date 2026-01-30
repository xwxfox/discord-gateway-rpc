FROM oven/bun:1.3.8-alpine AS base
WORKDIR /app

FROM base as prepare
RUN bun install -g turbo
COPY . .
RUN turbo prune ws-storage-server --docker

# install
FROM prepare AS install
COPY --from=prepare /app/out/json/ .
RUN bun install
COPY --from=prepare /app/out/full/ .

# Runtime image
FROM oven/bun:1.3.8-alpine AS release
WORKDIR /app

# Copy only what runtime needs
COPY --from=install /app .

USER bun
EXPOSE 3000/tcp
CMD ["bun", "run", "/app/apps/ws-storage-server/example/server.ts"]
