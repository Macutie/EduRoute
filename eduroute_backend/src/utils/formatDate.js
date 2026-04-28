const formatTimestampLabel = (value) => {
    if (!value) return '--';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

module.exports = {
    formatTimestampLabel
};
