# Build from the repository root: docker build -f packages/mcp/Dockerfile .
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile --filter @updraft/mcp...
COPY packages/sdk packages/sdk
COPY packages/mcp packages/mcp
RUN pnpm --filter @updraft/sdk build && pnpm --filter @updraft/mcp build \
  && pnpm --filter @updraft/mcp deploy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
CMD ["node", "dist/index.js", "--http", "8080"]
