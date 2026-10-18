# Build from the repository root: docker build -f services/api/Dockerfile .
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile --filter @updraft/api...
COPY packages/sdk packages/sdk
COPY services/api services/api
RUN pnpm --filter @updraft/sdk build && pnpm --filter @updraft/api build   && pnpm --filter @updraft/api deploy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production ANALYSIS_PATH=/app/analysis/bottom-of-curve.json
COPY --from=build /out .
COPY services/analysis/out/bottom-of-curve.json ./analysis/bottom-of-curve.json
CMD ["node", "dist/index.js"]
