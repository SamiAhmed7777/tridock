# syntax=docker/dockerfile:1
# ============================================================================
# TRIdock — TRI7 era (tri7d, the modern Rust client)
#
# Multi-stage build of tri7d (follow_tip daemon) from the tri7 repo
# (github.com/SamiAhmed7777/tri7, branch master). Pure Rust + vendored C hash
# code (cc crate → gcc needed in the builder stage only).
#
# Build:  docker build -f tri7.Dockerfile -t samiahmed7777/tridock:tri7 .
# Legacy (C++ client) image remains available as samiahmed7777/tridock:legacy
# via the legacy Dockerfile — see README.md "Rollback" section.
# ============================================================================
FROM rust:1-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
# Copy the tri7 source into the image (build context = a tri7 checkout).
#   docker build -f tri7.Dockerfile --build-context tri7=/root/tridock-build/tri7 .
COPY --from=tri7 . /build/tri7

# Headless daemon build: follow_tip IS tri7d. The GUI (tri7_wallet_gui) needs
# --features gui + X11/Wayland libs and is intentionally NOT built here.
RUN cd /build/tri7 \
 && cargo build --release --bin follow_tip --bin balances \
 && strip target/release/follow_tip target/release/balances

# ============================================================================
# Runtime
# ============================================================================
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# tor: bundled sidecar (SOCKS 127.0.0.1:9050) — tri7d dials .onion peers
# through it natively via --socks. socat: bridges the loopback-only tri7d RPC
# (bind policy enforced in tri7d) to 0.0.0.0:19112 inside the container so the
# port can be published. curl/jq: bootstrap fetch + doctor tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq socat tor \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1000 --home-dir /var/lib/tri7 --shell /usr/sbin/nologin tri7 \
 && mkdir -p /var/lib/tri7/conf /var/lib/tor /var/log/tor \
 && chown -R tri7:tri7 /var/lib/tri7 /var/lib/tor /var/log/tor

COPY --from=builder /build/tri7/target/release/follow_tip /usr/local/bin/tri7d
COPY --from=builder /build/tri7/target/release/balances  /usr/local/bin/tri7-balances
COPY entrypoint-tri7.sh tri7-healthcheck.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/tri7d /usr/local/bin/tri7-balances \
 && chmod 0755 /usr/local/bin/entrypoint-tri7.sh /usr/local/bin/tri7-healthcheck.sh \
 && ln -sf tri7d /usr/local/bin/follow_tip

USER tri7
WORKDIR /var/lib/tri7

# 19112  JSON-RPC (loopback-only in tri7d; socat bridge publishes it)
# 24113  inbound P2P listener
EXPOSE 19112/tcp 24113/tcp 24113/udp

VOLUME ["/var/lib/tri7"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD ["tri7-healthcheck.sh"]

ENTRYPOINT ["/usr/local/bin/entrypoint-tri7.sh"]
