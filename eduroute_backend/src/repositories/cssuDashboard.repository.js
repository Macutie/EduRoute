const pool = require('../db/pool');

let cssuExitLogsTableExistsCache = null;

const getCssuExitLogsTableExists = async () => {
    if (cssuExitLogsTableExistsCache !== null) {
        return cssuExitLogsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.cssu_exit_logs') AS table_name`);
    cssuExitLogsTableExistsCache = Boolean(rows[0]?.table_name);
    return cssuExitLogsTableExistsCache;
};

const getDashboardSummary = async () => {
    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE ls.status IN ('approved', 'verified', 'rejected'))::int AS total_faculty_exiting,
            COUNT(*) FILTER (WHERE ls.status IN ('approved', 'verified'))::int AS approved_locator_slips,
            COUNT(*) FILTER (WHERE ls.status = 'rejected')::int AS rejected_locator_slips
         FROM locator_slips ls
         WHERE COALESCE(ls.departure_datetime::date, ls.created_at::date) = CURRENT_DATE`
    );

    return rows[0] || {
        total_faculty_exiting: 0,
        approved_locator_slips: 0,
        rejected_locator_slips: 0,
    };
};

const getLiveExitMonitoring = async (gate = 'main_gate', limit = 20) => {
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();

    if (hasCssuExitLogsTable) {
        const { rows } = await pool.query(
            `WITH approved_slips AS (
                SELECT
                    ls.id AS locator_slip_id,
                    ls.faculty_user_id,
                    fu.full_name AS faculty_name,
                    fu.employee_id,
                    d.department_name,
                    ls.destination,
                    ls.purpose_of_travel,
                    ls.departure_datetime,
                    ls.expected_return_datetime,
                    ls.approved_at,
                    ls.updated_at,
                    ls.created_at
                FROM locator_slips ls
                JOIN faculty_users fu ON fu.id = ls.faculty_user_id
                LEFT JOIN departments d ON d.id = fu.department_id
                WHERE COALESCE(ls.departure_datetime::date, ls.created_at::date) = CURRENT_DATE
                  AND ls.status IN ('approved', 'verified')
            )
            SELECT
                slip.locator_slip_id,
                slip.faculty_user_id,
                slip.faculty_name,
                slip.employee_id,
                slip.department_name,
                slip.destination,
                slip.purpose_of_travel,
                COALESCE(log.gate, 'main_gate') AS gate,
                COALESCE(log.status, 'approved') AS monitoring_status,
                COALESCE(log.validated_at, slip.approved_at, slip.updated_at, slip.created_at) AS status_timestamp
            FROM approved_slips slip
            LEFT JOIN cssu_exit_logs log ON log.locator_slip_id = slip.locator_slip_id
            WHERE COALESCE(log.gate, 'main_gate') = $1
            ORDER BY
                CASE COALESCE(log.status, 'approved')
                    WHEN 'validated' THEN 0
                    WHEN 'approved' THEN 1
                    WHEN 'denied' THEN 2
                    ELSE 3
                END,
                COALESCE(log.validated_at, slip.approved_at, slip.updated_at, slip.created_at) DESC
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
         WHERE COALESCE(ls.departure_datetime::date, ls.created_at::date) = CURRENT_DATE
           AND ls.status IN ('approved', 'verified')
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
            log.validated_at
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
        `SELECT id, faculty_user_id, status
         FROM locator_slips
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
    const validatedAt = status === 'approved' ? null : new Date().toISOString();

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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        [locatorSlipId, facultyUserId, gate, status, validationMethod, validatedAt, validatedBy, notes]
    );

    return rows[0];
};

module.exports = {
    getDashboardSummary,
    getLiveExitMonitoring,
    findLocatorSlipByCode,
    findLocatorSlipForExitStatus,
    upsertExitLogStatus,
};
