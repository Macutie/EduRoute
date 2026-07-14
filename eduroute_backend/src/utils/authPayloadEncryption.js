const crypto = require('crypto');
const env = require('../config/env');

const AES_ALGORITHM = 'aes-256-gcm';
const RSA_HASH = 'sha256';

let runtimeKeyPair = null;

const normalizePem = (value) => String(value || '').replace(/\\n/g, '\n').trim();

const getPrivateKey = () => {
    if (env.authPayloadPrivateKey) {
        return crypto.createPrivateKey(normalizePem(env.authPayloadPrivateKey));
    }

    if (!runtimeKeyPair) {
        runtimeKeyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
    }

    return crypto.createPrivateKey(runtimeKeyPair.privateKey);
};

const getPublicKeyPem = () => {
    const publicKey = crypto.createPublicKey(getPrivateKey());

    return publicKey.export({
        type: 'spki',
        format: 'pem'
    });
};

const decryptAuthPayloadEnvelope = (envelope = {}) => {
    const payload = envelope.encryptedPayload || envelope;
    const { encryptedData, iv, authTag, encryptedKey } = payload || {};

    if (!encryptedData || !iv || !authTag || !encryptedKey) {
        throw new Error('Encrypted auth payload is incomplete.');
    }

    const aesKey = crypto.privateDecrypt(
        {
            key: getPrivateKey(),
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: RSA_HASH
        },
        Buffer.from(encryptedKey, 'base64')
    );

    const decipher = crypto.createDecipheriv(
        AES_ALGORITHM,
        aesKey,
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'base64')),
        decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
};

module.exports = {
    getPublicKeyPem,
    decryptAuthPayloadEnvelope
};
