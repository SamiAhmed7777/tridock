FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    dnsutils \
    jq \
    libssl3 \
    netcat-openbsd \
    openssl \
    procps \
    tar \
    tor \
    wget \
    xz-utils \
    binutils \
    dpkg \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tri/bin /tri/lib /tri/data /tri/bootstrap /var/lib/tor /var/log/tri /tri/cache

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/tri/data", "/tri/bootstrap", "/tri/bin", "/tri/lib", "/tri/cache"]

EXPOSE 24112/tcp 24112/udp

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD pgrep -x trianglesd >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
