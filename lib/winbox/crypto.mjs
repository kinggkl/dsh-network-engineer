// EC-SRP5 / HKDF / AES-128-CBC / HMAC-SHA1 primitives for the WinBox protocol.
//
// Ported field-by-field from the MIT reference implementation
// tools/winbox/winbox_terminal_client.py (upstream: subixonfire/winbox-terminal-protocol).
// Only Node builtins are used; all elliptic-curve arithmetic is BigInt based.
//
// Byte-order contract: public API functions accept/return Buffer/Uint8Array
// objects (32-byte big-endian where Python used int.to_bytes(32, "big")), and
// BigInt values (hex/decimal) only inside the curve helpers.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

// Curve constants -- verbatim from WCurve.__init__ in the Python reference.
export const P = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn
export const R = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn
export const A_MONT = 486662n
export const GX = 9n
export const A_W = 0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa984914a144n
export const B_W = 0x7b425ed097b425ed097b425ed097b425ed097b4260b5e9c7710c864n
export const H = 8n

/** Conversion from Montgomery to Weierstrass x: A/3 (mod p). */
export const CONVERSION_FROM_M =
  (A_MONT * modInverse(3n, P)) % P
/** Conversion from Weierstrass to Montgomery x: -A/3 (mod p). */
export const CONVERSION = (P - CONVERSION_FROM_M) % P

// ---------------------------------------------------------------------------
// Small BigInt helpers
// ---------------------------------------------------------------------------

function toBig (value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError('integer expected')
    return BigInt(value)
  }
  if (typeof value === 'string') {
    return BigInt(value.startsWith('0x') || value.startsWith('0X') ? value : `0x${value}`)
  }
  if (value instanceof Uint8Array) {
    return value.length === 0 ? 0n : BigInt(`0x${Buffer.from(value).toString('hex')}`)
  }
  throw new TypeError('cannot convert to BigInt')
}

function toBytes (value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  throw new TypeError('byte buffer expected')
}

function mod (a, m) {
  const r = a % m
  return r < 0n ? r + m : r
}

/** Big-endian 32-byte encoding (Python int.to_bytes(32, "big")). */
export function bigIntToBytes32 (value) {
  const hex = toBig(value).toString(16)
  if (hex.length > 64) throw new RangeError('value does not fit in 32 bytes')
  return Buffer.from(hex.padStart(64, '0'), 'hex')
}

/** Read a 32-byte big-endian integer (Python int.from_bytes(x, "big")). */
export function bytesToBigInt (value) {
  return toBig(value)
}

/** Modular inverse via extended Euclid; throws when it does not exist. */
export function modInverse (a, m) {
  let oldR = m
  let r = mod(a, m)
  let oldS = 0n
  let s = 1n
  while (r !== 0n) {
    const q = oldR / r
    ;[oldR, r] = [r, oldR - q * r]
    ;[oldS, s] = [s, oldS - q * s]
  }
  if (oldR !== 1n) throw new Error('modular inverse does not exist')
  return mod(oldS, m)
}

/** Modular exponentiation (square-and-multiply). */
export function modPow (base, exponent, modulus) {
  let result = 1n
  let b = mod(toBig(base), modulus)
  let e = toBig(exponent)
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= 1n
  }
  return result
}

function legendreSymbol (a, p) {
  const l = modPow(a, (p - 1n) / 2n, p)
  return l === p - 1n ? -1n : l
}

/**
 * Modular square roots (Python _prime_mod_sqrt): returns [x, p-x] or [].
 * p = 2^255 - 19 is 1 mod 4, so the Tonelli-Shanks branch is the live one.
 */
export function primeModSqrt (a, p = P) {
  a = mod(toBig(a), p)
  if (a === 0n) return [0n]
  if (p === 2n) return [a]
  if (legendreSymbol(a, p) !== 1n) return []
  if (p % 4n === 3n) {
    const x = modPow(a, (p + 1n) / 4n, p)
    return [x, p - x]
  }
  let q = p - 1n
  let s = 0
  while (q % 2n === 0n) {
    s += 1
    q /= 2n
  }
  let z = 1n
  while (legendreSymbol(z, p) !== -1n) z += 1n
  let c = modPow(z, q, p)
  let x = modPow(a, (q + 1n) / 2n, p)
  let t = modPow(a, q, p)
  let m = s
  while (t !== 1n) {
    let i = 0
    let e = 2n
    for (i = 1; i < m; i += 1) {
      if (modPow(t, e, p) === 1n) break
      e *= 2n
    }
    void e
    const b = modPow(c, 1n << BigInt(m - i - 1), p)
    x = (x * b) % p
    t = (t * b * b) % p
    c = (b * b) % p
    m = i
  }
  return [x, p - x]
}

