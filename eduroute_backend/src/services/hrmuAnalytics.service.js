const AppError = require('../utils/appError');
const { getMonthDateRange } = require('../utils/dateRange');
const { groupFrequentDestinations } = require('../utils/destinationNormalizer');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuAnalyticsRepository = require('../repositories/hrmuAnalytics.repository');

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const formatHourLabel = (hour, minute = 0) => {
    if (hour === null || hour === undefined || Number.isNaN(Number(hour))) {
        return '--';
    }

    const normalizedHour = Number(hour);
    const normalizedMinute = Number.isFinite(Number(minute)) ? Math.min(Math.max(Number(minute), 0), 59) : 0;
    const hours12 = normalizedHour % 12 || 12;
    const meridiem = normalizedHour >= 12 ? 'PM' : 'AM';

    return `${String(hours12).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')} ${meridiem}`;
};

const getPeakHourLabel = (hour) => {
    const normalizedHour = Number(hour);
    if (!Number.isFinite(normalizedHour)) return 'No peak hour';
    if (normalizedHour < 12) return 'Morning';
    if (normalizedHour < 18) return 'Afternoon';
    return 'Evening';
};

const getPercentChange = (currentValue, previousValue) => {
    const current = Number(currentValue || 0);
    const previous = Number(previousValue || 0);

    if (previous === 0) {
        if (current === 0) {
            return { percent: 0, direction: 'no_change' };
        }

        return { percent: 100, direction: 'increase' };
    }

    const delta = ((current - previous) / previous) * 100;
    const rounded = Number(Math.abs(delta).toFixed(1));

    if (rounded === 0) {
        return { percent: 0, direction: 'no_change' };
    }

    return {
        percent: rounded,
        direction: delta > 0 ? 'increase' : 'decrease'
    };
};

const aggregateDailyMovement = (rows = []) => {
    const weekdayTotals = DAY_LABELS.reduce((accumulator, label) => {
        accumulator[label] = 0;
        return accumulator;
    }, {});

    rows.forEach((row) => {
        const label = row.day_label;
        if (label in weekdayTotals) {
            weekdayTotals[label] += Number(row.locator_slip_count || 0);
        }
    });

    return {
        items: rows.map((row) => ({
            date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
            dayLabel: row.day_label,
            locatorSlipCount: Number(row.locator_slip_count || 0)
        })),
        labels: DAY_LABELS,
        values: DAY_LABELS.map((label) => weekdayTotals[label])
    };
};

const assertAnalyticsAccess = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access HRMU analytics.', 403);
    }

    return user;
};

const buildAnalyticsContext = async (query = {}) => {
    const dateRange = getMonthDateRange({
        month: query.month,
        year: query.year
    });
    const collegeContext = await hrmuAnalyticsRepository.resolveAllowedColleges({
        collegeId: query.collegeId,
        collegeName: query.collegeName
    });

    return {
        dateRange,
        ...collegeContext
    };
};

const getDailyMovement = async (query = {}) => {
    const context = await buildAnalyticsContext(query);
    const rows = await hrmuAnalyticsRepository.getDailyFacultyMovementRows({
        start: context.dateRange.start,
        endExclusive: context.dateRange.endExclusive,
        collegeIds: context.collegeIds
    });

    return {
        dateRange: {
            startDate: context.dateRange.startDate,
            endDate: context.dateRange.endDate,
            label: context.dateRange.label
        },
        selectedCollege: context.selectedCollege?.name || null,
        availableColleges: context.colleges,
        dailyFacultyMovement: aggregateDailyMovement(rows)
    };
};

