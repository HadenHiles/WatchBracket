FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/display-protocol/package.json packages/display-protocol/package.json
COPY packages/display-ui/package.json packages/display-ui/package.json
COPY packages/realtime-protocol/package.json packages/realtime-protocol/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
ARG GAME_API_INTERNAL_URL=http://game-api:3001
ARG PUBLIC_APP_URL=http://localhost:3000
ARG PUBLIC_ALIAS_URL=http://vote.localhost:3000
ARG NEXT_PUBLIC_ENABLE_PRESENTATION_TEST_MODE=false
ARG CAST_RECEIVER_APP_ID=
ENV GAME_API_INTERNAL_URL=$GAME_API_INTERNAL_URL PUBLIC_APP_URL=$PUBLIC_APP_URL PUBLIC_ALIAS_URL=$PUBLIC_ALIAS_URL NEXT_PUBLIC_ENABLE_PRESENTATION_TEST_MODE=$NEXT_PUBLIC_ENABLE_PRESENTATION_TEST_MODE CAST_RECEIVER_APP_ID=$CAST_RECEIVER_APP_ID NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @watch-bracket/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S watchbracket && adduser -S -G watchbracket watchbracket \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=watchbracket:watchbracket /app/apps/web/.next/standalone ./
COPY --from=build --chown=watchbracket:watchbracket /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=watchbracket:watchbracket /app/apps/web/public ./apps/web/public
USER watchbracket
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
