const pad = (value) => String(value).padStart(2, '0');

const formatDateTime = (value) => {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const year = date.getFullYear();
    const hours24 = date.getHours();
    const hours12 = hours24 % 12 || 12;
    const minutes = pad(date.getMinutes());
    const meridiem = hours24 >= 12 ? 'PM' : 'AM';

    return `${month}/${day}/${year} ${pad(hours12)}:${minutes} ${meridiem}`;
};

module.exports = {
    formatDateTime
};
