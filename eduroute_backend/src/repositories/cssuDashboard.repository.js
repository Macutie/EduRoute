const pool = require('../db/pool');

const ALLOWED_COLLEGE_NAMES = [
    'College of Education, Arts and Sciences',
    'College of Hospitality and Tourism Management',
    'College of Business and Accountancy',
    'College of Allied Health Studies',
    'College of Computer Studies'
];
const CSSU_FLAG_INCIDENT_NOTE_PREFIX = 'FLAG_INCIDENT:';

let cssuExitLogsTableExistsCache = null;
const locatorSlipColumnExistsCache = {};

const getCssuExitLogsTableExists = async () => {
    if (cssuExitLogsTableExistsCache !== null) {
        return cssuExitLogsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.cssu_exit_logs') AS table_name`);
    cssuExitLogsTableExistsCache = Boolean(rows[0]?.table_name);
    return cssuExitLogsTableExistsCache;
};

const getLocatorSlipColumnExists = async (columnName) => {
    if (Object.prototype.hasOwnProperty.call(locatorSlipColumnExistsCache, columnName)) {
        return locatorSlipColumnExistsCache[columnName];
    }

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

    locatorSlipColumnExistsCache[columnName] = Boolean(rows[0]?.exists);
    return locatorSlipColumnExistsCache[columnName];
};

const getDashboardSummary = async () => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    
    const logJoin = hasCssuExitLogsTable
        ? `LEFT JOIN cssu_exit_logs log ON log.locator_slip_id = ls.id`
        : `LEFT JOIN LATERAL (SELECT NULL::text AS status) log ON TRUE`;

    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE ls.status IN ('approved', 'verified', 'completed'))::int AS total_faculty_exiting,
            COUNT(*) FILTER (WHERE log.status = 'validated')::int AS approved_locator_slips,
            COUNT(*) FILTER (WHERE ls.status = 'rejected' OR log.status = 'denied')::int AS rejected_locator_slips
         FROM locator_slips ls
         ${logJoin}
         WHERE (COALESCE(ls.departure_datetime, ls.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
            OR (log.validated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date`
    );

    return rows[0] || {
        total_faculty_exiting: 0,
        approved_locator_slips: 0,
        rejected_locator_slips: 0,
    };
};

const buildReportsFilter = ({ startDate, endDate, departmentName } = {}) => {
    const values = [ALLOWED_COLLEGE_NAMES, startDate, endDate];
    let departmentClause = '';

    if (departmentName && departmentName !== 'all') {
        values.push(departmentName);
        departmentClause = `AND ad.department_name = $${values.length}`;
    }

    return {
        values,
        departmentClause,
    };
};

const getReportsSummary = async ({ startDate, endDate, departmentName } = {}) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const { values, departmentClause } = buildReportsFilter({ startDate, endDate, departmentName });

    const validatedExitJoin = hasCssuExitLogsTable
        ? `LEFT JOIN cssu_exit_logs log
             ON log.locator_slip_id = fls.locator_slip_id
            AND log.status = 'validated'
            AND COALESCE(log.validated_at::date, log.created_at::date) BETWEEN $2::date AND $3::date`
        : `LEFT JOIN LATERAL (
                SELECT NULL::uuid AS locator_slip_id
            ) log ON TRUE`;

    const flaggedExitJoin = hasCssuExitLogsTable
        ? `LEFT JOIN cssu_exit_logs flagged_log
             ON flagged_log.locator_slip_id = fls.locator_slip_id
            AND flagged_log.status = 'denied'
            AND COALESCE(flagged_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%'
            AND COALESCE(flagged_log.validated_at::date, flagged_log.created_at::date) BETWEEN $2::date AND $3::date`
        : `LEFT JOIN LATERAL (
                SELECT NULL::uuid AS locator_slip_id
            ) flagged_log ON TRUE`;

    const { rows } = await pool.query(
        `WITH allowed_departments AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        filtered_locator_slips AS (
            SELECT
                ls.id AS locator_slip_id,
                COALESCE(ls.college_id, fu.department_id) AS department_id,
                ad.department_name,
                ls.status,
                COALESCE(ls.departure_datetime::date, ls.created_at::date) AS report_date
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            JOIN allowed_departments ad ON ad.id = COALESCE(ls.college_id, fu.department_id)
            WHERE COALESCE(ls.departure_datetime::date, ls.created_at::date) BETWEEN $2::date AND $3::date
              ${departmentClause}
        )
        SELECT
            COUNT(DISTINCT log.locator_slip_id)::int AS exit_clearances,
            COUNT(DISTINCT flagged_log.locator_slip_id)::int AS flagged_events
        FROM filtered_locator_slips fls
        ${validatedExitJoin}
        ${flaggedExitJoin}`,
        values
    );

    return rows[0] || {
        exit_clearances: 0,
        flagged_events: 0,
    };
};

const getReportsActivityByDepartment = async ({ startDate, endDate, departmentName } = {}) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const { values, departmentClause } = buildReportsFilter({ startDate, endDate, departmentName });

    if (!hasCssuExitLogsTable) {
        return [];
    }

    const { rows } = await pool.query(
        `WITH allowed_departments AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        validated_locator_slips AS (
            SELECT
                ad.department_name,
                ls.id AS locator_slip_id
            FROM cssu_exit_logs log
            JOIN locator_slips ls ON ls.id = log.locator_slip_id
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            JOIN allowed_departments ad ON ad.id = COALESCE(ls.college_id, fu.department_id)
            WHERE log.status = 'validated'
              AND COALESCE(log.validated_at::date, log.created_at::date) BETWEEN $2::date AND $3::date
              ${departmentClause}
        ),
        total_locator_slips AS (
            SELECT COUNT(*)::numeric AS total_count
            FROM validated_locator_slips
        )
        SELECT
            vls.department_name,
            COUNT(*)::int AS locator_slip_count,
            CASE
                WHEN tls.total_count = 0 THEN 0
                ELSE ROUND((COUNT(*)::numeric / tls.total_count) * 100, 1)
            END AS percentage
        FROM validated_locator_slips vls
        CROSS JOIN total_locator_slips tls
        GROUP BY vls.department_name, tls.total_count
        ORDER BY COUNT(*) DESC, vls.department_name ASC`,
        values
    );

    return rows;
};

const getReportsMovementLogs = async ({ startDate, endDate, departmentName } = {}) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const { values, departmentClause } = buildReportsFilter({ startDate, endDate, departmentName });

    const validatedLogsCte = hasCssuExitLogsTable
        ? `validated_logs AS (
                SELECT
                    CONCAT('validated-', log.id)::text AS movement_id,
                    slip.locator_slip_id,
                    slip.faculty_name,
                    slip.employee_id,
                    slip.department_name,
                    slip.purpose,
                    slip.destination,
                    COALESCE(log.validated_at, log.created_at) AS occurred_at,
                    'verified'::text AS movement_status,
                    CASE
                        WHEN log.gate = 'back_gate' THEN 'Back Gate'
                        ELSE 'Main Gate'
                    END AS location_label,
                    'Exit Clearance'::text AS event_label,
                    NULL::text AS investigation_label,
                    validator.full_name AS validated_by_name
                FROM cssu_exit_logs log
                JOIN filtered_locator_slips slip ON slip.locator_slip_id = log.locator_slip_id
                LEFT JOIN faculty_users validator ON validator.id = log.validated_by
                WHERE log.status = 'validated'
                  AND COALESCE(log.validated_at::date, log.created_at::date) BETWEEN $2::date AND $3::date
            ),`
        : `validated_logs AS (
                SELECT
                    NULL::text AS movement_id,
                    NULL::uuid AS locator_slip_id,
                    NULL::text AS faculty_name,
                    NULL::text AS employee_id,
                    NULL::text AS department_name,
                    NULL::text AS purpose,
                    NULL::text AS destination,
                    NULL::timestamp AS occurred_at,
                    NULL::text AS movement_status,
                    NULL::text AS location_label,
                    NULL::text AS event_label,
                    NULL::text AS investigation_label,
                    NULL::text AS validated_by_name
                WHERE FALSE
            ),`;

    const { rows } = await pool.query(
        `WITH allowed_departments AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        filtered_locator_slips AS (
            SELECT
                ls.id AS locator_slip_id,
                fu.full_name AS faculty_name,
                fu.employee_id,
                ad.department_name,
                COALESCE(ls.custom_purpose, ls.purpose_of_travel, 'Locator Slip Clearance') AS purpose,
                COALESCE(ls.destination, 'Unknown destination') AS destination,
                ls.status,
                ls.created_at,
                ls.updated_at
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            JOIN allowed_departments ad ON ad.id = COALESCE(ls.college_id, fu.department_id)
            WHERE COALESCE(ls.departure_datetime::date, ls.created_at::date) BETWEEN $2::date AND $3::date
              ${departmentClause}
        ),
        ${validatedLogsCte}
        flagged_logs AS (
            SELECT
                CONCAT('flagged-', log.id)::text AS movement_id,
                slip.locator_slip_id,
                slip.faculty_name,
                slip.employee_id,
                slip.department_name,
                slip.purpose,
                slip.destination,
                COALESCE(log.validated_at, log.created_at) AS occurred_at,
                'flagged'::text AS movement_status,
                CASE
                    WHEN slip.status = 'pending' THEN 'Pending Approval'
                    ELSE 'Rejected Locator Slip'
                END AS location_label,
                CASE
                    WHEN slip.status = 'pending' THEN 'Pending Locator Slip'
                    ELSE 'Rejected Locator Slip'
                END AS event_label,
                'Investigation Req.'::text AS investigation_label,
                validator.full_name AS validated_by_name
            FROM filtered_locator_slips slip
            JOIN cssu_exit_logs log ON log.locator_slip_id = slip.locator_slip_id
            LEFT JOIN faculty_users validator ON validator.id = log.validated_by
            WHERE log.status = 'denied'
              AND COALESCE(log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%'
              AND COALESCE(log.validated_at::date, log.created_at::date) BETWEEN $2::date AND $3::date
        ),
        movement_rows AS (
            SELECT * FROM validated_logs
            UNION ALL
            SELECT * FROM flagged_logs
        )
        SELECT
            movement_id,
            locator_slip_id,
            faculty_name,
            employee_id,
            department_name,
            purpose,
            destination,
            occurred_at,
            movement_status,
            location_label,
            event_label,
            investigation_label,
            validated_by_name
        FROM movement_rows
        ORDER BY occurred_at DESC, movement_id ASC`,
        values
    );

    return rows;
};

const getIncidentOverview = async () => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();

    const flaggedLogsCte = hasCssuExitLogsTable
        ? `flagged_logs AS (
                SELECT
                    CONCAT('flagged-', log.id)::text AS incident_id,
                    ls.id AS locator_slip_id,
                    fu.id AS faculty_user_id,
                    fu.full_name AS faculty_name,
                    fu.employee_id,
                    d.department_name,
                    COALESCE(ls.destination, 'Unknown destination') AS destination,
                    COALESCE(ls.custom_purpose, ls.purpose_of_travel, 'Locator Slip Clearance') AS purpose,
                    'Flagged Exit Attempt'::text AS title,
                    CASE
                        WHEN ls.status = 'pending' THEN 'CSSU flagged an exit attempt because the locator slip is still pending dean approval.'
                        WHEN ls.status = 'rejected' THEN 'CSSU flagged an exit attempt because the locator slip was rejected.'
                        ELSE 'CSSU flagged an exit attempt for review.'
                    END AS description,
                    CASE
                        WHEN ls.status = 'pending' THEN 'moderate'
                        ELSE 'critical'
                    END AS severity,
                    CASE
                        WHEN ls.status = 'pending' THEN 'yellow'
                        ELSE 'red'
                    END AS tone,
                    COALESCE(log.validated_at, log.created_at) AS occurred_at,
                    COALESCE(log.notes, '') AS notes
                FROM cssu_exit_logs log
                JOIN locator_slips ls ON ls.id = log.locator_slip_id
                JOIN faculty_users fu ON fu.id = ls.faculty_user_id
                LEFT JOIN departments d ON d.id = fu.department_id
                WHERE log.status = 'denied'
                  AND COALESCE(log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%'
                  AND (COALESCE(log.validated_at, log.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
            ),`
        : `flagged_logs AS (
                SELECT
                    NULL::text AS incident_id,
                    NULL::int AS locator_slip_id,
                    NULL::int AS faculty_user_id,
                    NULL::text AS faculty_name,
                    NULL::text AS employee_id,
                    NULL::text AS department_name,
                    NULL::text AS destination,
                    NULL::text AS purpose,
                    NULL::text AS title,
                    NULL::text AS description,
                    NULL::text AS severity,
                    NULL::text AS tone,
                    NULL::timestamp AS occurred_at,
                    NULL::text AS notes
                WHERE FALSE
            ),`;

    const validatedTodaySql = hasCssuExitLogsTable
        ? `(SELECT COUNT(*)::int FROM cssu_exit_logs WHERE status = 'validated' AND (COALESCE(validated_at, created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)`
        : `0`;

    const { rows } = await pool.query(
        `WITH
            ${flaggedLogsCte}
            incident_rows AS (
                SELECT * FROM flagged_logs
            )
         SELECT
            incident_id,
            locator_slip_id,
            faculty_user_id,
            faculty_name,
            employee_id,
            department_name,
            destination,
            purpose,
            title,
            description,
            severity,
            tone,
            occurred_at,
            notes,
            (SELECT COUNT(*)::int FROM incident_rows) AS active_cases,
            ${validatedTodaySql} AS resolved_today
         FROM incident_rows
         ORDER BY occurred_at DESC, incident_id ASC`
    );

    return rows;
};

const getNotificationsOverview = async (limit = 8) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();

    if (!hasCssuExitLogsTable) {
        return {
            notifications: [],
            validated_clearances: 0,
            flagged_exits: 0,
            unauthorized_exit: 0,
        };
    }

    const { rows } = await pool.query(
        `WITH notification_rows AS (
            SELECT
                CONCAT('validated-', log.id)::text AS notification_id,
                ls.id AS locator_slip_id,
                fu.id AS faculty_user_id,
                fu.full_name AS faculty_name,
                fu.employee_id,
                d.department_name,
                COALESCE(ls.destination, 'Unknown destination') AS destination,
                COALESCE(ls.custom_purpose, ls.purpose_of_travel, 'Locator Slip Clearance') AS purpose,
                log.gate,
                'validated'::text AS notification_type,
                'Exit Clearance Validated'::text AS title,
                COALESCE(log.validated_at, log.created_at) AS occurred_at,
                COALESCE(log.notes, '') AS notes,
                ls.status AS locator_slip_status
            FROM cssu_exit_logs log
            JOIN locator_slips ls ON ls.id = log.locator_slip_id
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            LEFT JOIN departments d ON d.id = fu.department_id
            WHERE log.status = 'validated'

            UNION ALL

            SELECT
                CONCAT('flagged-', log.id)::text AS notification_id,
                ls.id AS locator_slip_id,
                fu.id AS faculty_user_id,
                fu.full_name AS faculty_name,
                fu.employee_id,
                d.department_name,
                COALESCE(ls.destination, 'Unknown destination') AS destination,
                COALESCE(ls.custom_purpose, ls.purpose_of_travel, 'Locator Slip Clearance') AS purpose,
                log.gate,
                'flagged'::text AS notification_type,
                CASE
                    WHEN ls.status = 'pending' THEN 'Unauthorized Exit Attempt'
                    ELSE 'Flagged Exit Attempt'
                END AS title,
                COALESCE(log.validated_at, log.created_at) AS occurred_at,
                COALESCE(log.notes, '') AS notes,
                ls.status AS locator_slip_status
            FROM cssu_exit_logs log
            JOIN locator_slips ls ON ls.id = log.locator_slip_id
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            LEFT JOIN departments d ON d.id = fu.department_id
            WHERE log.status = 'denied'
              AND COALESCE(log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%'
        ),
        summary AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE notification_type = 'validated'
                      AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                )::int AS validated_clearances,
                COUNT(*) FILTER (
                    WHERE notification_type = 'flagged'
                      AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                )::int AS flagged_exits,
                COUNT(*) FILTER (
                    WHERE notification_type = 'flagged'
                      AND locator_slip_status = 'pending'
                      AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                )::int AS unauthorized_exit
            FROM notification_rows
        )
        SELECT
            nr.notification_id,
            nr.locator_slip_id,
            nr.faculty_user_id,
            nr.faculty_name,
            nr.employee_id,
            nr.department_name,
            nr.destination,
            nr.purpose,
            nr.gate,
            nr.notification_type,
            nr.title,
            nr.occurred_at,
            nr.notes,
            nr.locator_slip_status,
            s.validated_clearances,
            s.flagged_exits,
            s.unauthorized_exit
        FROM notification_rows nr
        CROSS JOIN summary s
        ORDER BY nr.occurred_at DESC, nr.notification_id ASC
        LIMIT $1`,
        [limit]
    );

    return {
        notifications: rows,
        validated_clearances: rows[0]?.validated_clearances || 0,
        flagged_exits: rows[0]?.flagged_exits || 0,
        unauthorized_exit: rows[0]?.unauthorized_exit || 0,
    };
};

const getLiveExitMonitoring = async (gate = 'main_gate', limit = 20) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();

    if (hasCssuExitLogsTable) {
        const { rows } = await pool.query(
            `SELECT
                ls.id AS locator_slip_id,
                ls.faculty_user_id,
                fu.full_name AS faculty_name,
                fu.profile_image_url AS faculty_profile_image_url,
                fu.employee_id,
                d.department_name,
                ls.destination,
                ls.purpose_of_travel,
                COALESCE(log.gate, 'main_gate') AS gate,
                COALESCE(log.status, 'approved') AS monitoring_status,
                COALESCE(log.validated_at, ls.approved_at, ls.updated_at, ls.created_at) AS status_timestamp
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            LEFT JOIN departments d ON d.id = fu.department_id
            LEFT JOIN cssu_exit_logs log ON log.locator_slip_id = ls.id
            WHERE ls.status IN ('approved', 'verified', 'completed')
              AND (
                  (COALESCE(ls.departure_datetime, ls.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                  OR
                  (log.validated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
              )
              AND COALESCE(log.gate, 'main_gate') = $1
            ORDER BY
                CASE COALESCE(log.status, 'approved')
                    WHEN 'validated' THEN 0
                    WHEN 'approved' THEN 1
                    WHEN 'denied' THEN 2
                    ELSE 3
                END,
                COALESCE(log.validated_at, ls.approved_at, ls.updated_at, ls.created_at) DESC
            LIMIT $2`,
            [gate, limit]
        );

        return rows;
    }

    const { rows } = await pool.query(
        `SELECT
            ls.id AS locator_slip_id,
            ls.faculty_user_id,
            fu.full_name AS faculty_name,
            fu.profile_image_url AS faculty_profile_image_url,
            fu.employee_id,
            d.department_name,
            ls.destination,
            ls.purpose_of_travel,
            'main_gate'::text AS gate,
            'approved'::text AS monitoring_status,
            COALESCE(ls.approved_at, ls.updated_at, ls.created_at) AS status_timestamp
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         LEFT JOIN departments d ON d.id = fu.department_id
         WHERE (COALESCE(ls.departure_datetime, ls.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
           AND ls.status IN ('approved', 'verified', 'completed')
           AND $1 = 'main_gate'
         ORDER BY COALESCE(ls.approved_at, ls.updated_at, ls.created_at) DESC
         LIMIT $2`,
        [gate, limit]
    );

    return rows;
};

const findLocatorSlipByCode = async (locatorSlipCode) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();

    const logJoin = hasCssuExitLogsTable
        ? `LEFT JOIN cssu_exit_logs log ON log.locator_slip_id = ls.id`
        : `LEFT JOIN LATERAL (
            SELECT
                NULL::text AS gate,
                NULL::text AS status,
                NULL::text AS validation_method,
                NULL::timestamp AS validated_at
        ) log ON TRUE`;

    const { rows } = await pool.query(
        `SELECT
            fu.id AS faculty_user_id,
            fu.full_name,
            fu.profile_image_url AS faculty_profile_image_url,
            fu.employee_id,
            fu.department_position,
            fu.employment_type,
            d.department_name,
            ls.id AS locator_slip_id,
            ls.locator_slip_code,
            ls.destination,
            ls.purpose_of_travel,
            ls.status AS locator_slip_status,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.approved_at,
            ls.created_at,
            log.gate,
            log.status AS exit_status,
            log.validation_method,
            log.validated_at,
            log.notes AS exit_notes
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         LEFT JOIN departments d ON d.id = fu.department_id
         ${logJoin}
         WHERE ls.locator_slip_code = $1
         LIMIT 1`,
        [locatorSlipCode]
    );

    return rows[0] || null;
};

const findLocatorSlipForExitStatus = async (locatorSlipId) => {
    const { rows } = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            ls.status,
            log.status AS exit_status,
            log.notes AS exit_notes
         FROM locator_slips ls
         LEFT JOIN cssu_exit_logs log ON log.locator_slip_id = ls.id
         WHERE id = $1
         LIMIT 1`,
        [locatorSlipId]
    );

    return rows[0] || null;
};

const upsertExitLogStatus = async ({
    locatorSlipId,
    facultyUserId,
    gate,
    status,
    validationMethod,
    validatedBy,
    notes,
}) => {
    const { rows } = await pool.query(
        `INSERT INTO cssu_exit_logs (
            locator_slip_id,
            faculty_user_id,
            gate,
            status,
            validation_method,
            validated_at,
            validated_by,
            notes
        )
        VALUES (
            $1,
            $2,
            $3,
            $4::text,
            $5,
            CASE
                WHEN $4::text = 'approved' THEN NULL
                ELSE CURRENT_TIMESTAMP
            END,
            $6,
            $7
        )
        ON CONFLICT (locator_slip_id)
        DO UPDATE SET
            gate = EXCLUDED.gate,
            status = EXCLUDED.status,
            validation_method = EXCLUDED.validation_method,
            validated_at = EXCLUDED.validated_at,
            validated_by = EXCLUDED.validated_by,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [locatorSlipId, facultyUserId, gate, status, validationMethod, validatedBy, notes]
    );

    return rows[0];
};

const updateLocatorSlipCssuValidation = async ({
    locatorSlipId,
    cssuValidationStatus,
    cssuValidatedAt,
    cssuValidatedBy,
    cssuValidationNotes,
}) => {
    const hasValidationStatusColumn = await getLocatorSlipColumnExists('cssu_validation_status');
    const hasValidatedAtColumn = await getLocatorSlipColumnExists('cssu_validated_at');
    const hasValidatedByColumn = await getLocatorSlipColumnExists('cssu_validated_by');
    const hasValidationNotesColumn = await getLocatorSlipColumnExists('cssu_validation_notes');
    const assignments = [];
    const params = [locatorSlipId];
    let index = 2;

    if (hasValidationStatusColumn) {
        assignments.push(`cssu_validation_status = $${index}`);
        params.push(cssuValidationStatus);
        index += 1;
    }

    if (hasValidatedAtColumn) {
        assignments.push(`cssu_validated_at = $${index}`);
        params.push(cssuValidatedAt);
        index += 1;
    }

    if (hasValidatedByColumn) {
        assignments.push(`cssu_validated_by = $${index}`);
        params.push(cssuValidatedBy);
        index += 1;
    }

    if (hasValidationNotesColumn) {
        assignments.push(`cssu_validation_notes = $${index}`);
        params.push(cssuValidationNotes);
        index += 1;
    }

    if (assignments.length === 0) {
        return null;
    }

    assignments.push('updated_at = CURRENT_TIMESTAMP');

    const { rows } = await pool.query(
        `UPDATE locator_slips
         SET ${assignments.join(', ')}
         WHERE id = $1
         RETURNING *`,
        params
    );

    return rows[0] || null;
};

module.exports = {
    CSSU_FLAG_INCIDENT_NOTE_PREFIX,
    getDashboardSummary,
    getIncidentOverview,
    getLiveExitMonitoring,
    getNotificationsOverview,
    getReportsSummary,
    getReportsActivityByDepartment,
    getReportsMovementLogs,
    findLocatorSlipByCode,
    findLocatorSlipForExitStatus,
    upsertExitLogStatus,
    updateLocatorSlipCssuValidation,
};
