const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

const getReportMonthFromIndex = (monthIndex, baseYear) => {
    const safeIndex = Number(monthIndex) || 1;
    const safeYear = Number(baseYear) || new Date().getUTCFullYear();

    if (!Number.isInteger(safeIndex) || safeIndex < 1 || safeIndex > 12) {
        throw new Error('Report month index is invalid.');
    }

    const monthSequenceIndex = safeIndex - 1;
    const actualMonth = monthSequenceIndex;
    const actualYear = safeYear;

    return {
        monthIndex: safeIndex,
        totalMonths: 12,
        monthName: MONTH_NAMES[monthSequenceIndex],
        actualMonth,
        actualYear
    };
};

const getMonthDateRange = (monthIndex, baseYear) => {
    const reportMonth = getReportMonthFromIndex(monthIndex, baseYear);
    const start = new Date(Date.UTC(reportMonth.actualYear, reportMonth.actualMonth, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(reportMonth.actualYear, reportMonth.actualMonth + 1, 0, 23, 59, 59, 999));
    const endExclusive = new Date(Date.UTC(reportMonth.actualYear, reportMonth.actualMonth + 1, 1, 0, 0, 0, 0));

    return {
        ...reportMonth,
        start,
        end,
        endExclusive,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        title: `Monthly Security Report - ${reportMonth.monthName} ${reportMonth.actualYear}`,
        isFirst: reportMonth.monthIndex === 1,
        isLast: reportMonth.monthIndex === 12
    };
};

module.exports = {
    MONTH_NAMES,
    getReportMonthFromIndex,
    getMonthDateRange
};
