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
    tar \
    tor \
    wget \
    xz-utils \
    zlib1g \
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
