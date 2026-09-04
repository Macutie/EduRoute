const pool = require('../db/pool');

const ROLE_LABELS = {
    faculty: 'Employee',
    cssu: 'ISSU',
    hrmu: 'HRMU',
    assistant_dean: 'Assistant dean',
    college_dean: 'College dean',
    admin: 'Admin'
};

const formatStatus = (status) => String(status || '').replace(/_/g, ' ');

const getDashboard = async () => {
    const [accountResult, slipResult, activityResult] = await Promise.all([
        pool.query(`
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE account_role = 'faculty')::int AS employees,
                COUNT(*) FILTER (WHERE account_role = 'cssu')::int AS issu,
                COUNT(*) FILTER (WHERE account_role = 'hrmu')::int AS hrmu,
                COUNT(*) FILTER (WHERE account_role IN ('assistant_dean', 'college_dean'))::int AS supervisors,
                COUNT(*) FILTER (WHERE status <> 'active')::int AS deactivated
            FROM faculty_users
        `),
        pool.query(`
            SELECT
                COUNT(*)::int AS total_filed,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
                COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
                COUNT(*) FILTER (
                    WHERE status IN ('approved', 'completed')
                      AND COALESCE(approved_at, updated_at, created_at)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                )::int AS approved_today,
                COUNT(*) FILTER (
                    WHERE status = 'completed'
                      AND updated_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                )::int AS completed_today
            FROM locator_slips
        `),
        pool.query(`
            SELECT
                ls.id,
                fu.full_name,
                fu.employee_id,
                ls.destination,
                COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
                ls.status,
                ls.created_at,
                d.department_name
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            LEFT JOIN departments d ON d.id = COALESCE(ls.college_id, fu.department_id)
            ORDER BY ls.created_at DESC
            LIMIT 8
        `)
    ]);

    const accounts = accountResult.rows[0] || {};
    const slips = slipResult.rows[0] || {};

    return {
        accounts: {
            totalUsers: Number(accounts.total_users || 0),
            employees: Number(accounts.employees || 0),
            issu: Number(accounts.issu || 0),
            hrmu: Number(accounts.hrmu || 0),
            supervisors: Number(accounts.supervisors || 0),
            deactivated: Number(accounts.deactivated || 0)
        },
        locatorSlips: {
            totalFiled: Number(slips.total_filed || 0),
            pending: Number(slips.pending || 0),
            approved: Number(slips.approved || 0),
            rejected: Number(slips.rejected || 0),
            completed: Number(slips.completed || 0),
            cancelled: Number(slips.cancelled || 0),
            approvedToday: Number(slips.approved_today || 0),
            completedToday: Number(slips.completed_today || 0)
        },
        recentActivity: activityResult.rows.map((row) => ({
            id: row.id,
            employeeName: row.full_name,
            employeeId: row.employee_id,
            department: row.department_name || 'No department assigned',
            destination: row.destination,
            purpose: row.purpose,
            status: formatStatus(row.status),
            statusKey: row.status,
            createdAt: row.created_at
        })),
        roleLabels: ROLE_LABELS
    };
};

module.exports = { getDashboard };
