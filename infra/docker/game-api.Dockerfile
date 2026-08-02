FROM node:22.18-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/game-api/package.json apps/game-api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/display-protocol/package.json packages/display-protocol/package.json
COPY packages/realtime-protocol/package.json packages/realtime-protocol/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/game-api apps/game-api
COPY packages packages
RUN pnpm --filter @watch-bracket/game-api build && pnpm deploy --filter @watch-bracket/game-api --prod /out

FROM node:22.18-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S watchbracket && adduser -S -G watchbracket watchbracket
COPY --from=build --chown=watchbracket:watchbracket /out/node_modules ./node_modules
COPY --from=build --chown=watchbracket:watchbracket /app/apps/game-api/dist ./dist
COPY --from=build --chown=watchbracket:watchbracket /app/packages/db/migrations ./packages/db/migrations
USER watchbracket
EXPOSE 3001
CMD ["node", "dist/server.js"]
