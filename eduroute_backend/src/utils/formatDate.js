const formatTimestampLabel = (value) => {
    if (!value) return '--';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

module.exports = {
    formatTimestampLabel
};
