const AppError = require('../utils/appError');
const { getMonthDateRange } = require('../utils/dateRange');
const { groupFrequentDestinations } = require('../utils/destinationNormalizer');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuAnalyticsRepository = require('../repositories/hrmuAnalytics.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { buildHrmuAnalyticsReportPdf } = require('../utils/simplePdf');

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const CAMPUS_COORDINATE = {
    lat: 14.8386,
    lng: 120.2842
};
const ACTIVE_TRIP_STATUSES = new Set(['active', 'arrived', 'returning']);
const FAR_FROM_CAMPUS_KM = 1;
const UNUSUALLY_LONG_ACTIVE_HOURS = 8;
const ROUTE_DEVIATION_THRESHOLD_KM = 0.25;
const LATE_RETURN_WARNING_MINUTES = 45;

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

const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getHoursBetween = (left, right) => {
    if (!left || !right) return 0;
    return Math.max((right.getTime() - left.getTime()) / 36e5, 0);
};

const getMinutesBetween = (left, right) => {
    if (!left || !right) return 0;
    return Math.max((right.getTime() - left.getTime()) / 60000, 0);
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const getDistanceKm = (from, to) => {
    const fromLat = Number(from?.lat);
    const fromLng = Number(from?.lng);
    const toLat = Number(to?.lat);
    const toLng = Number(to?.lng);

    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        return null;
    }

    const earthRadiusKm = 6371;
    const latDelta = toRadians(toLat - fromLat);
    const lngDelta = toRadians(toLng - fromLng);
    const startLat = toRadians(fromLat);
    const endLat = toRadians(toLat);
    const a = Math.sin(latDelta / 2) ** 2
        + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;

    return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

const getRiskLevel = (score) => {
    if (score >= 60) return 'High';
    if (score >= 30) return 'Medium';
    return 'Low';
};

const normalizeRouteCoordinates = (routeGeometry) => {
    if (!routeGeometry) return [];

    const geometry = typeof routeGeometry === 'string'
        ? (() => {
            try {
                return JSON.parse(routeGeometry);
            } catch (error) {
                return null;
            }
        })()
        : routeGeometry;

    const coordinates = Array.isArray(geometry?.coordinates)
        ? geometry.coordinates
        : Array.isArray(geometry)
            ? geometry
            : [];

    return coordinates
        .map((coordinate) => {
            if (Array.isArray(coordinate)) {
                return { lng: Number(coordinate[0]), lat: Number(coordinate[1]) };
            }

            return {
                lng: Number(coordinate?.lng ?? coordinate?.longitude),
                lat: Number(coordinate?.lat ?? coordinate?.latitude)
            };
        })
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
};

const getPointToSegmentDistanceKm = (point, segmentStart, segmentEnd) => {
    const pointLat = Number(point?.lat);
    const pointLng = Number(point?.lng);
    const startLat = Number(segmentStart?.lat);
    const startLng = Number(segmentStart?.lng);
    const endLat = Number(segmentEnd?.lat);
    const endLng = Number(segmentEnd?.lng);

    if (![pointLat, pointLng, startLat, startLng, endLat, endLng].every(Number.isFinite)) {
        return null;
    }

    const latScaleKm = 111.32;
    const lngScaleKm = 111.32 * Math.cos(toRadians((startLat + endLat) / 2));
    const px = (pointLng - startLng) * lngScaleKm;
    const py = (pointLat - startLat) * latScaleKm;
    const vx = (endLng - startLng) * lngScaleKm;
    const vy = (endLat - startLat) * latScaleKm;
    const segmentLengthSquared = vx * vx + vy * vy;

    if (segmentLengthSquared === 0) {
        return getDistanceKm(point, segmentStart);
    }

    const projection = Math.max(0, Math.min(1, ((px * vx) + (py * vy)) / segmentLengthSquared));
    const closest = {
        lng: startLng + ((endLng - startLng) * projection),
        lat: startLat + ((endLat - startLat) * projection)
    };

    return getDistanceKm(point, closest);
};

const getDistanceFromRouteKm = (point, plannedRoute = []) => {
    if (!plannedRoute.length) return null;
    if (plannedRoute.length === 1) return getDistanceKm(point, plannedRoute[0]);

    const distances = [];
    for (let index = 1; index < plannedRoute.length; index += 1) {
        const distance = getPointToSegmentDistanceKm(point, plannedRoute[index - 1], plannedRoute[index]);
        if (distance !== null) {
            distances.push(distance);
        }
    }

    return distances.length ? Math.min(...distances) : null;
};

const normalizeActualPath = (row) => {
    if (!Array.isArray(row?.actual_path)) return [];

    return row.actual_path
        .map((point) => ({
            lat: Number(point.lat),
            lng: Number(point.lng),
            recordedAt: point.recordedAt || point.recorded_at || null
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
};

const buildLateReturnPredictions = (riskRows = [], now = new Date()) => riskRows
    .filter((row) => ACTIVE_TRIP_STATUSES.has(String(row.tripStatus || '').toLowerCase()))
    .map((row) => {
        const expectedReturn = toDate(row.expectedReturnTime);
        const startedAt = toDate(row.startedAt);
        const minutesUntilReturn = expectedReturn ? (expectedReturn.getTime() - now.getTime()) / 60000 : null;
        let probability = row.lateReturn ? 95 : Math.min(Math.max(Number(row.riskScore || 0), 0), 90);
        const reasons = [...(row.reasons || [])];

        if (minutesUntilReturn !== null && minutesUntilReturn >= 0 && minutesUntilReturn <= LATE_RETURN_WARNING_MINUTES) {
            probability += 25;
            reasons.push(`Expected return is within ${LATE_RETURN_WARNING_MINUTES} minutes`);
        }

        if (startedAt && expectedReturn && now > startedAt) {
            const tripWindowMinutes = Math.max((expectedReturn.getTime() - startedAt.getTime()) / 60000, 1);
            const elapsedRatio = Math.min(getMinutesBetween(startedAt, now) / tripWindowMinutes, 2);
            probability += elapsedRatio > 0.8 ? 15 : 0;
        }

        probability = Math.min(Math.round(probability), 100);

        return {
            ...row,
            minutesUntilReturn: minutesUntilReturn === null ? null : Math.round(minutesUntilReturn),
            predictionScore: probability,
            predictionLevel: probability >= 70 ? 'High' : probability >= 40 ? 'Medium' : 'Low',
            predictionReasons: Array.from(new Set(reasons)).slice(0, 4)
        };
    })
    .filter((row) => row.predictionScore >= 35)
    .sort((left, right) => right.predictionScore - left.predictionScore);

const buildRouteDeviationDetections = (tripRows = []) => tripRows
    .map((row) => {
        const plannedRoute = normalizeRouteCoordinates(row.route_geometry);
        const plannedFallback = plannedRoute.length
            ? plannedRoute
            : [
                { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
                { lat: Number(row.destination_lat), lng: Number(row.destination_lng) }
            ].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
        const actualPath = normalizeActualPath(row);

        if (plannedFallback.length < 2 || actualPath.length < 2) {
            return null;
        }

        const deviations = actualPath
            .map((point) => getDistanceFromRouteKm(point, plannedFallback))
            .filter((distance) => distance !== null);
        const maxDeviationKm = deviations.length ? Math.max(...deviations) : 0;
        const deviatedPoints = deviations.filter((distance) => distance > ROUTE_DEVIATION_THRESHOLD_KM).length;

        return {
            tripId: row.trip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            destination: row.destination || row.destination_name || 'Unknown destination',
            savedPoints: Number(row.saved_gps_points || actualPath.length || 0),
            maxDeviationKm: Number(maxDeviationKm.toFixed(2)),
            deviatedPoints,
            status: maxDeviationKm > ROUTE_DEVIATION_THRESHOLD_KM ? 'Deviated' : 'On route',
            severity: maxDeviationKm > 0.75 ? 'high' : maxDeviationKm > ROUTE_DEVIATION_THRESHOLD_KM ? 'medium' : 'low'
        };
    })
    .filter(Boolean)
    .sort((left, right) => right.maxDeviationKm - left.maxDeviationKm);

const buildPeakMovementHeatmap = (rows = []) => {
    const labels = DAY_LABELS;
    const buckets = [
        { key: '7-9', label: '07 AM - 09 AM', startHour: 7, endHour: 9 },
        { key: '9-11', label: '09 AM - 11 AM', startHour: 9, endHour: 11 },
        { key: '11-13', label: '11 AM - 01 PM', startHour: 11, endHour: 13 },
        { key: '13-15', label: '01 PM - 03 PM', startHour: 13, endHour: 15 },
        { key: '15-17', label: '03 PM - 05 PM', startHour: 15, endHour: 17 },
        { key: '17-19', label: '05 PM - 07 PM', startHour: 17, endHour: 19 },
        { key: '19-22', label: '07 PM - 09 PM', startHour: 19, endHour: 22 }
    ];
    const matrix = labels.map((dayLabel) => ({
        dayLabel,
        buckets: buckets.map((bucket) => ({
            ...bucket,
            count: rows
                .filter((row) => String(row.day_label || '').trim() === dayLabel && Number(row.hour) >= bucket.startHour && Number(row.hour) < bucket.endHour)
                .reduce((sum, row) => sum + Number(row.movement_count || 0), 0)
        }))
    }));
    const flat = matrix.flatMap((day) => day.buckets.map((bucket) => ({
        dayLabel: day.dayLabel,
        bucketLabel: bucket.label,
        count: bucket.count
    })));
    const peak = flat.sort((left, right) => right.count - left.count)[0] || null;

    return {
        labels,
        buckets,
        matrix,
        peak,
        maxCount: Math.max(...flat.map((row) => row.count), 0)
    };
};

const buildRepeatIncidents = (incidents = []) => {
    const groups = new Map();

    incidents.forEach((incident) => {
        const facultyKey = `faculty|${String(incident.facultyName || 'Unknown faculty').toLowerCase()}|${String(incident.type || 'Incident').toLowerCase()}`;
        const collegeKey = `college|${String(incident.collegeName || 'Unknown college').toLowerCase()}|${String(incident.type || 'Incident').toLowerCase()}`;

        [facultyKey, collegeKey].forEach((key) => {
            const [scope, , type] = key.split('|');
            const current = groups.get(key) || {
                scope,
                name: scope === 'faculty' ? incident.facultyName || 'Unknown faculty' : incident.collegeName || 'Unknown college',
                type: incident.type || 'Incident',
                count: 0,
                destinations: new Set()
            };
            current.count += 1;
            if (incident.destination) current.destinations.add(incident.destination);
            current.type = incident.type || type;
            groups.set(key, current);
        });
    });

    return Array.from(groups.values())
        .filter((group) => group.count > 1)
        .map((group) => ({
            ...group,
            destinations: Array.from(group.destinations).slice(0, 3)
        }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
};

const buildCollegeRiskScores = (collegeSummary = [], incidents = []) => collegeSummary
    .map((college) => {
        const collegeIncidents = incidents.filter((incident) => incident.collegeName === college.collegeName);
        const trackingGaps = collegeIncidents.filter((incident) => String(incident.type || '').toLowerCase().includes('tracking')).length;
        const missingProof = collegeIncidents.filter((incident) => String(incident.type || '').toLowerCase().includes('proof')).length;
        const lateReturns = Number(college.lateReturnCount || 0) + collegeIncidents.filter((incident) => String(incident.type || '').toLowerCase().includes('late')).length;
        const rejectedSlips = Number(college.rejectedSlipCount || 0);
        const riskScore = Math.min((lateReturns * 30) + (rejectedSlips * 20) + (trackingGaps * 15) + (missingProof * 10), 100);

        return {
            collegeId: college.collegeId,
            collegeName: college.collegeName,
            lateReturns,
            rejectedSlips,
            trackingGaps,
            missingProof,
            riskScore,
            riskLevel: getRiskLevel(riskScore)
        };
    })
    .sort((left, right) => right.riskScore - left.riskScore || left.collegeName.localeCompare(right.collegeName));

const buildTrendComparison = (collegeSummary = []) => collegeSummary.map((college) => {
    const currentTrips = Number(college.tripCount || 0);
    const previousTrips = Number(college.previousTripCount || 0);
    const change = getPercentChange(currentTrips, previousTrips);

    return {
        collegeId: college.collegeId,
        collegeName: college.collegeName,
        currentTrips,
        previousTrips,
        changePercent: change.percent,
        direction: change.direction
    };
});

const buildRecommendations = ({ summary, lateReturnPredictions, repeatIncidents, routeDeviationDetections, collegeRiskScores }) => {
    const recommendations = [];

    if (summary.missingProof > 0) {
        recommendations.push('Follow up with faculty who still have missing proof after 24 hours.');
    }

    if (lateReturnPredictions.length) {
        recommendations.push(`Monitor ${lateReturnPredictions[0].facultyName} because their active trip has the highest late-return probability.`);
    }

    const deviatedTrip = routeDeviationDetections.find((row) => row.status === 'Deviated');
    if (deviatedTrip) {
        recommendations.push(`Review route deviation for ${deviatedTrip.facultyName} before closing the trip record.`);
    }

    if (repeatIncidents.length) {
        recommendations.push(`Check recurring ${repeatIncidents[0].type.toLowerCase()} signals for ${repeatIncidents[0].name}.`);
    }

    const riskiestCollege = collegeRiskScores[0];
    if (riskiestCollege && riskiestCollege.riskScore > 0) {
        recommendations.push(`Prioritize ${riskiestCollege.collegeName} for HRMU follow-up because it has the highest current risk score.`);
    }

    if (!recommendations.length) {
        recommendations.push('No urgent follow-up is required for this period; continue regular monitoring.');
    }

    return recommendations;
};

const buildMonthlyInsightText = ({ summary, mostVisitedDestination, collegeWithMostTrips, collegeRiskScores, peakMovementHeatmap }) => {
    const topCollege = collegeWithMostTrips?.collegeName || 'No college';
    const destination = mostVisitedDestination?.label || 'no dominant destination';
    const riskiestCollege = collegeRiskScores.find((college) => college.riskScore > 0);
    const peakText = peakMovementHeatmap?.peak?.count
        ? `${peakMovementHeatmap.peak.dayLabel} ${peakMovementHeatmap.peak.bucketLabel}`
        : 'no clear peak period';
    const riskText = riskiestCollege
        ? `${riskiestCollege.collegeName} currently has the highest risk score because of late returns, rejected slips, or tracking gaps.`
        : 'No college shows a concentrated risk pattern this period.';

    return `${topCollege} had the highest trip activity this month, with frequent movement toward ${destination}. The busiest movement window was ${peakText}. ${riskText} HRMU should use the prediction and incident panels to decide which trips need early follow-up before they become late or incomplete records.`;
};

const hasSubmittedProof = (row) => Boolean(row.proof_id);

const hasArrivalVerification = (row) => Boolean(row.location_verification_id || row.arrival_verified_at);

const mapRiskTrip = (row, now = new Date()) => {
    const tripStatus = String(row.trip_status || '').toLowerCase();
    const startedAt = toDate(row.started_at);
    const expectedReturnTime = toDate(row.expected_return_datetime);
    const lastLocationAt = toDate(row.last_location_at);
    const currentLocation = {
        lat: row.current_lat,
        lng: row.current_lng
    };
    const distanceFromCampusKm = getDistanceKm(currentLocation, CAMPUS_COORDINATE);
    const reasons = [];
    let riskScore = 0;

    if (expectedReturnTime && now > expectedReturnTime && tripStatus !== 'completed') {
        riskScore += 40;
        reasons.push('Past expected return time');
    }

    const minutesUntilExpectedReturn = expectedReturnTime
        ? (expectedReturnTime.getTime() - now.getTime()) / 60000
        : null;

    if (
        minutesUntilExpectedReturn !== null
        && minutesUntilExpectedReturn >= 0
        && minutesUntilExpectedReturn <= 30
        && distanceFromCampusKm !== null
        && distanceFromCampusKm > FAR_FROM_CAMPUS_KM
    ) {
        riskScore += 30;
        reasons.push('Less than 30 minutes before return while still away from campus');
    }

    const minutesSinceLastLocation = lastLocationAt ? getMinutesBetween(lastLocationAt, now) : null;
    if (minutesSinceLastLocation !== null && minutesSinceLastLocation > 30) {
        riskScore += 40;
        reasons.push('Last location update is older than 30 minutes');
    } else if (minutesSinceLastLocation !== null && minutesSinceLastLocation > 15) {
        riskScore += 25;
        reasons.push('Last location update is older than 15 minutes');
    } else if (!lastLocationAt && startedAt && getMinutesBetween(startedAt, now) > 15) {
        riskScore += 25;
        reasons.push('No live location update after trip start');
    }

    if (['arrived', 'completed'].includes(tripStatus) && !hasSubmittedProof(row)) {
        riskScore += 20;
        reasons.push('Proof of compliance is missing after arrival');
    }

    if (Number(row.previous_late_return_count || 0) >= 2) {
        riskScore += 20;
        reasons.push('Faculty has two or more previous late returns');
    }

    if (startedAt && ACTIVE_TRIP_STATUSES.has(tripStatus) && getHoursBetween(startedAt, now) > UNUSUALLY_LONG_ACTIVE_HOURS) {
        riskScore += 20;
        reasons.push('Trip has been active for an unusually long duration');
    }

    return {
        tripId: row.trip_id,
        locatorSlipId: row.locator_slip_id,
        facultyUserId: row.faculty_user_id,
        facultyName: row.faculty_name,
        employeeId: row.employee_id,
        collegeName: row.college_name,
        department: row.college_name,
        destination: row.destination || row.destination_name || 'Unknown destination',
        purpose: row.purpose || 'Official travel',
        tripStatus: row.trip_status || 'unknown',
        expectedReturnTime: expectedReturnTime ? expectedReturnTime.toISOString() : null,
        startedAt: startedAt ? startedAt.toISOString() : null,
        lastLocationAt: lastLocationAt ? lastLocationAt.toISOString() : null,
        distanceFromCampusKm,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        reasons,
        missingProof: ['arrived', 'completed'].includes(tripStatus) && !hasSubmittedProof(row),
        missingArrivalVerification: tripStatus === 'arrived' && !hasArrivalVerification(row),
        disconnectedTracking: reasons.some((reason) => reason.includes('location')),
        lateReturn: expectedReturnTime ? now > expectedReturnTime && tripStatus !== 'completed' : false
    };
};

const getMostVisitedDestination = (frequentDestinations = []) => frequentDestinations[0] || null;

const getCollegeWithMostTrips = (collegeSummary = []) => (
    collegeSummary.find((row) => Number(row.tripCount || 0) > 0)
    || collegeSummary.find((row) => Number(row.locatorSlipCount || 0) > 0)
    || null
);

const buildSmartSummaryText = ({ summary, mostVisitedDestination, collegeWithMostTrips }) => {
    const destinationText = mostVisitedDestination?.label || 'no dominant destination yet';
    const collegeText = collegeWithMostTrips?.collegeName || 'no single college';

    return `For this month, EduRoute recorded ${summary.totalTripsThisMonth} official faculty trips. ${collegeText} had the highest number of trips. The most visited destination was ${destinationText}. The system detected ${summary.lateReturns} late returns, ${summary.disconnectedTracking} disconnected tracking cases, and ${summary.missingProof} missing proof submissions. There are currently ${summary.highRiskTrips} high-risk active trips that may require HRMU attention.`;
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
        year: query.year,
        startDate: query.startDate,
        endDate: query.endDate
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
    const [dailyRows, approvalCounts, frequentDestinationRows, monthlyStats, smartAnalyticsResult] = await Promise.all([
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
        }),
        getSmartAnalytics(query, { context }).then(
            (smartAnalytics) => ({ smartAnalytics, smartAnalyticsWarning: null }),
            (error) => ({ smartAnalytics: null, smartAnalyticsWarning: error.message || 'Smart analytics could not be loaded.' })
        )
    ]);
    const smartAnalytics = smartAnalyticsResult.smartAnalytics;
    const smartAnalyticsWarning = smartAnalyticsResult.smartAnalyticsWarning;

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
        },
        smartAnalytics,
        smartAnalyticsWarning
    };
};

const buildSmartAnalytics = async (query = {}, { context = null, persist = false } = {}) => {
    const analyticsContext = context || await buildAnalyticsContext(query);
    const [tripRows, locatorSlipCounts, frequentDestinationRows, collegeRows, peakMovementRows] = await Promise.all([
        hrmuAnalyticsRepository.getSmartTripRows({
            start: analyticsContext.dateRange.start,
            endExclusive: analyticsContext.dateRange.endExclusive,
            collegeIds: analyticsContext.collegeIds
        }),
        hrmuAnalyticsRepository.getSmartLocatorSlipCounts({
            start: analyticsContext.dateRange.start,
            endExclusive: analyticsContext.dateRange.endExclusive,
            collegeIds: analyticsContext.collegeIds
        }),
        hrmuAnalyticsRepository.getFrequentDestinationRows({
            start: analyticsContext.dateRange.start,
            endExclusive: analyticsContext.dateRange.endExclusive,
            collegeIds: analyticsContext.collegeIds
        }),
        hrmuAnalyticsRepository.getSmartCollegeSummaryRows({
            start: analyticsContext.dateRange.start,
            endExclusive: analyticsContext.dateRange.endExclusive,
            collegeIds: analyticsContext.collegeIds
        }),
        hrmuAnalyticsRepository.getPeakMovementRows({
            start: analyticsContext.dateRange.start,
            endExclusive: analyticsContext.dateRange.endExclusive,
            collegeIds: analyticsContext.collegeIds
        })
    ]);
    const now = new Date();
    const risks = tripRows
        .filter((row) => ACTIVE_TRIP_STATUSES.has(String(row.trip_status || '').toLowerCase()))
        .map((row) => mapRiskTrip(row, now))
        .sort((left, right) => right.riskScore - left.riskScore || String(left.facultyName).localeCompare(String(right.facultyName)));
    const missingProofTrips = tripRows.filter((row) => ['arrived', 'completed'].includes(String(row.trip_status || '').toLowerCase()) && !hasSubmittedProof(row));
    const lateReturns = tripRows.filter((row) => {
        const status = String(row.trip_status || '').toLowerCase();
        if (ACTIVE_TRIP_STATUSES.has(status)) {
            return false;
        }

        const expectedReturn = toDate(row.expected_return_datetime);
        const actualReturn = toDate(row.ended_at || row.returned_at || row.trip_updated_at);
        return expectedReturn && actualReturn && actualReturn > expectedReturn;
    });
    const activeLateReturns = risks.filter((row) => row.lateReturn);
    const disconnectedTracking = risks.filter((row) => row.disconnectedTracking);
    const missingArrivalVerification = risks.filter((row) => row.missingArrivalVerification);
    const frequentDestinations = groupFrequentDestinations(frequentDestinationRows);
    const collegeSummary = collegeRows.map((row) => ({
        collegeId: row.college_id,
        collegeName: row.college_name,
        locatorSlipCount: Number(row.locator_slip_count || 0),
        rejectedSlipCount: Number(row.rejected_slip_count || 0),
        previousLocatorSlipCount: Number(row.previous_locator_slip_count || 0),
        tripCount: Number(row.trip_count || 0),
        previousTripCount: Number(row.previous_trip_count || 0),
        activeTripCount: Number(row.active_trip_count || 0),
        completedTripCount: Number(row.completed_trip_count || 0),
        lateReturnCount: Number(row.late_return_count || 0)
    }));
    const mostVisitedDestination = getMostVisitedDestination(frequentDestinations);
    const collegeWithMostTrips = getCollegeWithMostTrips(collegeSummary);
    const highRiskTrips = risks.filter((row) => row.riskLevel === 'High');
    const incidents = [
        ...activeLateReturns.map((row) => ({
            tripId: row.tripId,
            facultyName: row.facultyName,
            collegeName: row.collegeName,
            destination: row.destination,
            type: 'Late Return',
            severity: 'high',
            status: 'active',
            detectedAt: now.toISOString(),
            description: 'Trip is past the expected return time and has not been completed.'
        })),
        ...disconnectedTracking.map((row) => ({
            tripId: row.tripId,
            facultyName: row.facultyName,
            collegeName: row.collegeName,
            destination: row.destination,
            type: 'Disconnected Tracking',
            severity: row.riskScore >= 60 ? 'high' : 'medium',
            status: 'active',
            detectedAt: now.toISOString(),
            description: 'Live location updates are stale or unavailable.'
        })),
        ...missingProofTrips.map((row) => ({
            tripId: row.trip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            destination: row.destination || row.destination_name || 'Unknown destination',
            type: 'Missing Proof',
            severity: 'medium',
            status: 'active',
            detectedAt: now.toISOString(),
            description: 'Trip reached arrival/completion flow without a proof of compliance record.'
        })),
        ...missingArrivalVerification.map((row) => ({
            tripId: row.tripId,
            facultyName: row.facultyName,
            collegeName: row.collegeName,
            destination: row.destination,
            type: 'Unverified Arrival',
            severity: 'medium',
            status: 'active',
            detectedAt: now.toISOString(),
            description: 'Trip is marked arrived but still lacks HRMU arrival verification.'
        }))
    ];
    const lateReturnPredictions = buildLateReturnPredictions(risks, now);
    const routeDeviationDetections = buildRouteDeviationDetections(tripRows);
    const repeatIncidents = buildRepeatIncidents(incidents);
    const peakMovementHeatmap = buildPeakMovementHeatmap(peakMovementRows);
    const collegeRiskScores = buildCollegeRiskScores(collegeSummary, incidents);
    const trendComparison = buildTrendComparison(collegeSummary);
    const summary = {
        totalTripsThisMonth: tripRows.length,
        activeTrips: risks.length,
        completedTrips: tripRows.filter((row) => String(row.trip_status || '').toLowerCase() === 'completed').length,
        lateReturns: lateReturns.length + activeLateReturns.length,
        disconnectedTracking: disconnectedTracking.length,
        missingProof: missingProofTrips.length,
        missingArrivalVerification: missingArrivalVerification.length,
        highRiskTrips: highRiskTrips.length,
        totalFiled: Number(locatorSlipCounts.total_filed || 0),
        approvedCount: Number(locatorSlipCounts.approved_count || 0),
        rejectedCount: Number(locatorSlipCounts.rejected_count || 0),
        cancelledCount: Number(locatorSlipCounts.cancelled_count || 0),
        mostVisitedDestination: mostVisitedDestination?.label || null,
        collegeWithMostTrips: collegeWithMostTrips?.collegeName || null,
        predictedLateReturns: lateReturnPredictions.length,
        routeDeviations: routeDeviationDetections.filter((row) => row.status === 'Deviated').length,
        repeatIncidentGroups: repeatIncidents.length,
        riskiestCollege: collegeRiskScores[0]?.collegeName || null,
        peakMovementWindow: peakMovementHeatmap.peak?.count
            ? `${peakMovementHeatmap.peak.dayLabel} ${peakMovementHeatmap.peak.bucketLabel}`
            : null
    };

    const baseSummary = buildSmartSummaryText({
        summary,
        mostVisitedDestination,
        collegeWithMostTrips
    });
    const monthlyInsights = buildMonthlyInsightText({
        summary,
        mostVisitedDestination,
        collegeWithMostTrips,
        collegeRiskScores,
        peakMovementHeatmap
    });
    const recommendations = buildRecommendations({
        summary,
        lateReturnPredictions,
        repeatIncidents,
        routeDeviationDetections,
        collegeRiskScores
    });
    const generatedSummary = `${baseSummary} ${monthlyInsights}`;
    const exportSummary = [
        monthlyInsights,
        `Prediction signals: ${lateReturnPredictions.length} possible late returns, ${summary.routeDeviations} route deviations, and ${repeatIncidents.length} repeat incident groups.`,
        `Recommended action: ${recommendations[0]}`
    ].join(' ');

    if (persist) {
        await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
        await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
        await hrmuAnalyticsRepository.upsertTripAnalyticsRows(risks).catch(() => []);
    }

    return {
        dateRange: {
            startDate: analyticsContext.dateRange.startDate,
            endDate: analyticsContext.dateRange.endDate,
            label: analyticsContext.dateRange.label
        },
        selectedCollege: analyticsContext.selectedCollege?.name || null,
        generatedAt: now.toISOString(),
        summary: {
            ...summary,
            generatedSummary,
            monthlyInsights,
            exportSummary
        },
        activeTripSummary: {
            lowRisk: risks.filter((row) => row.riskLevel === 'Low').length,
            mediumRisk: risks.filter((row) => row.riskLevel === 'Medium').length,
            highRisk: highRiskTrips.length
        },
        highRiskTrips: risks,
        incidents,
        lateReturnPredictions,
        routeDeviationDetections,
        repeatIncidents,
        peakMovementHeatmap,
        collegeRiskScores,
        trendComparison,
        recommendations,
        monthlyInsights,
        exportSummary,
        frequentDestinations,
        collegeSummary,
        generatedSummary
    };
};

const getSmartAnalytics = async (query = {}, options = {}) => buildSmartAnalytics(query, options);

const getSmartSummary = async (query = {}) => {
    const analytics = await buildSmartAnalytics(query);
    return {
        dateRange: analytics.dateRange,
        selectedCollege: analytics.selectedCollege,
        ...analytics.summary,
        generatedSummary: analytics.generatedSummary
    };
};

const getSmartRiskTrips = async (query = {}) => {
    const analytics = await buildSmartAnalytics(query);
    return {
        dateRange: analytics.dateRange,
        selectedCollege: analytics.selectedCollege,
        riskTrips: analytics.highRiskTrips
    };
};

const getSmartIncidents = async (query = {}) => {
    const analytics = await buildSmartAnalytics(query);
    const persistedIncidents = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const rangeStart = toDate(analytics.dateRange?.start);
    const rangeEndExclusive = toDate(analytics.dateRange?.endExclusive);

    return {
        dateRange: analytics.dateRange,
        selectedCollege: analytics.selectedCollege,
        incidents: [
            ...analytics.incidents,
            ...persistedIncidents
                .filter((row) => {
                    const detectedAt = toDate(row.latest_detected_at);
                    return detectedAt && rangeStart && rangeEndExclusive
                        ? detectedAt >= rangeStart && detectedAt < rangeEndExclusive
                        : true;
                })
                .map((row) => ({
                    tripId: row.trip_id,
                    locatorSlipId: row.locator_slip_id,
                    facultyName: row.faculty_name,
                    collegeName: row.college_name,
                    destination: row.destination,
                    type: (row.incident_labels || []).join(', ') || 'Flagged Incident',
                    severity: Number(row.severity_rank || 1) >= 3 ? 'high' : Number(row.severity_rank || 1) === 2 ? 'medium' : 'low',
                    status: row.trip_status || 'flagged',
                    detectedAt: row.latest_detected_at ? new Date(row.latest_detected_at).toISOString() : null,
                    description: (row.incident_labels || []).join(', ') || 'Review flagged trip details.'
                }))
        ]
    };
};

const getSmartCollegeSummary = async (query = {}) => {
    const analytics = await buildSmartAnalytics(query);
    return {
        dateRange: analytics.dateRange,
        selectedCollege: analytics.selectedCollege,
        collegeSummary: analytics.collegeSummary
    };
};

const generateSmartAnalytics = async (query = {}) => buildSmartAnalytics(query, { persist: true });

const generateSmartAnalyticsForTrip = async (tripId, query = {}) => {
    const analytics = await buildSmartAnalytics(query, { persist: true });
    const trip = analytics.highRiskTrips.find((row) => String(row.tripId) === String(tripId));

    if (!trip) {
        return {
            tripId,
            generatedAt: analytics.generatedAt,
            message: 'Trip was not found in the active HRMU risk set for the selected period.',
            riskTrip: null
        };
    }

    return {
        tripId,
        generatedAt: analytics.generatedAt,
        riskTrip: trip
    };
};

const getExportPlaceholder = async (userId, format) => {
    await assertAnalyticsAccess(userId);

    return {
        message: `${format.toUpperCase()} export is not implemented yet.`,
        status: 'not_implemented'
    };
};

const getAnalyticsExportPdf = async (userId, query = {}) => {
    await assertAnalyticsAccess(userId);
    const analytics = await getOverview(query);
    const rangeStart = analytics?.dateRange?.startDate || query.startDate || '';
    const rangeEnd = analytics?.dateRange?.endDate || query.endDate || '';
    const safeRangeLabel = rangeStart && rangeEnd
        ? `${rangeStart.replace(/-/g, '')}-${rangeEnd.replace(/-/g, '')}`
        : `${String(query.year || new Date().getUTCFullYear())}-${String(query.month || '').padStart(2, '0') || '00'}`;
    const buffer = await buildHrmuAnalyticsReportPdf(analytics, query);

    return {
        buffer,
        filename: `eduroute-hrmu-analytics-${safeRangeLabel}.pdf`,
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
    getSmartAnalytics,
    getSmartSummary,
    getSmartRiskTrips,
    getSmartIncidents,
    getSmartCollegeSummary,
    generateSmartAnalytics,
    generateSmartAnalyticsForTrip,
    getExportPlaceholder,
    getAnalyticsExportPdf
};
