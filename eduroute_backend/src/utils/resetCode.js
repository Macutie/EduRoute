const crypto = require('crypto');
const bcrypt = require('bcrypt');

const generateResetCode = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

const hashResetCode = async (code) => {
    return bcrypt.hash(String(code), 10);
};

const compareResetCode = async (code, hash) => {
    if (!code || !hash) return false;
    return bcrypt.compare(String(code), hash);
};

module.exports = {
    generateResetCode,
    hashResetCode,
    compareResetCode
};
