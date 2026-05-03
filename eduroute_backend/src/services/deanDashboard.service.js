const pool = require('../db/pool');
const AppError = require('../utils/appError');
const { formatDateTime } = require('../utils/dateFormatter');
const notificationService = require('./notification.service');
const locatorSlipNotificationService = require('./locatorSlipNotification.service');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');

const DEAN_ROLES = ['assistant_dean', 'college_dean'];

const formatDateOnly = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
};

const getInitials = (name = '') =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'FA';

const getDeanContext = async (deanUserId) => {
    const { rows, rowCount } = await pool.query(
        `SELECT
            fu.id,
            fu.full_name,
            fu.account_role,
            fu.department_id AS college_id,
            d.department_name AS college_name
         FROM faculty_users fu
         JOIN departments d ON d.id = fu.department_id
         WHERE fu.id = $1
           AND fu.account_role = ANY($2::text[])
           AND fu.status = 'active'
         LIMIT 1`,
        [deanUserId, DEAN_ROLES]
    );

    if (rowCount === 0) {
        throw new AppError('Only assistant deans and college deans can access this dashboard.', 403);
    }

    return rows[0];
};

const getLocatorSlipColumnExists = async (columnName) => {
    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'locator_slips'
              AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    return Boolean(rows[0]?.exists);
};

const getDashboardSummary = async (deanUserId) => {
    const dean = await getDeanContext(deanUserId);

    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE ls.status = 'pending')::int AS pending_requests,
            COUNT(*) FILTER (
                WHERE ls.status = 'approved'
                  AND COALESCE(ls.approved_at, ls.updated_at, ls.created_at)::date = CURRENT_DATE
            )::int AS approved_today,
            COUNT(*) FILTER (WHERE ls.status = 'rejected')::int AS rejected_requests,
            (
                SELECT COUNT(*)::int
                FROM faculty_users fu
                WHERE fu.account_role = 'faculty'
                  AND fu.department_id = $1
                  AND fu.status = 'active'
            ) AS total_faculty
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND fu.department_id = $1`,
        [dean.college_id]
    );

    const summary = rows[0] || {};

    return {
        pendingRequests: summary.pending_requests || 0,
        approvedRequests: summary.approved_today || 0,
        approvedToday: summary.approved_today || 0,
        rejectedRequests: summary.rejected_requests || 0,
        totalFaculty: summary.total_faculty || 0,
        college: {
            id: dean.college_id,
            name: dean.college_name
        }
    };
};

const getDeanNotifications = async (deanUserId, query) => {
    await getDeanContext(deanUserId);
    return notificationService.listNotificationsForUser(deanUserId, query);
};

const markNotificationRead = async (deanUserId, notificationId) => {
    await getDeanContext(deanUserId);
    const notification = await notificationService.markNotificationRead(deanUserId, notificationId);

    if (!notification) {
        throw new AppError('Notification not found.', 404);
    }

    return notification;
};

const buildLocatorSlipWhere = (collegeId, { status, search }, values) => {
    const clauses = ['COALESCE(ls.college_id, fu.department_id) = $1'];

    if (status && status !== 'all') {
        values.push(status);
        clauses.push(`ls.status = $${values.length}`);
    }

    if (search) {
        values.push(`%${search.trim()}%`);
        clauses.push(`(
            fu.full_name ILIKE $${values.length}
            OR ls.destination ILIKE $${values.length}
            OR ls.purpose_of_travel ILIKE $${values.length}
            OR COALESCE(ls.custom_purpose, '') ILIKE $${values.length}
        )`);
    }

    return clauses.join(' AND ');
};

const normalizeLocatorSlipRow = (row) => ({
    locatorSlipId: row.id,
    facultyUserId: row.faculty_user_id,
    facultyName: row.full_name,
    facultyInitials: getInitials(row.full_name),
    employeeId: row.employee_id,
    position: row.department_position || 'Instructor',
    collegeName: row.department_name,
    purpose: row.custom_purpose || row.purpose_of_travel,
    purposeOfTravel: row.purpose_of_travel,
    destination: row.destination,
    isUrgent: row.is_urgent === true,
    status: row.status,
    cancellationReason: row.cancellation_reason || null,
    createdAt: row.created_at,
    dateSubmitted: formatDateOnly(row.created_at),
    formattedCreatedAt: formatDateTime(row.created_at),
    departureDatetime: row.departure_datetime,
    expectedReturnDatetime: row.expected_return_datetime,
    formattedDepartureDatetime: formatDateTime(row.departure_datetime),
    formattedExpectedReturnDatetime: formatDateTime(row.expected_return_datetime)
});

const getDeanLocatorSlips = async (deanUserId, query = {}) => {
    const dean = await getDeanContext(deanUserId);
    const status = query.status || 'all';

    if (!['pending', 'approved', 'rejected', 'completed', 'cancelled', 'all'].includes(status)) {
        throw new AppError('Locator slip status filter is invalid.', 400);
    }

    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const values = [dean.college_id];
    const whereClause = buildLocatorSlipWhere(dean.college_id, { status, search: query.search }, values);

    const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE ${whereClause}`,
        values
    );

    values.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            fu.full_name,
            fu.employee_id,
            d.department_name,
            ls.destination,
            ls.is_urgent,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.status,
            ls.created_at
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         JOIN departments d ON d.id = fu.department_id
         WHERE ${whereClause}
         ORDER BY ls.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
    );

    return {
        items: rows.map(normalizeLocatorSlipRow),
        pagination: {
            page,
            limit,
            total: countResult.rows[0]?.total || 0
        }
    };
};

