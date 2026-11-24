# Multi-stage build of the backend image (which also serves the frontend).
# Run from the repo root:  docker build -f packages/backend/Dockerfile .
# Based on https://backstage.io/docs/deployment/docker#multi-stage-build
#
# The Node version matches mise.toml: native modules built in one stage must
# load in the next.

# Stage 1: the yarn install skeleton, every package.json and nothing else, so
# source changes don't invalidate the dependency layer.
FROM node:24.22.3-trixie-slim AS packages

WORKDIR /app
COPY backstage.json package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY packages packages
COPY plugins plugins

RUN find packages \! -name "package.json" -mindepth 2 -maxdepth 2 -exec rm -rf {} \+

# Stage 2: install all dependencies, type-check, build the backend bundle.
FROM node:24.22.3-trixie-slim AS build

# Toolchain for native modules (isolated-vm, better-sqlite3) without prebuilds.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*
ENV PYTHON=/usr/bin/python3

USER node
WORKDIR /app

COPY --from=packages --chown=node:node /app .

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    yarn install --immutable

COPY --chown=node:node . .

RUN yarn tsc
RUN yarn --cwd packages/backend build

RUN mkdir packages/backend/dist/skeleton packages/backend/dist/bundle \
    && tar xzf packages/backend/dist/skeleton.tar.gz -C packages/backend/dist/skeleton \
    && tar xzf packages/backend/dist/bundle.tar.gz -C packages/backend/dist/bundle

# Stage 3: production dependencies and the bundle.
FROM node:24.22.3-trixie-slim

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*
ENV PYTHON=/usr/bin/python3

# From here on, the least-privileged `node` user (uid 1000).
USER node
WORKDIR /app

ENV NODE_ENV=production
# Node 20+ needs this for the scaffolder's isolated-vm sandbox.
ENV NODE_OPTIONS="--no-node-snapshot"

COPY --from=build --chown=node:node /app/.yarn ./.yarn
COPY --from=build --chown=node:node /app/.yarnrc.yml /app/backstage.json /app/yarn.lock /app/package.json ./
COPY --from=build --chown=node:node /app/packages/backend/dist/skeleton/ ./

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus --all --production && rm -rf "$(yarn cache clean)"

COPY --from=build --chown=node:node /app/packages/backend/dist/bundle/ ./
COPY --chown=node:node app-config.yaml app-config.production.yaml ./
COPY --chown=node:node catalog ./catalog
COPY --chown=node:node catalog-info.yaml ./

EXPOSE 7007
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
