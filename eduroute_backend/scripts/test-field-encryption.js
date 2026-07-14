const assert = require('assert');
const crypto = require('crypto');
const env = require('../src/config/env');
const { encryptText, decryptText } = require('../src/utils/fieldEncryption');

const originalKey = env.fieldEncryptionKey;

try {
    env.fieldEncryptionKey = '';
    assert.throws(() => encryptText('sample'), /FIELD_ENCRYPTION_KEY is missing/);

    env.fieldEncryptionKey = Buffer.from('short-key').toString('base64');
    assert.throws(() => encryptText('sample'), /base64-encoded 32-byte key/);

    env.fieldEncryptionKey = crypto.randomBytes(32).toString('base64');

    const first = encryptText('09123456789');
    const second = encryptText('09123456789');

    assert.notStrictEqual(first.encryptedData, second.encryptedData, 'AES-GCM must use a random IV per encryption');
    assert.strictEqual(decryptText(first.encryptedData, first.iv, first.authTag), '09123456789');

    const tamperedTag = Buffer.from(first.authTag, 'base64');
    tamperedTag[0] = tamperedTag[0] ^ 1;
    assert.throws(() => decryptText(first.encryptedData, first.iv, tamperedTag.toString('base64')));

    console.log('Field encryption smoke tests passed.');
} finally {
    env.fieldEncryptionKey = originalKey;
}
