#!/bin/bash
# Daemon makes a fresh key; confirm our JS derives the SAME address from it.
cd /root/tridock
# Ensure @noble/curves is present (dep of @scure/bip32)
node -e "require.resolve('@noble/curves/secp256k1')" 2>/dev/null || npm install --no-audit --no-fund @noble/curves@1.4.0 >/dev/null 2>&1
B="/usr/local/bin/trianglesd -datadir=/root/.triangles"
ADDR=$($B getnewaddress hdrev 2>&1)
echo "daemon getnewaddress : $ADDR"
WIF=$($B dumpprivkey "$ADDR" 2>&1)
echo "daemon dumpprivkey   : ${WIF:0:8}..."
JS=$(node -e "import('./src/lib/triWallet.js').then(m=>process.stdout.write(m.addressFromWIF(process.argv[1]))).catch(e=>{console.error(e.message);process.exit(1)})" "$WIF")
echo "JS addressFromWIF    : $JS"
if [ "$ADDR" = "$JS" ]; then echo ">>> MATCH: JS derivation is daemon-correct (compressed keys confirmed)"; else echo ">>> MISMATCH - needs fixing"; fi
