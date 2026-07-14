const crypto = require('crypto');
const AppError = require('./appError');

const AES_ALGORITHM = 'aes-256-gcm';

const encryptSensitiveResponseData = (req, data) => {
    const publicKeyBase64 = req.get('x-eduroute-response-key');

    if (!publicKeyBase64) {
        throw new AppError('Encrypted response key is required.', 400);
    }

    const publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyBase64, 'base64'),
        type: 'spki',
        format: 'der'
    });
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, aesKey, iv);
    const encryptedData = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    const encryptedKey = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        aesKey
    );

    return {
        encryptedResponse: {
            encryptedData: encryptedData.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            encryptedKey: encryptedKey.toString('base64')
        }
    };
};

module.exports = {
    encryptSensitiveResponseData
};
