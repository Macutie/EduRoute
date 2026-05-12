const fs = require('fs/promises');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');

const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const hasCloudinaryConfig = () => (
    Boolean(env.cloudinaryCloudName)
    && Boolean(env.cloudinaryApiKey)
    && Boolean(env.cloudinaryApiSecret)
);

const sanitizeSegment = (value, fallback = 'asset') => {
    const normalized = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
};

const uploadBufferToCloudinary = (buffer, { folder, publicId, format, resourceType = 'image' }) => (
    new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: publicId,
                overwrite: true,
                resource_type: resourceType,
                format
            },
            (error, result) => {
                if (error) return reject(error);
                return resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    storage: 'cloudinary'
                });
            }
        );

        uploadStream.end(buffer);
    })
);

const uploadBufferLocally = async (buffer, { folder, publicId, extension }) => {
    const safeFolder = sanitizeSegment(folder, 'proof-compliance');
    const safePublicId = sanitizeSegment(publicId, `asset-${Date.now()}`);
    const targetDir = path.join(LOCAL_UPLOAD_ROOT, safeFolder);
    const filename = `${safePublicId}.${extension}`;
    const absolutePath = path.join(targetDir, filename);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return {
        url: `${env.backendUrl}/uploads/${safeFolder}/${filename}`,
        publicId: `local/${safeFolder}/${safePublicId}`,
        storage: 'local'
    };
};

const uploadImageBuffer = async (buffer, options = {}) => {
    const folder = options.folder || 'proof-compliance';
    const publicId = options.publicId || `asset-${Date.now()}`;
    const format = options.format || 'png';
    const extension = options.extension || format;

    if (hasCloudinaryConfig()) {
        return uploadBufferToCloudinary(buffer, {
            folder,
            publicId,
            format,
            resourceType: 'image'
        });
    }

    return uploadBufferLocally(buffer, {
        folder,
        publicId,
        extension
    });
};

const uploadFileBuffer = async (buffer, options = {}) => {
    const folder = options.folder || 'files';
    const publicId = options.publicId || `asset-${Date.now()}`;
    const format = options.format || options.extension || 'bin';
    const extension = options.extension || format;
    const resourceType = options.resourceType || 'raw';

    if (hasCloudinaryConfig()) {
        return uploadBufferToCloudinary(buffer, {
            folder,
            publicId,
            format,
            resourceType
        });
    }

    return uploadBufferLocally(buffer, {
        folder,
        publicId,
        extension
    });
};

const destroyUploadedAsset = async ({ publicId, resourceType = 'image' } = {}) => {
    if (!publicId || !hasCloudinaryConfig() || publicId.startsWith('local/')) {
        return;
    }

    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error('Failed to remove uploaded asset from Cloudinary:', error.message);
    }
};

module.exports = {
    hasCloudinaryConfig,
    uploadImageBuffer,
    uploadFileBuffer,
    destroyUploadedAsset
};
