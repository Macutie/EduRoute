const sharp = require('sharp');
const AppError = require('../utils/appError');

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);

const IMAGE_PRESETS = {
    profile: {
        outputFormat: 'webp',
        mimeType: 'image/webp',
        extension: 'webp',
        resize: {
            width: 512,
            height: 512,
            fit: 'cover',
            position: 'attention'
        },
        webp: {
            quality: 82,
            effort: 5
        }
    },
    locationVerification: {
        outputFormat: 'webp',
        mimeType: 'image/webp',
        extension: 'webp',
        resize: {
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true
        },
        webp: {
            quality: 88,
            effort: 5
        }
    }
};

const assertSupportedImage = (file) => {
    if (!file) {
        throw new AppError('No image file uploaded.', 422);
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new AppError('Invalid image type. Only JPG, JPEG, PNG, and WebP files are allowed.', 422);
    }
};

const optimizeImage = async (file, presetName) => {
    assertSupportedImage(file);

    const preset = IMAGE_PRESETS[presetName];

    if (!preset) {
        throw new AppError('Image optimization preset is invalid.', 500);
    }

    try {
        let pipeline = sharp(file.buffer, {
            failOn: 'none'
        })
            .rotate()
            .resize(preset.resize);

        if (preset.outputFormat === 'webp') {
            pipeline = pipeline.webp(preset.webp);
        }

        const outputBuffer = await pipeline.toBuffer();
        const outputMetadata = await sharp(outputBuffer).metadata();

        return {
            buffer: outputBuffer,
            mimetype: preset.mimeType,
            extension: preset.extension,
            size: outputBuffer.length,
            width: outputMetadata.width || null,
            height: outputMetadata.height || null,
            original: {
                mimetype: file.mimetype,
                size: file.size,
                originalname: file.originalname
            }
        };
    } catch (error) {
        throw new AppError('Failed to process image. Please upload a valid image file.', 422);
    }
};

module.exports = {
    ALLOWED_IMAGE_MIME_TYPES,
    IMAGE_PRESETS,
    optimizeImage
};
