const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const REQUIRED_KEY_BYTES = 32;

const getEncryptionKey = () => {
    const key = env.fieldEncryptionKey;

    if (!key) {
        throw new Error('FIELD_ENCRYPTION_KEY is missing');
    }

    const decodedKey = Buffer.from(key, 'base64');

    if (decodedKey.length !== REQUIRED_KEY_BYTES) {
        throw new Error('FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }

    return decodedKey;
};

const encryptText = (plainText) => {
    if (plainText === null || plainText === undefined) {
        return null;
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(String(plainText), 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedData: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64')
    };
};

const decryptText = (encryptedData, iv, authTag) => {
    if (!encryptedData || !iv || !authTag) {
        return null;
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'base64')),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
};

const encryptNullableText = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    const normalized = String(value);
    if (!normalized.trim()) {
        return null;
    }

    return encryptText(normalized);
};

const decryptNullableText = (encryptedData, iv, authTag) => decryptText(encryptedData, iv, authTag);

module.exports = {
    encryptText,
    decryptText,
    encryptNullableText,
    decryptNullableText
};
