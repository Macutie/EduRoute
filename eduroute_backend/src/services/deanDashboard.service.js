const pool = require('../db/pool');
const AppError = require('../utils/appError');
const { formatDateTime } = require('../utils/dateFormatter');
const notificationService = require('./notification.service');
const locatorSlipNotificationService = require('./locatorSlipNotification.service');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');
const { uploadFileBuffer, destroyUploadedAsset } = require('./upload.service');

const DEAN_ROLES = ['assistant_dean', 'college_dean'];
const DEAN_SIGNATURE_PERMISSION_TEXT = 'I authorize EduRoute to use my uploaded digital signature for approving locator slips filed by faculty members in my department. I understand that this signature will be attached to approved locator slips and may be viewed by HRMU as proof of dean approval.';
let deanSignatureTablesReadyPromise = null;

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

const parseBoolean = (value) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    return false;
};

const getFileExtension = (file) => {
    const originalName = String(file?.originalname || '').toLowerCase();
    if (originalName.endsWith('.pdf')) return 'pdf';
    if (originalName.endsWith('.png')) return 'png';
    if (originalName.endsWith('.webp')) return 'webp';
    if (originalName.endsWith('.jpg') || originalName.endsWith('.jpeg')) return 'jpg';
    if (file?.mimetype === 'application/pdf') return 'pdf';
    if (file?.mimetype === 'image/png') return 'png';
    if (file?.mimetype === 'image/webp') return 'webp';
    return 'jpg';
};

const getResourceTypeForMime = (mimeType = '') => (mimeType === 'application/pdf' ? 'raw' : 'image');

const ensureDeanSignatureTables = async () => {
    if (!deanSignatureTablesReadyPromise) {
        deanSignatureTablesReadyPromise = pool.query(`
            CREATE TABLE IF NOT EXISTS dean_signature_settings (
                dean_user_id UUID PRIMARY KEY REFERENCES faculty_users(id) ON DELETE CASCADE,
                consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
                consented_at TIMESTAMP NULL,
                signature_url TEXT NULL,
                signature_public_id TEXT NULL,
                signature_mime_type TEXT NULL,
                signature_original_filename TEXT NULL,
                uploaded_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS locator_slip_dean_signatures (
                locator_slip_id UUID PRIMARY KEY REFERENCES locator_slips(id) ON DELETE CASCADE,
                dean_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
                signature_url TEXT NOT NULL,
                signature_public_id TEXT NULL,
                signature_mime_type TEXT NOT NULL,
                signature_original_filename TEXT NULL,
                consented_at TIMESTAMP NULL,
                attached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_locator_slip_dean_signatures_dean_user_id
            ON locator_slip_dean_signatures(dean_user_id);
        `).catch((error) => {
            deanSignatureTablesReadyPromise = null;
            throw error;
        });
    }

    return deanSignatureTablesReadyPromise;
};

const getDeanSignatureRecord = async (deanUserId) => {
    await ensureDeanSignatureTables();

    const { rows } = await pool.query(
        `SELECT
            consent_accepted,
            consented_at,
            signature_url,
            signature_public_id,
            signature_mime_type,
            signature_original_filename,
            uploaded_at
         FROM dean_signature_settings
         WHERE dean_user_id = $1
         LIMIT 1`,
        [deanUserId]
    );

    return rows[0] || null;
};

const serializeDeanSignatureSettings = (dean, record) => ({
    permissionText: DEAN_SIGNATURE_PERMISSION_TEXT,
    dean: {
        id: dean.id,
        name: dean.full_name,
        role: dean.account_role,
        collegeId: dean.college_id,
        collegeName: dean.college_name
    },
    consentAccepted: Boolean(record?.consent_accepted),
    consentedAt: record?.consented_at || null,
    hasSignature: Boolean(record?.signature_url),
    signatureUrl: record?.signature_url || null,
    signatureMimeType: record?.signature_mime_type || null,
    signatureOriginalFilename: record?.signature_original_filename || null,
    uploadedAt: record?.uploaded_at || null
});

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

