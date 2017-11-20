/**
 * This is an internal module which should not be used by library consumers.
 * @hidden
 */

/**
 * Functions defined in 4.1.1
 */
function f(t: number, b: number, c: number, d: number): number {
    if (t <= 19) return (b & c) ^ (~b & d)
    if (t <= 39) return b ^ c ^ d
    if (t <= 59) return (b & c) ^ (b & d) ^ (c & d)
    return b ^ c ^ d
}

// Constants defined in section 4.2.1
const K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6]

declare function unescape(s: string): string
function toUtf8(message: string): string {
    return unescape(encodeURIComponent(message))
}

function rotateLeft(x: number, n: number) {
    return (x << n) | (x >>> (32 - n))
}

function toHex(int: number): string {
    return `00000000${(int >>> 0).toString(16)}`.slice(-8)
}

/**
 * Computes the sha1 hash of the string as described by http://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 * See http://www.movable-type.co.uk/scripts/sha1.html for explanation of some of the bitwise magic.
 *
 * You probably don't want to touch this code.
 * @private
 * @param message the string to compute the SHA1 hash of
 */
export function sha1(message: string): string {
    message = toUtf8(message)

    // Parse the message into a word array so that we are working with numbers instead of strings
    const words = []
    const codeAt = (i: number) => message.charCodeAt(i < 0 ? message.length + i : i)

    for (let i = 0; i < message.length - 3; i += 4) {
        words.push(codeAt(i) << 24 | codeAt(i + 1) << 16 | codeAt(i + 2) << 8 | codeAt(i + 3))
    }
    words.push([
        0x80 << 24,
        codeAt(-1) << 24 | 0x80 << 16,
        codeAt(-2) << 24 | codeAt(-1) << 16 | 0x80 << 8,
        codeAt(-3) << 24 | codeAt(-2) << 16 | codeAt(-1) << 8 | 0x80
    ][message.length % 4])

    // Section 5.1.1

    // Now append k zero bits to satisfy the equation l % 512 = 448
    // where l is the length in bits.
    // Each item in words is 32 bits, so (words.length * 32) % 512 = 488
    // Divide everything by 32.
    while (words.length % 16 != 14) words.push(0)

    // Now append the length in bits as a 64 bit big-endian int.
    // Most significant, will normally be 0 for short inputs.
    words.push(message.length >>> 29)
    words.push(message.length << 3)

    // Section 6.1.2
    const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]

    // Process in 512 bit chunks, 16 words
    for (let i = 0; i < words.length; i += 16) {
        // 1 Prepare the message schedule
        const W = words.slice(i, i + 16)
        for (let t = 16; t < 80; t++) W[t] = rotateLeft(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1)

        // 2. Initialize working variables
        let [a, b, c, d, e] = h

        // 3. Loop, modifying the hash
        for (let t = 0; t < 80; t++) {
            // Shift right to perform int 32 addition
            const k = K[Math.floor(t / 20)]
            ;[a, b, c, d, e] = [
                rotateLeft(a, 5) + f(t, b, c, d) + e + k + W[t] >>> 0,
                a,
                rotateLeft(b, 30) >>> 0,
                c,
                d,
            ]
        }

        // 4. Compute the intermediate hash value
        [a, b, c, d, e].forEach((v, i) => h[i] = (h[i] + v) >>> 0)
    }

    // Done! Return the digest as hex
    return h.map(toHex).join('')
}
