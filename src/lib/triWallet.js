// Triangles HD wallet (BIP39 + BIP32) — derives valid Triangles keys/addresses
// from a seed phrase, entirely client-side. The daemon only ever receives
// already-derived WIF private keys (via importprivkey); the phrase never leaves
// the browser.
//
// Triangles network constants (from src/base58.h):
//   PUBKEY_ADDRESS = 65   -> P2PKH addresses begin with "T"
//   SCRIPT_ADDRESS = 28
//   WIF prefix     = 128 + 65 = 193 (compressed keys append 0x01)
// Curve: secp256k1 (standard BIP32 applies).

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { base58check as _base58check } from '@scure/base'

export const TRI_NETWORK = {
  name: 'Triangles',
  pubKeyHash: 65, // "T..." addresses
  scriptHash: 28,
  wif: 193,
  // Derivation path coin type (custom; Triangles is not in SLIP-44).
  // Keep this fixed so a phrase always restores the same addresses.
  coinType: 2222,
}

const b58check = _base58check(sha256)

function hash160(bytes) {
  return ripemd160(sha256(bytes))
}

// pubkey (33-byte compressed) -> Triangles base58 address
export function pubkeyToAddress(pubkey) {
  const payload = new Uint8Array(21)
  payload[0] = TRI_NETWORK.pubKeyHash
  payload.set(hash160(pubkey), 1)
  return b58check.encode(payload)
}

// 32-byte private key -> Triangles WIF (compressed)
export function privkeyToWIF(priv32) {
  const payload = new Uint8Array(34)
  payload[0] = TRI_NETWORK.wif
  payload.set(priv32, 1)
  payload[33] = 0x01 // compressed-key marker
  return b58check.encode(payload)
}

// WIF -> { priv (Uint8Array), compressed } (used to validate round-trips)
export function wifToPrivkey(wif) {
  const data = b58check.decode(wif)
  if (data[0] !== TRI_NETWORK.wif) throw new Error('not a Triangles WIF')
  const compressed = data.length === 34 && data[33] === 0x01
  return { priv: data.slice(1, 33), compressed }
}

// WIF -> Triangles address (proves key<->address matches the daemon)
export function addressFromWIF(wif) {
  const { priv, compressed } = wifToPrivkey(wif)
  const pub = secp256k1.getPublicKey(priv, compressed)
  return pubkeyToAddress(pub)
}

export function newMnemonic(words = 24) {
  // 24 words = 256 bits (default), 12 words = 128 bits
  const strength = words === 12 ? 128 : 256
  return generateMnemonic(wordlist, strength)
}

export function isValidMnemonic(mnemonic) {
  return validateMnemonic(mnemonic.trim(), wordlist)
}

function rootFromMnemonic(mnemonic, passphrase = '') {
  const seed = mnemonicToSeedSync(mnemonic.trim(), passphrase)
  return HDKey.fromMasterSeed(seed)
}

// Derive account address #i: m/44'/coinType'/0'/0/i
export function deriveAccount(mnemonic, index = 0, { passphrase = '' } = {}) {
  const root = rootFromMnemonic(mnemonic, passphrase)
  const path = `m/44'/${TRI_NETWORK.coinType}'/0'/0/${index}`
  const node = root.derive(path)
  if (!node.privateKey || !node.publicKey) throw new Error('derivation failed')
  return {
    index,
    path,
    address: pubkeyToAddress(node.publicKey),
    wif: privkeyToWIF(node.privateKey),
  }
}

// Derive the first `count` receiving addresses from a phrase
export function deriveAccounts(mnemonic, count = 5, opts = {}) {
  const root = rootFromMnemonic(mnemonic, opts.passphrase || '')
  const out = []
  for (let i = 0; i < count; i++) {
    const path = `m/44'/${TRI_NETWORK.coinType}'/0'/0/${i}`
    const node = root.derive(path)
    out.push({
      index: i,
      path,
      address: pubkeyToAddress(node.publicKey),
      wif: privkeyToWIF(node.privateKey),
    })
  }
  return out
}
