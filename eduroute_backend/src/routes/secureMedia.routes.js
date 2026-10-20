const express = require('express');
const { readSecureMedia } = require('../services/upload.service');
const env = require('../config/env');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/:token', protect, async (req, res, next) => {
    try {
        const media = await readSecureMedia(req.params.token);
        const requestOrigin = req.get('Origin');
        if (requestOrigin && (env.frontendUrls.includes(requestOrigin) || process.env.NODE_ENV !== 'production')) {
            res.set('Access-Control-Allow-Origin', requestOrigin);
            res.set('Vary', 'Origin');
        }
        res.set({
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
        return res.type(media.contentType).send(media.buffer);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