const getApprovalRate = async (query = {}) => {
    const context = await buildAnalyticsContext(query);
    const counts = await hrmuAnalyticsRepository.getApprovalRateCounts({
        start: context.dateRange.start,
        endExclusive: context.dateRange.endExclusive,
        currentWeekStart: context.dateRange.currentWeekStart,
        currentWeekEndExclusive: context.dateRange.currentWeekEndExclusive,
        previousWeekStart: context.dateRange.previousWeekStart,
        previousWeekEndExclusive: context.dateRange.previousWeekEndExclusive,
        collegeIds: context.collegeIds
    });

    const totalFiledCount = Number(counts.total_filed_count || 0);
    const approvedCount = Number(counts.approved_count || 0);
    const currentWeekTotal = Number(counts.current_week_total_count || 0);
    const currentWeekApproved = Number(counts.current_week_approved_count || 0);
    const previousWeekTotal = Number(counts.previous_week_total_count || 0);
    const previousWeekApproved = Number(counts.previous_week_approved_count || 0);

    const percentage = totalFiledCount ? Number(((approvedCount / totalFiledCount) * 100).toFixed(1)) : 0;
    const currentWeekRate = currentWeekTotal ? (currentWeekApproved / currentWeekTotal) * 100 : 0;
    const previousWeekRate = previousWeekTotal ? (previousWeekApproved / previousWeekTotal) * 100 : 0;
    const weeklyChange = getPercentChange(currentWeekRate, previousWeekRate);

    return {
        dateRange: {
            startDate: context.dateRange.startDate,
            endDate: context.dateRange.endDate,
            label: context.dateRange.label
        },
        selectedCollege: context.selectedCollege?.name || null,
        approvalRate: {
            percentage,
            approvedCount,
            totalFiledCount,
            weeklyChangePercent: weeklyChange.percent,
            weeklyChangeDirection: weeklyChange.direction
        }
    };
};

const getFrequentDestinations = async (query = {}) => {
    const context = await buildAnalyticsContext(query);
    const rows = await hrmuAnalyticsRepository.getFrequentDestinationRows({
        start: context.dateRange.start,
        endExclusive: context.dateRange.endExclusive,
        collegeIds: context.collegeIds
    });

    return {
        dateRange: {
            startDate: context.dateRange.startDate,
            endDate: context.dateRange.endDate,
            label: context.dateRange.label
        },
        selectedCollege: context.selectedCollege?.name || null,
        frequentDestinations: groupFrequentDestinations(rows)
    };
};

const getMonthlySummary = async (query = {}) => {
    const context = await buildAnalyticsContext(query);
    const stats = await hrmuAnalyticsRepository.getMonthlySummaryStats({
        start: context.dateRange.start,
        endExclusive: context.dateRange.endExclusive,
        previousMonthStart: context.dateRange.previousMonthStart,
        previousMonthEndExclusive: context.dateRange.previousMonthEndExclusive,
        collegeIds: context.collegeIds
    });

    const totalTripsCompleted = Number(stats.total_trips_completed || 0);
    const previousMonthTrips = Number(stats.previous_month_completed_trips || 0);
    const uniqueUsersCompletedTrips = Number(stats.unique_users_completed_trips || 0);
    const totalEligibleFaculty = Number(stats.total_eligible_faculty || 0);
    const engagementRatePercent = totalEligibleFaculty
        ? Number(((uniqueUsersCompletedTrips / totalEligibleFaculty) * 100).toFixed(1))
        : 0;
    const tripsChange = getPercentChange(totalTripsCompleted, previousMonthTrips);

    return {
        dateRange: {
            startDate: context.dateRange.startDate,
            endDate: context.dateRange.endDate,
            label: context.dateRange.label
        },
        selectedCollege: context.selectedCollege?.name || null,
        monthlyPerformanceSummary: {
            totalTripsCompleted,
            tripsMonthOverMonthPercent: tripsChange.percent,
            tripsMonthOverMonthDirection: tripsChange.direction,
            averageDistanceKm: Number(stats.average_distance_km || 0),
            averageDistanceLabel: 'Optimized',
            uniqueUsersCompletedTrips,
            engagementRatePercent,
            totalEligibleFaculty,
            peakHour: formatHourLabel(stats.peak_hour, stats.avg_minute),
            peakHourLabel: getPeakHourLabel(stats.peak_hour)
        }
    };
};

