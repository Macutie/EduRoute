const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');

const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const AES_ALGORITHM = 'aes-256-gcm';
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;

const hasCloudinaryConfig = () => Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);

const getMediaEncryptionKey = () => {
    const key = Buffer.from(String(env.mediaEncryptionKey || env.fieldEncryptionKey || ''), 'base64');
    if (key.length !== AES_KEY_BYTES) throw new Error('MEDIA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    return key;
};

const toBase64Url = value => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromBase64Url = value => {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(`${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`, 'base64');
};

const encryptBuffer = buffer => {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, getMediaEncryptionKey(), iv);
    return {
        buffer: Buffer.concat([cipher.update(buffer), cipher.final()]),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64')
    };
};

const decryptBuffer = (buffer, iv, authTag) => {
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, getMediaEncryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
};

const detectContentType = (buffer, declaredType) => {
    if (declaredType && declaredType !== 'application/octet-stream') return declaredType;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
    if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
    return declaredType || 'application/octet-stream';
};

const createSecureMediaToken = ({ storage, cloudinaryUrl, localPath, iv, authTag, contentType }) => {
    const tokenIv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, getMediaEncryptionKey(), tokenIv);
    const payload = JSON.stringify({ version: 1, storage, cloudinaryUrl: cloudinaryUrl || null, localPath: localPath || null, iv, authTag, contentType });
    const encryptedPayload = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return toBase64Url(Buffer.concat([tokenIv, cipher.getAuthTag(), encryptedPayload]));
};

const decodeSecureMediaToken = token => {
    const encoded = fromBase64Url(token);
    if (encoded.length <= IV_BYTES + 16) throw new Error('Invalid secure media token');
    const tokenIv = encoded.subarray(0, IV_BYTES);
    const tokenTag = encoded.subarray(IV_BYTES, IV_BYTES + 16);
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, getMediaEncryptionKey(), tokenIv);
    decipher.setAuthTag(tokenTag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encoded.subarray(IV_BYTES + 16)), decipher.final()]).toString('utf8'));
    if (payload.version !== 1 || !payload.storage || !payload.iv || !payload.authTag) throw new Error('Invalid secure media payload');
    return payload;
};

const sanitizeSegment = (value, fallback = 'asset') => String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

const uploadBufferToCloudinary = (buffer, { folder, publicId }) => new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder, public_id: publicId, overwrite: true, resource_type: 'raw' }, (error, result) => {
        if (error) return reject(error);
        return resolve({ url: result.secure_url, publicId: result.public_id, storage: 'cloudinary' });
    });
    uploadStream.end(buffer);
});

const uploadBufferLocally = async (buffer, { folder, publicId }) => {
    const safeFolder = sanitizeSegment(folder, 'protected-assets');
    const safePublicId = sanitizeSegment(publicId, `asset-${Date.now()}`);
    const targetDir = path.join(LOCAL_UPLOAD_ROOT, safeFolder);
    const absolutePath = path.join(targetDir, `${safePublicId}.enc`);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return { localPath: absolutePath, publicId: `local/${safeFolder}/${safePublicId}`, storage: 'local' };
};

const uploadProtectedBuffer = async (buffer, options = {}) => {
    const encrypted = encryptBuffer(buffer);
    const folder = options.folder || 'protected-assets';
    const publicId = options.publicId || `asset-${Date.now()}`;
    const stored = hasCloudinaryConfig()
        ? await uploadBufferToCloudinary(encrypted.buffer, { folder, publicId })
        : await uploadBufferLocally(encrypted.buffer, { folder, publicId });
    const token = createSecureMediaToken({
        storage: stored.storage,
        cloudinaryUrl: stored.url,
        localPath: stored.localPath,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        contentType: options.mimeType || `image/${options.format || 'png'}`
    });
    return { url: `${env.backendUrl}/api/secure-media/${token}`, publicId: stored.publicId, storage: stored.storage, resourceType: 'raw' };
};

const uploadImageBuffer = async (buffer, options = {}) => uploadProtectedBuffer(buffer, options);
const uploadFileBuffer = async (buffer, options = {}) => uploadProtectedBuffer(buffer, { ...options, mimeType: options.mimeType || 'application/octet-stream' });

const readSecureMedia = async token => {
    const payload = decodeSecureMediaToken(token);
    let encryptedBuffer;
    if (payload.storage === 'local') {
        encryptedBuffer = await fs.readFile(payload.localPath);
    } else if (payload.storage === 'cloudinary' && /^https:\/\/res\.cloudinary\.com\//i.test(payload.cloudinaryUrl || '')) {
        const response = await fetch(payload.cloudinaryUrl);
        if (!response.ok) throw new Error('Protected media could not be retrieved');
        encryptedBuffer = Buffer.from(await response.arrayBuffer());
    } else {
        throw new Error('Invalid protected media storage');
    }
    const buffer = decryptBuffer(encryptedBuffer, payload.iv, payload.authTag);
    return { buffer, contentType: detectContentType(buffer, payload.contentType) };
};

const destroyUploadedAsset = async ({ publicId, resourceType = 'raw' } = {}) => {
    if (!publicId || !hasCloudinaryConfig() || publicId.startsWith('local/')) return;
    try {
        const resourceTypes = [...new Set([resourceType, 'raw', 'image'])];
        for (const currentResourceType of resourceTypes) {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: currentResourceType });
            if (result?.result === 'ok') return;
        }
    } catch (error) {
        console.error('Failed to remove protected Cloudinary asset:', error.message);
    }
};

module.exports = { hasCloudinaryConfig, uploadImageBuffer, uploadFileBuffer, readSecureMedia, destroyUploadedAsset };
