FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN corepack enable && pnpm install --filter web...

COPY apps/web apps/web

WORKDIR /app/apps/web

ARG NEXT_PUBLIC_API_URL
ARG BUILD_ID=dev
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BUILD_ID=${BUILD_ID}
# Evita que el build worker de Next.js falle por OOM en servidores con poca RAM
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