const getDeanSignatureSettings = async (deanUserId) => {
    const dean = await getDeanContext(deanUserId);
    const record = await getDeanSignatureRecord(dean.id);

    return serializeDeanSignatureSettings(dean, record);
};

const uploadDeanSignatureFile = async (deanUserId, file, payload = {}) => {
    if (!file) {
        throw new AppError('A digital signature file is required.', 422);
    }

    const dean = await getDeanContext(deanUserId);
    const existingRecord = await getDeanSignatureRecord(dean.id);
    const consentAccepted = parseBoolean(payload.consentAccepted) || Boolean(existingRecord?.consent_accepted);

    if (!consentAccepted) {
        throw new AppError('You must grant permission before uploading your digital signature.', 422);
    }

    const extension = getFileExtension(file);
    const uploadResult = await uploadFileBuffer(file.buffer, {
        folder: 'dean-signatures',
        publicId: `dean-signature-${dean.id}-${Date.now()}`,
        extension,
        format: extension,
        resourceType: getResourceTypeForMime(file.mimetype)
    });

    await pool.query(
        `INSERT INTO dean_signature_settings (
            dean_user_id,
            consent_accepted,
            consented_at,
            signature_url,
            signature_public_id,
            signature_mime_type,
            signature_original_filename,
            uploaded_at,
            updated_at
        )
        VALUES (
            $1,
            TRUE,
            COALESCE($2, CURRENT_TIMESTAMP),
            $3,
            $4,
            $5,
            $6,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (dean_user_id) DO UPDATE
        SET consent_accepted = TRUE,
            consented_at = COALESCE(dean_signature_settings.consented_at, EXCLUDED.consented_at),
            signature_url = EXCLUDED.signature_url,
            signature_public_id = EXCLUDED.signature_public_id,
            signature_mime_type = EXCLUDED.signature_mime_type,
            signature_original_filename = EXCLUDED.signature_original_filename,
            uploaded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP`,
        [
            dean.id,
            existingRecord?.consented_at || null,
            uploadResult.url,
            uploadResult.publicId,
            file.mimetype,
            file.originalname || `signature.${extension}`
        ]
    );

    if (existingRecord?.signature_public_id) {
        await destroyUploadedAsset({
            publicId: existingRecord.signature_public_id,
            resourceType: getResourceTypeForMime(existingRecord.signature_mime_type)
        });
    }

    const updatedRecord = await getDeanSignatureRecord(dean.id);
    return serializeDeanSignatureSettings(dean, updatedRecord);
};

