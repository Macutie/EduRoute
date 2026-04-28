const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric'
});

const toUtcMidnight = (year, monthIndex, day) => new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));

const addDaysUtc = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const getCurrentUtcDate = () => {
    const now = new Date();
    return toUtcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const getMonthDateRange = ({ month, year } = {}) => {
    const now = new Date();
    const safeYear = Number(year) || now.getUTCFullYear();
    const safeMonth = Number(month) || (now.getUTCMonth() + 1);

    if (!Number.isInteger(safeYear) || safeYear < 2000 || safeYear > 3000) {
        throw new Error('Analytics year is invalid.');
    }

    if (!Number.isInteger(safeMonth) || safeMonth < 1 || safeMonth > 12) {
        throw new Error('Analytics month is invalid.');
    }

    const monthIndex = safeMonth - 1;
    const start = toUtcMidnight(safeYear, monthIndex, 1);
    const end = toUtcMidnight(safeYear, monthIndex + 1, 0);
    const endExclusive = addDaysUtc(end, 1);

    const previousMonthStart = toUtcMidnight(safeYear, monthIndex - 1, 1);
    const previousMonthEnd = toUtcMidnight(safeYear, monthIndex, 0);
    const previousMonthEndExclusive = addDaysUtc(previousMonthEnd, 1);

    const effectiveEnd = endExclusive > getCurrentUtcDate() ? getCurrentUtcDate() : end;
    const currentWeekEnd = effectiveEnd;
    const currentWeekStart = addDaysUtc(currentWeekEnd, -6);
    const currentWeekEndExclusive = addDaysUtc(currentWeekEnd, 1);
    const previousWeekEnd = addDaysUtc(currentWeekStart, -1);
    const previousWeekStart = addDaysUtc(previousWeekEnd, -6);
    const previousWeekEndExclusive = addDaysUtc(previousWeekEnd, 1);

    return {
        month: safeMonth,
        year: safeYear,
        start,
        end,
        endExclusive,
        previousMonthStart,
        previousMonthEnd,
        previousMonthEndExclusive,
        currentWeekStart,
        currentWeekEnd,
        currentWeekEndExclusive,
        previousWeekStart,
        previousWeekEnd,
        previousWeekEndExclusive,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        label: `${MONTH_DAY_FORMATTER.format(start)} - ${MONTH_DAY_FORMATTER.format(end)}`
    };
};

module.exports = {
    addDaysUtc,
    getMonthDateRange
};
