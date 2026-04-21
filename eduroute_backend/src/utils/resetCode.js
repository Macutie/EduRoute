const crypto = require('crypto');

const generateResetCode = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
};

const hashResetCode = (code) => {
    return crypto.createHash('sha256').update(code).digest('hex');
};

module.exports = {
    generateResetCode,
    hashResetCode
};