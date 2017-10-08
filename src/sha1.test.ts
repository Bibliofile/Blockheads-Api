import test from 'ava';

import { sha1 } from './sha1';

// Tests from https://www.di-mgt.com.au/sha_testvectors.html

test(`Empty string`, t => {
    t.is(sha1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
});

let tests = [
    [
        'abc',
        'a9993e364706816aba3e25717850c26c9cd0d89d'
    ],
    [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '84983e441c3bd26ebaae4aa1f95129e5e54670f1'
    ],
    [
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
        'a49b2446a02c645bf419f995b67091253a04a259'
    ],
    [
        'a'.repeat(1e6),
        '34aa973cd4c4daa4f61eeb2bdbad27316534016f'
    ]
];

for (let [input, hash] of tests) {
    test(input.substr(0, 25), t => {
        t.is(sha1(input), hash);
    });
}