const getPendingApprovalsPreview = async (deanUserId, limit = 5) => {
    const dean = await getDeanContext(deanUserId);
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);

    const { rows } = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            fu.full_name,
            fu.employee_id,
            d.department_name,
            ls.destination,
            ls.is_urgent,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.status,
            ls.created_at
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         JOIN departments d ON d.id = fu.department_id
         WHERE COALESCE(ls.college_id, fu.department_id) = $1
           AND ls.status = 'pending'
         ORDER BY ls.created_at DESC
         LIMIT $2`,
        [dean.college_id, safeLimit]
    );

    return rows.map(normalizeLocatorSlipRow);
};

const normalizeFacultyStatus = (status) => {
    if (status === 'approved' || status === 'completed') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    return status;
};

const getFacultyOverview = async (deanUserId, query = {}) => {
    const dean = await getDeanContext(deanUserId);
    const search = query.search?.trim();
    const values = [dean.college_id];
    const facultyClauses = [
        "fu.account_role = 'faculty'",
        "fu.status = 'active'",
        'fu.department_id = $1'
    ];

    if (search) {
        values.push(`%${search}%`);
        facultyClauses.push(`(
            fu.full_name ILIKE $${values.length}
            OR fu.employee_id ILIKE $${values.length}
            OR COALESCE(fu.department_position, '') ILIKE $${values.length}
        )`);
    }

    const whereClause = facultyClauses.join(' AND ');

    const summaryResult = await pool.query(
        `SELECT
            COUNT(DISTINCT fu.id)::int AS total_faculty,
            COUNT(ls.id) FILTER (WHERE ls.status = 'pending')::int AS active_requests
         FROM faculty_users fu
         LEFT JOIN locator_slips ls ON ls.faculty_user_id = fu.id
         WHERE fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND fu.department_id = $1`,
        [dean.college_id]
    );

    const facultyResult = await pool.query(
        `SELECT
            fu.id,
            fu.full_name,
            fu.employee_id,
            fu.profile_image_url,
            COALESCE(fu.department_position, 'Instructor') AS department_position,
            COALESCE(fu.employment_type, 'full_time') AS employment_type,
            d.department_name,
            COUNT(ls.id)::int AS total_requests,
            COUNT(ls.id) FILTER (WHERE ls.status = 'approved')::int AS approved_requests,
            COUNT(ls.id) FILTER (WHERE ls.status = 'rejected')::int AS rejected_requests,
            COALESCE(
                ARRAY_AGG(ls.status ORDER BY ls.created_at DESC)
                FILTER (WHERE ls.id IS NOT NULL),
                ARRAY[]::varchar[]
            ) AS recent_statuses
         FROM faculty_users fu
         JOIN departments d ON d.id = fu.department_id
         LEFT JOIN locator_slips ls ON ls.faculty_user_id = fu.id
            AND ls.status <> 'cancelled'
         WHERE ${whereClause}
         GROUP BY fu.id, d.department_name
         ORDER BY fu.full_name ASC`,
        values
    );

    const items = facultyResult.rows.map((row) => {
        const approvalDenominator = Number(row.approved_requests || 0) + Number(row.rejected_requests || 0);
        const approvalRate = approvalDenominator > 0
            ? Math.round((Number(row.approved_requests || 0) / approvalDenominator) * 100)
            : 0;
        const recentStatuses = (row.recent_statuses || []).map(normalizeFacultyStatus);

        return {
            id: row.id,
            fullName: row.full_name,
            employeeId: row.employee_id,
            profileImageUrl: row.profile_image_url,
            position: row.department_position,
            employmentType: row.employment_type,
            employmentLabel: row.employment_type === 'part_time' ? 'PART-TIME' : 'FULL-TIME',
            borderColor: row.employment_type === 'part_time' ? 'red' : 'green',
            collegeName: row.department_name,
            totalRequests: Number(row.total_requests || 0),
            approvedRequests: Number(row.approved_requests || 0),
            rejectedRequests: Number(row.rejected_requests || 0),
            approvalRate,
            approvalRateLabel: `${approvalRate}%`,
            recentStatuses: recentStatuses.slice(0, 3),
            remainingStatusCount: Math.max(recentStatuses.length - 3, 0)
        };
    });

    return {
        summary: {
            totalFaculty: summaryResult.rows[0]?.total_faculty || 0,
            activeRequests: summaryResult.rows[0]?.active_requests || 0,
            college: {
                id: dean.college_id,
                name: dean.college_name
            }
        },
        items
    };
};

const getPendingRequestsPage = async (deanUserId) => {
    const dean = await getDeanContext(deanUserId);

    const summaryResult = await pool.query(
        `WITH college_faculty AS (
            SELECT id
            FROM faculty_users
            WHERE account_role = 'faculty'
              AND status = 'active'
              AND department_id = $1
        ),
        pending_slips AS (
            SELECT *
            FROM locator_slips
            WHERE status = 'pending'
              AND faculty_user_id IN (SELECT id FROM college_faculty)
        ),
        active_trip_users AS (
            SELECT DISTINCT faculty_user_id
            FROM locator_slips
            WHERE status = 'approved'
              AND faculty_user_id IN (SELECT id FROM college_faculty)
              AND departure_datetime <= CURRENT_TIMESTAMP
              AND expected_return_datetime >= CURRENT_TIMESTAMP
        )
        SELECT
            (SELECT COUNT(*)::int FROM pending_slips) AS pending,
            (SELECT COUNT(*)::int FROM college_faculty) - (SELECT COUNT(*)::int FROM active_trip_users) AS onsite_faculty,
            (SELECT COUNT(*)::int FROM active_trip_users) AS offsite_faculty,
            (SELECT COUNT(*)::int FROM pending_slips WHERE is_urgent = TRUE) AS urgent`,
        [dean.college_id]
    );

    const requestsResult = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            fu.full_name,
            fu.employee_id,
            COALESCE(fu.department_position, 'Instructor') AS department_position,
            d.department_name,
            ls.destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.is_urgent,
            ls.status,
            ls.created_at,
            ls.departure_datetime,
            ls.expected_return_datetime
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         JOIN departments d ON d.id = fu.department_id
         WHERE fu.department_id = $1
           AND fu.account_role = 'faculty'
           AND ls.status = 'pending'
         ORDER BY ls.is_urgent DESC, ls.created_at DESC`,
        [dean.college_id]
    );

    return {
        summary: {
            pending: summaryResult.rows[0]?.pending || 0,
            onsiteFaculty: summaryResult.rows[0]?.onsite_faculty || 0,
            offsiteFaculty: summaryResult.rows[0]?.offsite_faculty || 0,
            urgent: summaryResult.rows[0]?.urgent || 0,
            college: {
                id: dean.college_id,
                name: dean.college_name
            }
        },
        items: requestsResult.rows.map(normalizeLocatorSlipRow)
    };
};

