FROM node:22.18-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/cast-receiver/package.json apps/cast-receiver/package.json
COPY packages/display-protocol/package.json packages/display-protocol/package.json
COPY packages/display-ui/package.json packages/display-ui/package.json
COPY packages/realtime-protocol/package.json packages/realtime-protocol/package.json
RUN pnpm install --frozen-lockfile
COPY apps/cast-receiver apps/cast-receiver
COPY packages packages
RUN pnpm --filter @watch-bracket/cast-receiver build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infra/docker/cast-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/cast-receiver/dist /usr/share/nginx/html/cast/receiver
EXPOSE 8080