// ---------------------------------------------------------------------------
// Weierstrass point arithmetic (the Python reference uses ecdsa.PointJacobi;
// the same curve points are represented here as affine BigInt {x, y} objects).
// ---------------------------------------------------------------------------

/** Affine point addition on the Weierstrass curve y^2 = x^3 + a*x + b. */
export function pointAdd (p1, p2) {
  if (p1 === null || p1 === undefined) return p2 ?? null
  if (p2 === null || p2 === undefined) return p1
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y, P) === 0n) return null // p1 = -p2 -> infinity
    const slope = mod(3n * p1.x * p1.x + A_W, P) * modInverse(2n * p1.y, P)
    const x3 = mod(slope * slope - 2n * p1.x, P)
    const y3 = mod(slope * (p1.x - x3) - p1.y, P)
    return { x: x3, y: y3 }
  }
  const slope = mod(p2.y - p1.y, P) * modInverse(p2.x - p1.x, P)
  const x3 = mod(slope * slope - p1.x - p2.x, P)
  const y3 = mod(slope * (p1.x - x3) - p1.y, P)
  return { x: x3, y: y3 }
}

/** Scalar multiplication by double-and-add; k is *not* reduced modulo R. */
export function scalarMult (point, k) {
  let n = toBig(k)
  if (point === null || point === undefined || n === 0n) return null
  let result = null
  let addend = point
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend)
    addend = pointAdd(addend, addend)
    n >>= 1n
  }
  return result
}

/**
 * Lift an x coordinate on the Montgomery curve to a Weierstrass point
 * (Python WCurve.lift_x). Returns {x, y} or null when x is not on the curve.
 */
export function liftX (x, parity) {
  const xm = mod(toBig(x), P)
  const ySquared = mod(xm * xm * xm + A_MONT * xm * xm + xm, P)
  const xw = mod(xm + CONVERSION_FROM_M, P)
  const roots = primeModSqrt(ySquared, P)
  if (roots.length === 0) return null
  const wantOdd = (Number(parity) & 1) === 1
  const candidates = [
    { x: xw, y: mod(roots[0], P) },
    { x: xw, y: mod(roots[1], P) },
  ]
  for (const pt of candidates) {
    if (Number(pt.y & 1n) === (wantOdd ? 1 : 0)) return pt
  }
  return candidates[1]
}

// ---------------------------------------------------------------------------
// Hash / KDF
// ---------------------------------------------------------------------------

/** Python get_sha2_digest / hashlib.sha256().digest(). */
export function sha256 (data) {
  return createHash('sha256').update(toBytes(data)).digest()
}

/** Python get_sha2_digest alias used by the client code. */
export function getSha2Digest (data) {
  return sha256(data)
}

/** HMAC-SHA1 (used for stream HMAC keys and the HKDF construction). */
export function hmacSha1 (key, data) {
  return createHmac('sha1', toBytes(key)).update(toBytes(data)).digest()
}

/** Verify an HMAC-SHA1 with a constant-time comparison. */
export function verifyHmacSha1 (key, data, expected) {
  const actual = hmacSha1(key, data)
  const expectedBuf = toBytes(expected)
  if (actual.length !== expectedBuf.length) return false
  return timingSafeEqual(actual, expectedBuf)
}

/** Python HKDF(): two SHA-1 HMAC blocks over a 0x40-byte zero key; 0x24 bytes. */
export function hkdf (message) {
  const h1 = hmacSha1(Buffer.alloc(0x40), message)
  let previous = Buffer.alloc(0)
  let result = Buffer.alloc(0)
  for (let i = 0; i < 2; i += 1) {
    previous = hmacSha1(h1, Buffer.concat([previous, Buffer.from([i + 1])]))
    result = Buffer.concat([result, previous])
  }
  return result.subarray(0, 0x24)
}

/**
 * Python gen_stream_keys(server, z). Returns the four 16-byte transport keys
 * as {sendAesKey, receiveAesKey, sendHmacKey, receiveHmacKey}.
 */
