# Recovery Guide

## If the node will not sync

1. Check logs:

```bash
docker logs --tail 200 tridock
```

2. Check whether bootstrap sources are reachable
3. Verify the mounted binary and shared libs exist
4. Confirm Tor is up if Tor is enabled

## If chain data looks corrupted

TRIdock already performs a basic sanity check and may bootstrap automatically.

If you need a manual reset:

```bash
docker compose down
# then remove or replace the data volume intentionally
```

For wallet-bearing nodes, back up the data first.

## If bootstrap is wrong or outdated

Set:

```yaml
environment:
  TRI_BOOTSTRAP_URLS: "http://your-preferred-bootstrap/file.tar.gz"
```
