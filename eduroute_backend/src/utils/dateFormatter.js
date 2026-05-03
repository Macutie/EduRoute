const pad = (value) => String(value).padStart(2, '0');

const formatDateTime = (value) => {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const manilaString = date.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    // manilaString is like "05/03/2026, 03:35 PM"
    return manilaString.replace(',', '');
};

module.exports = {
    formatDateTime
};