const normalizeRegistryStatus = (status) => {
    if (status === 'approved' || status === 'completed') return 'verified';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    if (status === 'cancelled') return 'cancelled';
    return status;
};

const formatSignatureRoleLabel = (role, collegeName) => {
    if (role === 'assistant_dean') return `Assistant Dean of ${collegeName}`;
    return `Dean of ${collegeName}`;
};

const getRegistryPage = async (deanUserId) => {
    const dean = await getDeanContext(deanUserId);
    const hasCancellationReasonColumn = await getLocatorSlipColumnExists('cancellation_reason');

    const summaryResult = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE ls.created_at >= date_trunc('month', CURRENT_DATE)
                  AND ls.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            )::int AS monthly_total,
            COUNT(*)::int AS registry_size
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND fu.department_id = $1`,
        [dean.college_id]
    );

    const itemsResult = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            fu.full_name,
            fu.employee_id,
            fu.profile_image_url,
            COALESCE(fu.department_position, d.department_name, 'Instructor') AS department_position,
            d.department_name,
            ls.destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.is_urgent,
            ls.status,
            ls.created_at,
            ls.updated_at,
            ls.approved_at,
            ls.rejected_at,
            COALESCE(
                ${hasCancellationReasonColumn ? 'ls.cancellation_reason,' : 'NULL::text,'}
                latest_cancel_notification.cancellation_reason
            ) AS cancellation_reason,
            ls.departure_datetime,
            ls.expected_return_datetime,
            reviewer.full_name AS reviewed_by_name,
            reviewer.account_role AS reviewed_by_role
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         JOIN departments d ON d.id = fu.department_id
         LEFT JOIN faculty_users reviewer ON reviewer.id = ls.reviewed_by
         LEFT JOIN LATERAL (
            SELECT n.data ->> 'cancellationReason' AS cancellation_reason
            FROM notifications n
            WHERE n.locator_slip_id = ls.id
              AND n.type = 'LOCATOR_SLIP_CANCELLED'
            ORDER BY n.created_at DESC, n.id DESC
            LIMIT 1
         ) latest_cancel_notification ON TRUE
         WHERE fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND fu.department_id = $1
         ORDER BY ls.created_at DESC, ls.id DESC`,
        [dean.college_id]
    );

    return {
        summary: {
            monthlyTotal: summaryResult.rows[0]?.monthly_total || 0,
            registrySize: summaryResult.rows[0]?.registry_size || 0,
            college: {
                id: dean.college_id,
                name: dean.college_name
            }
        },
        items: itemsResult.rows.map((row) => ({
            ...normalizeLocatorSlipRow(row),
            position: row.department_position || row.department_name || 'Instructor',
            profileImageUrl: row.profile_image_url,
            statusLabel: normalizeRegistryStatus(row.status),
            dateLabel: row.status === 'cancelled' ? 'DATE CANCELLED' : 'DATE SUBMITTED',
            dateValue: formatDateOnly(row.status === 'cancelled' ? (row.updated_at || row.created_at) : row.created_at),
            referenceNumber: `LS-${new Date(row.created_at).getFullYear()}-${String(row.id).padStart(3, '0')}`,
            assignedDean: {
                name: row.reviewed_by_name || dean.full_name,
                role: formatSignatureRoleLabel(row.reviewed_by_role || dean.account_role, dean.college_name)
            },
            digitalSignature: ['approved', 'completed'].includes(row.status)
                ? {
                    name: row.reviewed_by_name || dean.full_name,
                    role: formatSignatureRoleLabel(row.reviewed_by_role || dean.account_role, dean.college_name),
                    signedAt: row.approved_at || row.updated_at || row.created_at
                }
                : null
        }))
    };
};

