FROM alpine:3.19

RUN apk add --no-cache \
    bash \
    bind-tools \
    coreutils \
    curl \
    jq \
    openssl \
    tar \
    tor \
    wget

RUN mkdir -p /tri/bin /tri/lib /tri/data /tri/bootstrap /var/lib/tor /var/log/tri

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/tri/data", "/tri/bootstrap", "/tri/bin", "/tri/lib"]

EXPOSE 24112/tcp 24112/udp

ENTRYPOINT ["/entrypoint.sh"]
