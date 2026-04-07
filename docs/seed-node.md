# Seed Node Guide

Use seed mode when you want a publicly reachable TRI node that prioritizes connectivity.

## Suggested config

```yaml
environment:
  TRI_MODE: seed
  TRI_MAX_CONNECTIONS: "128"
  TRI_TOR_ENABLED: "1"
```

## Ports

Expose:
- `24112/tcp`
- `24112/udp`

## Notes

- Keep the node on stable storage
- Prefer a host with reliable uptime and bandwidth
- If the local chain is damaged, TRIdock will try the configured bootstrap sources automatically