const approveLocatorSlipRequest = async (deanUserId, locatorSlipId) => {
    const dean = await getDeanContext(deanUserId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const slipResult = await client.query(
            `SELECT
                ls.id,
                ls.faculty_user_id,
                fu.full_name,
                fu.employee_id,
                COALESCE(fu.department_position, 'Instructor') AS department_position,
                d.department_name,
                ls.destination,
                ls.purpose_of_travel,
                ls.custom_purpose,
                ls.is_urgent,
                ls.status,
                ls.created_at,
                ls.departure_datetime,
                ls.expected_return_datetime
             FROM locator_slips ls
             JOIN faculty_users fu ON fu.id = ls.faculty_user_id
             JOIN departments d ON d.id = fu.department_id
             WHERE ls.id = $1
               AND fu.account_role = 'faculty'
               AND fu.status = 'active'
               AND fu.department_id = $2
             LIMIT 1`,
            [locatorSlipId, dean.college_id]
        );

        if (slipResult.rowCount === 0) {
            throw new AppError('Locator slip not found for your assigned college.', 404);
        }

        const slip = slipResult.rows[0];

        if (slip.status !== 'pending') {
            throw new AppError('Only pending locator slips can be approved.', 409);
        }

        const updateResult = await client.query(
            `UPDATE locator_slips
             SET status = 'approved',
                 approved_at = CURRENT_TIMESTAMP,
                 reviewed_by = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, status, approved_at, reviewed_by, updated_at`,
            [locatorSlipId, dean.id]
        );

        const hrmuNotificationPayload = await hrmuDashboardRepository.createApprovalNotificationsForHrmu(client, locatorSlipId);

        await client.query('COMMIT');

        await locatorSlipNotificationService.notifyFacultyOfLocatorSlipApproval({
            recipientUserId: slip.faculty_user_id,
            senderUserId: dean.id,
            locatorSlipId: slip.id,
            destination: slip.destination
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about approved locator slip:', notificationError);
        });

        await socketBroadcasterService.broadcastHrmuNotificationNew(hrmuNotificationPayload).catch((broadcastError) => {
            console.error('Failed to broadcast HRMU approval notification:', broadcastError);
        });
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch((broadcastError) => {
            console.error('Failed to broadcast HRMU dashboard update after approval:', broadcastError);
        });

        return {
            ...normalizeLocatorSlipRow({
                ...slip,
                ...updateResult.rows[0]
            }),
            reviewedBy: {
                id: dean.id,
                name: dean.full_name,
                role: dean.account_role,
                collegeId: dean.college_id,
                collegeName: dean.college_name
            }
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Dean locator slip approval rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

const rejectLocatorSlipRequest = async (deanUserId, locatorSlipId, remarks = '') => {
    const dean = await getDeanContext(deanUserId);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const slipResult = await client.query(
            `SELECT
                ls.id,
                ls.faculty_user_id,
                fu.full_name,
                d.department_name,
                ls.destination,
                ls.status
             FROM locator_slips ls
             JOIN faculty_users fu ON fu.id = ls.faculty_user_id
             JOIN departments d ON d.id = fu.department_id
             WHERE ls.id = $1
               AND fu.account_role = 'faculty'
               AND fu.status = 'active'
               AND fu.department_id = $2
             LIMIT 1`,
            [locatorSlipId, dean.college_id]
        );

        if (slipResult.rowCount === 0) {
            throw new AppError('Locator slip not found for your assigned college.', 404);
        }

        const slip = slipResult.rows[0];

        if (slip.status !== 'pending') {
            throw new AppError('Only pending locator slips can be rejected.', 409);
        }

        const updateResult = await client.query(
            `UPDATE locator_slips
             SET status = 'rejected',
                 rejected_at = CURRENT_TIMESTAMP,
                 reviewed_by = $2,
                 additional_remarks = COALESCE(NULLIF($3, ''), additional_remarks),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [locatorSlipId, dean.id, remarks || null]
        );

        await client.query('COMMIT');

        await locatorSlipNotificationService.notifyFacultyOfLocatorSlipRejection({
            recipientUserId: slip.faculty_user_id,
            senderUserId: dean.id,
            locatorSlipId: slip.id,
            remarks
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about rejected locator slip:', notificationError);
        });

        return {
            locatorSlipId: updateResult.rows[0].id,
            status: updateResult.rows[0].status,
            remarks: remarks || null
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Dean locator slip rejection rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    DEAN_ROLES,
    getDeanContext,
    getDashboardSummary,
    getDeanNotifications,
    markNotificationRead,
    getDeanLocatorSlips,
    getPendingApprovalsPreview,
    getFacultyOverview,
    getPendingRequestsPage,
    getRegistryPage,
    approveLocatorSlipRequest,
    rejectLocatorSlipRequest
};
