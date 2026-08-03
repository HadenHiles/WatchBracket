FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/integration-service/package.json apps/integration-service/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/provider-contracts/package.json packages/provider-contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/integration-service apps/integration-service
COPY packages packages
RUN pnpm --filter @watch-bracket/integration-service build && pnpm deploy --legacy --filter @watch-bracket/integration-service --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S watchbracket && adduser -S -G watchbracket watchbracket \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=watchbracket:watchbracket /out/node_modules ./node_modules
COPY --from=build --chown=watchbracket:watchbracket /app/apps/integration-service/dist ./dist
USER watchbracket
EXPOSE 3002
CMD ["node", "dist/server.js"]
