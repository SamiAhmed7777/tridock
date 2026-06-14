// Sanity test for Triangles HD derivation.
// Run: node scripts/derive-test.mjs
import { newMnemonic, isValidMnemonic, deriveAccounts, wifToPrivkey } from '../src/lib/triWallet.js'

// Deterministic BIP39 test vector (all-zero entropy) -> stable output
const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

console.log('mnemonic valid?', isValidMnemonic(M))
console.log('--- first 3 derived Triangles accounts ---')
const accts = deriveAccounts(M, 3)
let ok = true
for (const a of accts) {
  const startsT = a.address.startsWith('T')
  let wifOk = false
  try { const r = wifToPrivkey(a.wif); wifOk = r.priv.length === 32 && r.compressed } catch {}
  if (!startsT || !wifOk) ok = false
  console.log(`#${a.index} ${a.path}`)
  console.log(`   addr: ${a.address}  (T-prefix:${startsT})`)
  console.log(`   wif : ${a.wif.slice(0, 10)}...  (decodes:${wifOk})`)
}
console.log('--- generation ---')
console.log('new 12-word:', newMnemonic(12).split(' ').length, 'words')
console.log('new 24-word:', newMnemonic(24).split(' ').length, 'words')
console.log(ok ? '\nDERIVATION OK (valid T-addresses + compressed WIF)' : '\nDERIVATION FAILED')
