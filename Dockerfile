# syntax=docker/dockerfile:1
# ============================================================
# Stage 1: Build the web wallet UI
# ============================================================
FROM node:22-bookworm-slim AS wallet-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ============================================================
# Stage 2: Triangles node runtime
# ============================================================
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    dnsutils \
    jq \
    libboost-filesystem1.74.0 \
    libboost-chrono1.74.0 \
    libboost-date-time1.74.0 \
    libboost-serialization1.74.0 \
    libboost-program-options1.74.0 \
    libboost-system1.74.0 \
    libboost-thread1.74.0 \
    libdb5.3 \
    libdb5.3++ \
    libevent-2.1-7 \
    libminiupnpc17 \
    libssl3 \
    netcat-openbsd \
    openssl \
    procps \
    iproute2 \
    tar \
    libarchive-tools \
    tor \
    wget \
    xz-utils \
    zstd \
    zlib1g \
    binutils \
    dpkg \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tri/bin /tri/lib /tri/data /tri/bootstrap /tri/backups /tri/config /tri/ui-data /tri/logs /var/lib/tor /var/log/tri /tri/cache

# Copy web UI from builder stage
COPY --from=wallet-builder /app/dist /tri/ui-data/dist

# Copy node server for wallet web UI
COPY --from=wallet-builder /app/server.mjs /tri/ui-data/server.mjs
COPY --from=wallet-builder /app/package*.json /tri/ui-data/

# Install web UI dependencies (express, qrcode, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
 && rm -rf /var/lib/apt/lists/* \
 && cd /tri/ui-data && npm install --omit=dev \
 && apt-get remove -y nodejs npm \
 && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY healthcheck.sh /healthcheck.sh
COPY tridock.sh /usr/local/bin/tridock
RUN chmod +x /entrypoint.sh /healthcheck.sh /usr/local/bin/tridock

VOLUME ["/tri/data", "/tri/bootstrap", "/tri/cache", "/tri/state", "/tri/backups", "/tri/config", "/tri/ui-data", "/tri/logs"]

EXPOSE 24112/tcp 24112/udp 4177/tcp

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
