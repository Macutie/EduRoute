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

const parseIsoDate = (value, label) => {
    if (!value) return null;
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`${label} must use YYYY-MM-DD format.`);
    }

    const [year, month, day] = text.split('-').map(Number);
    const parsed = toUtcMidnight(year, month - 1, day);
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw new Error(`${label} is invalid.`);
    }

    return parsed;
};

const buildRangeMetadata = ({ start, end, month, year } = {}) => {
    const endExclusive = addDaysUtc(end, 1);
    const previousPeriodDays = Math.max(1, Math.round((endExclusive - start) / 86400000));
    const previousMonthEnd = addDaysUtc(start, -1);
    const previousMonthStart = addDaysUtc(previousMonthEnd, -(previousPeriodDays - 1));
    const previousMonthEndExclusive = addDaysUtc(previousMonthEnd, 1);
    const effectiveEnd = endExclusive > getCurrentUtcDate() ? getCurrentUtcDate() : end;
    const currentWeekEnd = effectiveEnd;
    const currentWeekStart = addDaysUtc(currentWeekEnd, -6);
    const currentWeekEndExclusive = addDaysUtc(currentWeekEnd, 1);
    const previousWeekEnd = addDaysUtc(currentWeekStart, -1);
    const previousWeekStart = addDaysUtc(previousWeekEnd, -6);
    const previousWeekEndExclusive = addDaysUtc(previousWeekEnd, 1);

    return {
        month,
        year,
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

const getMonthDateRange = ({ month, year, startDate, endDate } = {}) => {
    const customStart = parseIsoDate(startDate, 'Start date');
    const customEnd = parseIsoDate(endDate, 'End date');

    if (customStart || customEnd) {
        if (!customStart || !customEnd) {
            throw new Error('Both start date and end date are required for custom analytics range.');
        }

        if (customStart > customEnd) {
            throw new Error('Start date must be before or equal to end date.');
        }

        return buildRangeMetadata({
            start: customStart,
            end: customEnd,
            month: customStart.getUTCMonth() + 1,
            year: customStart.getUTCFullYear()
        });
    }

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

    return buildRangeMetadata({
        month: safeMonth,
        year: safeYear,
        start,
        end
    });
};

module.exports = {
    addDaysUtc,
    getMonthDateRange
};
