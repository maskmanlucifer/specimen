# Specimen: one image with the API, the web client and the reader bundle.
# Boards live in /data unless you connect other storage.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends rsync openssh-client && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["pnpm", "start"]
