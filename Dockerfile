# syntax=docker/dockerfile:1
ARG OPENCODE_SOURCE=opencode-release
FROM oven/bun:1.4.4 AS base
WORKDIR /app

FROM base AS opencode-pin
ENV OPENCODE_VERSION=2.2.3-internetisalie.1 \
    OPENCODE_SHA256=07b76069e32ecd28063d302c074e4b70a774930b68c97bf0061c27a44f83be5a

FROM opencode-pin AS opencode-release
ADD --checksum=sha256:${OPENCODE_SHA256} --chmod=755 https://github.com/internetisalie/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64-baseline /opencode

# Select a named local context with OPENCODE_SOURCE; its root must contain opencode.
FROM ${OPENCODE_SOURCE} AS opencode-artifact

FROM opencode-pin AS opencode-verified
WORKDIR /backend
COPY --from=opencode-artifact --chmod=755 /opencode ./opencode
RUN printf '%s  opencode\n' "$OPENCODE_SHA256" | sha256sum --check --strict - \
    && actual_version="$(./opencode --version)" \
    && test "$actual_version" = "opencode v$OPENCODE_VERSION"

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY bun-patches ./bun-patches
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/
COPY packages/electron/package.json ./packages/electron/
COPY packages/vscode/package.json ./packages/vscode/
COPY packages/mobile/package.json ./packages/mobile/
COPY packages/sdk/package.json ./packages/sdk/
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
WORKDIR /app
COPY . .
# The server imports @openchamber/sdk at runtime, and deps installed with
# --ignore-scripts, so the root postinstall never built it. Build it here
# so the runtime stage can copy the output.
RUN bun run --cwd packages/sdk build
RUN bun run build:web

FROM oven/bun:1.4.4 AS runtime
WORKDIR /home/openchamber

# Both sources use the pinned GNU binary and the same verified runtime recipe.
COPY --from=opencode-verified --chmod=755 /backend/opencode /usr/local/bin/opencode

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  bzip2 \
  ca-certificates \
  git \
  less \
  nodejs \
  npm \
  openssh-client \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Replace the base image's 'bun' user (UID 1000) with 'openchamber'
# so mounted volumes with 1000:1000 ownership work correctly.
RUN userdel bun \
  && groupadd -g 1000 openchamber \
  && useradd -u 1000 -g 1000 -m -s /bin/bash openchamber \
  && chown -R openchamber:openchamber /home/openchamber

# Switch to openchamber user
USER openchamber

ENV NPM_CONFIG_PREFIX=/home/openchamber/.npm-global
ENV PATH=${NPM_CONFIG_PREFIX}/bin:${PATH}

RUN npm config set prefix /home/openchamber/.npm-global && mkdir -p /home/openchamber/.npm-global && \
  mkdir -p /home/openchamber/.local /home/openchamber/.config /home/openchamber/.ssh

# cloudflared 2026.3.0 - update digest explicitly when upgrading
COPY --from=cloudflare/cloudflared@sha256:6d91c121b803126f7a5344005d17a9324788fc09d305b6e2560ec6040a7ae283 /usr/local/bin/cloudflared /usr/local/bin/cloudflared

ENV NODE_ENV=production
# The base image ships with the POSIX locale, which makes bash readline treat
# every byte of a multibyte character separately in the built-in terminal.
ENV LANG=C.UTF-8

COPY scripts/docker-entrypoint.sh /home/openchamber/openchamber-entrypoint.sh

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/package.json
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/web/bin ./packages/web/bin
COPY --from=builder /app/packages/web/server ./packages/web/server
COPY --from=builder /app/packages/web/dist ./packages/web/dist

EXPOSE 3000

ENTRYPOINT ["sh", "/home/openchamber/openchamber-entrypoint.sh"]
