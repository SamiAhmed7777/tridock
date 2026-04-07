# Staking Guide

Use staking mode only when the container holds a wallet you actually intend to stake with.

## Suggested config

```yaml
environment:
  TRI_MODE: staking
  TRI_STAKE_ENABLED: "1"
```

## Important

- Back up `wallet.dat` before changes
- Persist `/tri/data`
- Use strong RPC credentials
- Do not casually wipe the data volume on a staking node

## Basic workflow

1. Start node in staking mode
2. Let it fully sync
3. Confirm wallet and staking config inside the data directory
4. Monitor balance, stake weight, and backups
