const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signAccessToken = (payload) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, env.jwtSecret);
};

module.exports = {
    signAccessToken,
    verifyAccessToken
};