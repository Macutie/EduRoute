const pool = require('../db/pool');

const mapUserRow = (row) => ({
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    email: row.email,
    role: row.account_role,
    collegeId: row.department_id || null,
    collegeName: row.department_name || null
});

const getUsersByIds = async (userIds, client = pool) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
    }

    const { rows } = await client.query(
        `SELECT fu.*, d.department_name
         FROM faculty_users fu
         LEFT JOIN departments d ON d.id = fu.department_id
         WHERE fu.id = ANY($1::uuid[])`,
        [userIds]
    );

    return rows.map(mapUserRow);
};

const getFacultyUserById = async (userId, client = pool) => {
    const users = await getUsersByIds([userId], client);
    return users[0] || null;
};

const getDeanUsersByCollegeId = async (collegeId, client = pool) => {
    const { rows } = await client.query(
        `SELECT fu.*, d.department_name
         FROM faculty_users fu
         LEFT JOIN departments d ON d.id = fu.department_id
         WHERE fu.department_id = $1
           AND fu.account_role = ANY($2::text[])
           AND fu.status = 'active'
         ORDER BY fu.full_name ASC`,
        [collegeId, ['assistant_dean', 'college_dean']]
    );

    return rows.map(mapUserRow);
};

const getActiveUsersByRoles = async (roles = [], client = pool) => {
    if (!Array.isArray(roles) || roles.length === 0) {
        return [];
    }

    const { rows } = await client.query(
        `SELECT fu.*, d.department_name
         FROM faculty_users fu
         LEFT JOIN departments d ON d.id = fu.department_id
         WHERE fu.account_role = ANY($1::text[])
           AND fu.status = 'active'
         ORDER BY fu.full_name ASC`,
        [roles]
    );

    return rows.map(mapUserRow);
};

module.exports = {
    getUsersByIds,
    getFacultyUserById,
    getDeanUsersByCollegeId,
    getActiveUsersByRoles
};