export function genStreamKeys (server, z) {
  const magic2 = Buffer.from(
    'On the client side, this is the send key; on the server side, it is the receive key.',
    'utf8'
  )
  const magic3 = Buffer.from(
    'On the client side, this is the receive key; on the server side, it is the send key.',
    'utf8'
  )
  const zeros = Buffer.alloc(40)
  const tail = Buffer.alloc(40, 0xf2)
  const zBytes = toBytes(z)
  const clientSend = Buffer.concat([zBytes, zeros, magic2, tail])
  const clientReceive = Buffer.concat([zBytes, zeros, magic3, tail])
  const txEnc = Buffer.concat([zBytes, zeros, server ? magic3 : magic2, tail])
  const rxEnc = Buffer.concat([zBytes, zeros, server ? magic2 : magic3, tail])
  void clientSend
  void clientReceive
  const tx = createHash('sha1').update(txEnc).digest().subarray(0, 16)
  const rx = createHash('sha1').update(rxEnc).digest().subarray(0, 16)
  const sendKey = hkdf(tx)
  const receiveKey = hkdf(rx)
  return {
    sendAesKey: sendKey.subarray(0, 16),
    receiveAesKey: receiveKey.subarray(0, 16),
    sendHmacKey: sendKey.subarray(16),
    receiveHmacKey: receiveKey.subarray(16),
  }
}

// ---------------------------------------------------------------------------
// AES-128-CBC + WinBox HMAC/padding scheme
// ---------------------------------------------------------------------------

/** AES-128-CBC encrypt of block-aligned data, no PKCS7 auto padding. */
export function encryptAesCbc (key, iv, plain) {
  const cipher = createCipheriv('aes-128-cbc', toBytes(key), toBytes(iv))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(toBytes(plain)), cipher.final()])
}

/** AES-128-CBC decrypt of block-aligned data, no PKCS7 auto unpadding. */
export function decryptAesCbc (key, iv, cipherText) {
  const decipher = createDecipheriv('aes-128-cbc', toBytes(key), toBytes(iv))
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(toBytes(cipherText)), decipher.final()])
}

/**
 * WinBox encryption prelude: append HMAC-SHA1 then the custom padding
 * (pad_byte = 0x0F - len % 0x10, repeated pad_byte + 1 times).
 * This mirrors the reference implementation exactly (it is not PKCS7:
 * when pad_byte is 0 a single 0x00 byte is appended).
 */
export function appendHmacAndPadding (plain, hmacKey) {
  const message = toBytes(plain)
  const mac = hmacSha1(hmacKey, message)
  const combined = Buffer.concat([message, mac])
  const padByte = 0x0f - (combined.length % 0x10)
  const padding = Buffer.alloc(padByte + 1, padByte)
  return Buffer.concat([combined, padding])
}

/**
 * Inverse of appendHmacAndPadding: strip the custom padding and the trailing
 * 20-byte HMAC, returning the plaintext M2 message (or null when malformed).
 */
export function stripHmacAndPadding (decrypted) {
  let data = toBytes(decrypted)
  if (data.length === 0) return null
  const last = data[data.length - 1]
  if (last !== 0) {
    const count = last
    if (count > 16 || count > data.length) return null
    for (let i = data.length - count; i < data.length; i += 1) {
      if (data[i] !== count) return null
    }
    data = data.subarray(0, data.length - count)
  }
  if (data.length === 0) return null
  data = data.subarray(0, data.length - 1) // strip the pad indicator byte
  if (data.length < 20) return null
  return data.subarray(0, data.length - 20) // strip the HMAC
}

// ---------------------------------------------------------------------------
// Curve wrapper (public API mirroring the Python WCurve class)
// ---------------------------------------------------------------------------

export class WCurve {
  constructor () {
    this.g = liftX(GX, 0)
  }

  liftX (x, parity) {
    return liftX(x, parity)
  }

  /** Convert a Weierstrass point back to a Montgomery x (32-byte BE) + y parity. */
  toMontgomery (point) {
    if (point === null || point === undefined) throw new RangeError('point is at infinity')
    const x = mod(point.x + CONVERSION, P)
    return { x: bigIntToBytes32(x), parity: Number(point.y & 1n) }
  }

  /** Python gen_public_key(priv): priv * G in Montgomery form. */
  genPublicKey (priv) {
    const scalar = toBig(priv)
    const point = scalarMult(this.g, scalar)
    return this.toMontgomery(point)
  }

  /** Python redp1(x, parity): hash-to-curve point used for the verifier v. */
  redp1 (x, parity = 1) {
    let seed = sha256(toBytes(x))
    for (;;) {
      const candidate = sha256(seed)
      const point = liftX(toBig(candidate), parity)
      if (point !== null) return point
      seed = bigIntToBytes32(toBig(seed) + 1n)
    }
  }

  /** Python gen_password_validator_priv (used as the SRP private exponent). */
  genPasswordValidatorPriv (username, password, salt) {
    const inner = sha256(Buffer.from(`${username}:${password}`, 'utf8'))
    return sha256(Buffer.concat([toBytes(salt), inner]))
  }

  /** Python finite_field_value(a) = a % r. */
  finiteFieldValue (a) {
    return mod(toBig(a), R)
  }
}