const getOverview = async (query = {}) => {
    const context = await buildAnalyticsContext(query);
    const [dailyRows, approvalCounts, frequentDestinationRows, monthlyStats] = await Promise.all([
        hrmuAnalyticsRepository.getDailyFacultyMovementRows({
            start: context.dateRange.start,
            endExclusive: context.dateRange.endExclusive,
            collegeIds: context.collegeIds
        }),
        hrmuAnalyticsRepository.getApprovalRateCounts({
            start: context.dateRange.start,
            endExclusive: context.dateRange.endExclusive,
            currentWeekStart: context.dateRange.currentWeekStart,
            currentWeekEndExclusive: context.dateRange.currentWeekEndExclusive,
            previousWeekStart: context.dateRange.previousWeekStart,
            previousWeekEndExclusive: context.dateRange.previousWeekEndExclusive,
            collegeIds: context.collegeIds
        }),
        hrmuAnalyticsRepository.getFrequentDestinationRows({
            start: context.dateRange.start,
            endExclusive: context.dateRange.endExclusive,
            collegeIds: context.collegeIds
        }),
        hrmuAnalyticsRepository.getMonthlySummaryStats({
            start: context.dateRange.start,
            endExclusive: context.dateRange.endExclusive,
            previousMonthStart: context.dateRange.previousMonthStart,
            previousMonthEndExclusive: context.dateRange.previousMonthEndExclusive,
            collegeIds: context.collegeIds
        })
    ]);

    const dailyFacultyMovement = aggregateDailyMovement(dailyRows);

    const totalFiledCount = Number(approvalCounts.total_filed_count || 0);
    const approvedCount = Number(approvalCounts.approved_count || 0);
    const currentWeekTotal = Number(approvalCounts.current_week_total_count || 0);
    const currentWeekApproved = Number(approvalCounts.current_week_approved_count || 0);
    const previousWeekTotal = Number(approvalCounts.previous_week_total_count || 0);
    const previousWeekApproved = Number(approvalCounts.previous_week_approved_count || 0);
    const percentage = totalFiledCount ? Number(((approvedCount / totalFiledCount) * 100).toFixed(1)) : 0;
    const currentWeekRate = currentWeekTotal ? (currentWeekApproved / currentWeekTotal) * 100 : 0;
    const previousWeekRate = previousWeekTotal ? (previousWeekApproved / previousWeekTotal) * 100 : 0;
    const weeklyChange = getPercentChange(currentWeekRate, previousWeekRate);

    const frequentDestinations = groupFrequentDestinations(frequentDestinationRows);

    const totalTripsCompleted = Number(monthlyStats.total_trips_completed || 0);
    const previousMonthTrips = Number(monthlyStats.previous_month_completed_trips || 0);
    const uniqueUsersCompletedTrips = Number(monthlyStats.unique_users_completed_trips || 0);
    const totalEligibleFaculty = Number(monthlyStats.total_eligible_faculty || 0);
    const engagementRatePercent = totalEligibleFaculty
        ? Number(((uniqueUsersCompletedTrips / totalEligibleFaculty) * 100).toFixed(1))
        : 0;
    const tripsChange = getPercentChange(totalTripsCompleted, previousMonthTrips);

    return {
        dateRange: {
            startDate: context.dateRange.startDate,
            endDate: context.dateRange.endDate,
            label: context.dateRange.label
        },
        selectedCollege: context.selectedCollege?.name || null,
        availableColleges: context.colleges,
        dailyFacultyMovement,
        approvalRate: {
            percentage,
            approvedCount,
            totalFiledCount,
            weeklyChangePercent: weeklyChange.percent,
            weeklyChangeDirection: weeklyChange.direction
        },
        frequentDestinations,
        monthlyPerformanceSummary: {
            totalTripsCompleted,
            tripsMonthOverMonthPercent: tripsChange.percent,
            tripsMonthOverMonthDirection: tripsChange.direction,
            averageDistanceKm: Number(monthlyStats.average_distance_km || 0),
            averageDistanceLabel: 'Optimized',
            uniqueUsersCompletedTrips,
            engagementRatePercent,
            totalEligibleFaculty,
            peakHour: formatHourLabel(monthlyStats.peak_hour, monthlyStats.avg_minute),
            peakHourLabel: getPeakHourLabel(monthlyStats.peak_hour)
        }
    };
};

const getExportPlaceholder = async (userId, format) => {
    await assertAnalyticsAccess(userId);

    return {
        message: `${format.toUpperCase()} export is not implemented yet.`,
        status: 'not_implemented'
    };
};

module.exports = {
    assertAnalyticsAccess,
    buildAnalyticsContext,
    getOverview,
    getDailyMovement,
    getApprovalRate,
    getFrequentDestinations,
    getMonthlySummary,
    getExportPlaceholder
};
