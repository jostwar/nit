FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY scripts scripts

RUN corepack enable && pnpm install --filter api...

COPY apps/api apps/api

WORKDIR /app/apps/api

RUN pnpm db:generate && pnpm build

EXPOSE 4000

CMD ["pnpm", "start:prod"]
