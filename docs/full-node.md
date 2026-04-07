# Full Node Guide

## Run a normal TRI node

1. Mount `trianglesd` into `./tri-bin/trianglesd`
2. Mount TRI shared libs into `./tri-lib/`
3. Set a real RPC password
4. Run:

```bash
docker compose up -d --build
```

The container will:
- start Tor
- check local chain data
- bootstrap automatically if needed
- start `trianglesd`

## Recommended settings

```yaml
environment:
  TRI_MODE: full
  TRI_MAX_CONNECTIONS: "64"
  TRI_DBCACHE: "512"
```

## Useful checks

```bash
docker logs -f tridock
docker exec tridock ps aux
docker exec tridock ls -lah /tri/data
```