const getDashboardSummary = async (deanUserId) => {
    const dean = await getDeanContext(deanUserId);

    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE ls.status = 'pending')::int AS pending_requests,
            COUNT(*) FILTER (
                WHERE ls.status IN ('approved', 'verified', 'completed')
                  AND (COALESCE(ls.approved_at, ls.updated_at, ls.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
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
    rejectionReason: row.rejection_reason || row.additional_remarks || null,
    additionalRemarks: row.additional_remarks || null,
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
            COUNT(ls.id) FILTER (WHERE ls.status IN ('approved', 'completed', 'verified'))::int AS approved_requests,
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
        const approvalDenominator = Number(row.total_requests || 0);
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
    await ensureDeanSignatureTables();
    const hasCancellationReasonColumn = await getLocatorSlipColumnExists('cancellation_reason');

    const summaryResult = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE (ls.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)
                  AND (ls.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') < date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date) + INTERVAL '1 month'
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
            ls.additional_remarks AS rejection_reason,
            ls.additional_remarks,
            COALESCE(
                ${hasCancellationReasonColumn ? 'ls.cancellation_reason,' : 'NULL::text,'}
                latest_cancel_notification.cancellation_reason
            ) AS cancellation_reason,
            ls.departure_datetime,
            ls.expected_return_datetime,
            reviewer.full_name AS reviewed_by_name,
            reviewer.account_role AS reviewed_by_role,
            lsig.signature_url AS snapshot_signature_url,
            lsig.signature_mime_type AS snapshot_signature_mime_type,
            lsig.signature_original_filename AS snapshot_signature_original_filename,
            lsig.attached_at AS snapshot_signature_attached_at,
            ds.signature_url AS current_signature_url,
            ds.signature_mime_type AS current_signature_mime_type,
            ds.signature_original_filename AS current_signature_original_filename,
            ds.uploaded_at AS current_signature_uploaded_at
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         JOIN departments d ON d.id = fu.department_id
         LEFT JOIN faculty_users reviewer ON reviewer.id = ls.reviewed_by
         LEFT JOIN locator_slip_dean_signatures lsig ON lsig.locator_slip_id = ls.id
         LEFT JOIN dean_signature_settings ds ON ds.dean_user_id = reviewer.id
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
        items: itemsResult.rows.map((row) => (
            (() => {
                const signatureAsset = row.snapshot_signature_url
                    ? {
                        url: row.snapshot_signature_url,
                        mimeType: row.snapshot_signature_mime_type || null,
                        originalFilename: row.snapshot_signature_original_filename || null,
                        attachedAt: row.snapshot_signature_attached_at || null
                    }
                    : row.current_signature_url
                        ? {
                            url: row.current_signature_url,
                            mimeType: row.current_signature_mime_type || null,
                            originalFilename: row.current_signature_original_filename || null,
                            attachedAt: row.current_signature_uploaded_at || null
                        }
                        : null;

                return {
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
                            signedAt: row.approved_at || row.updated_at || row.created_at,
                            asset: signatureAsset
                        }
                        : null
                };
            })()
        ))
    };
};

const approveLocatorSlipRequest = async (deanUserId, locatorSlipId) => {
    const dean = await getDeanContext(deanUserId);
    const signatureSettings = await getDeanSignatureRecord(dean.id);
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

        if (!signatureSettings?.consent_accepted || !signatureSettings?.signature_url) {
            throw new AppError('Upload and authorize your digital signature before approving locator slips.', 422);
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

        await ensureDeanSignatureTables();

        await client.query(
            `INSERT INTO locator_slip_dean_signatures (
                locator_slip_id,
                dean_user_id,
                signature_url,
                signature_public_id,
                signature_mime_type,
                signature_original_filename,
                consented_at,
                attached_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (locator_slip_id) DO UPDATE
            SET dean_user_id = EXCLUDED.dean_user_id,
                signature_url = EXCLUDED.signature_url,
                signature_public_id = EXCLUDED.signature_public_id,
                signature_mime_type = EXCLUDED.signature_mime_type,
                signature_original_filename = EXCLUDED.signature_original_filename,
                consented_at = EXCLUDED.consented_at,
                attached_at = CURRENT_TIMESTAMP`,
            [
                locatorSlipId,
                dean.id,
                signatureSettings.signature_url,
                signatureSettings.signature_public_id,
                signatureSettings.signature_mime_type,
                signatureSettings.signature_original_filename,
                signatureSettings.consented_at
            ]
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
            },
            digitalSignature: {
                name: dean.full_name,
                role: formatSignatureRoleLabel(dean.account_role, dean.college_name),
                signedAt: updateResult.rows[0]?.approved_at || updateResult.rows[0]?.updated_at || slip.created_at,
                asset: {
                    url: signatureSettings.signature_url,
                    mimeType: signatureSettings.signature_mime_type,
                    originalFilename: signatureSettings.signature_original_filename,
                    attachedAt: updateResult.rows[0]?.approved_at || updateResult.rows[0]?.updated_at || null
                }
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
    const trimmedRemarks = String(remarks || '').trim();

    if (!trimmedRemarks) {
        throw new AppError('A reason for rejection is required.', 422);
    }

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
            [locatorSlipId, dean.id, trimmedRemarks]
        );

        await client.query('COMMIT');

        await locatorSlipNotificationService.notifyFacultyOfLocatorSlipRejection({
            recipientUserId: slip.faculty_user_id,
            senderUserId: dean.id,
            locatorSlipId: slip.id,
            remarks: trimmedRemarks
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about rejected locator slip:', notificationError);
        });

        return {
            locatorSlipId: updateResult.rows[0].id,
            status: updateResult.rows[0].status,
            remarks: trimmedRemarks
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
    getDeanSignatureSettings,
    uploadDeanSignatureFile,
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
