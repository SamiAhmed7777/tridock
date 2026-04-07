FROM alpine:3.19

RUN apk add --no-cache \
    bash \
    bind-tools \
    coreutils \
    curl \
    jq \
    libarchive-tools \
    libstdc++ \
    netcat-openbsd \
    openssl \
    procps \
    tar \
    tor \
    wget

RUN mkdir -p /tri/bin /tri/lib /tri/data /tri/bootstrap /var/lib/tor /var/log/tri /tri/cache

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/tri/data", "/tri/bootstrap", "/tri/bin", "/tri/lib", "/tri/cache"]

EXPOSE 24112/tcp 24112/udp

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD pgrep -x trianglesd >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
