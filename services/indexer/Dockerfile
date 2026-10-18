# Build from the repository root: docker build -f services/indexer/Dockerfile .
FROM node:24-slim
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY services/indexer/package.json services/indexer/
RUN pnpm install --frozen-lockfile --filter @updraft/indexer...
COPY packages/sdk packages/sdk
COPY services/indexer services/indexer
COPY deployments/elysium-testnet.json deployments/elysium-testnet.json
RUN pnpm --filter @updraft/sdk build
WORKDIR /repo/services/indexer
ENV NODE_ENV=production
CMD ["sh", "-c", "npx ponder start --port ${PORT:-8080} --schema ${DATABASE_SCHEMA:-updraft_indexer}"]
