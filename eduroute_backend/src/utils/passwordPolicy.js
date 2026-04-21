const hasRequiredComposition = (password) => {
    const hasMinLength = password.length >= 10;
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);

    return hasMinLength && hasNumber && hasSymbol;
};

const containsPersonalInfo = ({ password, fullName = '', employeeId = '', email = '' }) => {
    const normalizedPassword = String(password || '').toLowerCase();
    const normalizedFullName = String(fullName || '').toLowerCase().trim();
    const normalizedEmployeeId = String(employeeId || '').toLowerCase().trim();
    const normalizedEmail = String(email || '').toLowerCase().trim();

    const emailPrefix = normalizedEmail.includes('@')
        ? normalizedEmail.split('@')[0]
        : normalizedEmail;

    const nameParts = normalizedFullName
        .split(/\s+/)
        .map((part) => part.replace(/[^a-z]/g, ''))
        .filter((part) => part.length >= 3);

    const blockedTokens = [
        normalizedFullName.replace(/\s+/g, ''),
        normalizedEmployeeId,
        emailPrefix,
        ...nameParts
    ]
        .map((item) => item.trim())
        .filter((item) => item.length >= 3);

    return blockedTokens.some((token) => normalizedPassword.includes(token));
};

const validatePasswordPolicy = ({ password, fullName = '', employeeId = '', email = '' }) => {
    const errors = [];

    if (!hasRequiredComposition(password)) {
        errors.push(
            'Password must be at least 10 characters long and include at least one number and one symbol.'
        );
    }

    if (containsPersonalInfo({ password, fullName, employeeId, email })) {
        errors.push(
            'Password must not contain personal information such as your name, employee ID, or email username.'
        );
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

module.exports = {
    validatePasswordPolicy
};