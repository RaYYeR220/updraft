# Build from the repository root: docker build -f services/keeper/Dockerfile .
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY services/keeper/package.json services/keeper/
RUN pnpm install --frozen-lockfile --filter @updraft/keeper...
COPY packages/sdk packages/sdk
COPY services/keeper services/keeper
RUN pnpm --filter @updraft/sdk build && pnpm --filter @updraft/keeper build \
  && pnpm --filter @updraft/keeper deploy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DEPLOYMENT_FILE=/app/deployment.json
COPY --from=build /out .
COPY deployments/elysium-testnet.json ./deployment.json
CMD ["node", "dist/index.js"]
