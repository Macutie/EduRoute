const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');

const ADMIN_EMAIL = 'admin.eduroute.system@gmail.com';
const ADMIN_ROLES = new Set(['faculty', 'hrmu', 'cssu', 'college_dean', 'admin']);

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const isAllowedEmail = email => email === ADMIN_EMAIL || email.endsWith('@gordoncollege.edu.ph');

const sanitizeUser = user => ({
    id: user.id,
    full_name: user.full_name,
    employee_id: user.employee_id,
    email: user.email,
    account_role: user.account_role,
    status: user.status,
    department_id: user.department_id,
    department_name: user.department_name || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at || null
});

const getUserById = async id => {
    const { rows, rowCount } = await pool.query(
        `SELECT fu.id, fu.full_name, fu.employee_id, fu.email, fu.account_role,
                fu.status, fu.department_id, fu.created_at, fu.updated_at,
                fu.last_login_at, d.department_name
         FROM faculty_users fu
         LEFT JOIN departments d ON d.id = fu.department_id
         WHERE fu.id = $1
         LIMIT 1`,
        [id]
    );

    if (!rowCount) throw new AppError('User account not found.', 404);
    return sanitizeUser(rows[0]);
};

const listUsers = async ({ search = '', role = '', status = '' } = {}) => {
    const params = [];
    const clauses = [];
    const normalizedSearch = String(search || '').trim();

    if (normalizedSearch) {
        params.push(`%${normalizedSearch.toLowerCase()}%`);
        clauses.push(`(LOWER(fu.full_name) LIKE $${params.length}
            OR LOWER(fu.email) LIKE $${params.length}
            OR LOWER(fu.employee_id) LIKE $${params.length})`);
    }
    if (role && ADMIN_ROLES.has(role)) {
        params.push(role);
        clauses.push(`fu.account_role = $${params.length}`);
    }
    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
        params.push(status);
        clauses.push(`fu.status = $${params.length}`);
    }

    const { rows } = await pool.query(
        `SELECT fu.id, fu.full_name, fu.employee_id, fu.email, fu.account_role,
                fu.status, fu.department_id, fu.created_at, fu.updated_at,
                fu.last_login_at, d.department_name
         FROM faculty_users fu
         LEFT JOIN departments d ON d.id = fu.department_id
         ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY fu.created_at DESC, fu.full_name ASC`,
        params
    );

    return rows.map(sanitizeUser);
};

const assertDepartment = async departmentId => {
    if (departmentId === null || departmentId === undefined || departmentId === '') return null;
    const normalizedId = Number(departmentId);
    if (!Number.isInteger(normalizedId) || normalizedId < 1) {
        throw new AppError('A valid department is required.', 422);
    }
    const { rows } = await pool.query('SELECT id FROM departments WHERE id = $1', [normalizedId]);
    if (!rows.length) throw new AppError('Selected department does not exist.', 404);
    return normalizedId;
};

const assertPayload = async (payload, { requirePassword = true } = {}) => {
    const fullName = String(payload.full_name || '').trim();
    const employeeId = String(payload.employee_id || '').trim();
    const email = normalizeEmail(payload.email);
    const role = String(payload.account_role || '').trim();
    const status = String(payload.status || 'active').trim();

    if (!fullName) throw new AppError('Full name is required.', 422);
    if (!employeeId) throw new AppError('Employee ID is required.', 422);
    if (!email || !email.includes('@') || !isAllowedEmail(email)) {
        throw new AppError(`Accounts must use @gordoncollege.edu.ph. Only ${ADMIN_EMAIL} may use a different domain.`, 422);
    }
    if (!ADMIN_ROLES.has(role)) throw new AppError('Invalid account role.', 422);
    if (!['active', 'inactive', 'suspended'].includes(status)) throw new AppError('Invalid account status.', 422);
    const departmentId = await assertDepartment(payload.department_id);
    if ((role === 'faculty' || role === 'college_dean') && !departmentId) {
        throw new AppError('A department is required for this account role.', 422);
    }
    if (requirePassword) {
        if (!payload.password) throw new AppError('Password is required.', 422);
        if (payload.password !== payload.confirm_password) throw new AppError('Password confirmation does not match.', 422);
        const passwordCheck = validatePasswordPolicy({ password: payload.password, fullName, employeeId, email });
        if (!passwordCheck.isValid) throw new AppError('Password policy validation failed.', 422, passwordCheck.errors);
    }

    return { fullName, employeeId, email, role, status, departmentId };
};

const assertUnique = async ({ email, employeeId, excludeId = null }) => {
    const { rows } = await pool.query(
        `SELECT id, email, employee_id FROM faculty_users
         WHERE (LOWER(email) = LOWER($1) OR employee_id = $2)
           AND ($3::uuid IS NULL OR id <> $3::uuid)
         LIMIT 1`,
        [email, employeeId, excludeId]
    );
    if (!rows.length) return;
    if (String(rows[0].email).toLowerCase() === email) throw new AppError('Email is already registered.', 409);
    throw new AppError('Employee ID is already registered.', 409);
};

const createUser = async payload => {
    const data = await assertPayload(payload);
    await assertUnique(data);
    const passwordHash = await bcrypt.hash(payload.password, env.bcryptSaltRounds);
    const { rows } = await pool.query(
        `INSERT INTO faculty_users
            (full_name, employee_id, department_id, email, password_hash, account_role, status, terms_accepted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING id`,
        [data.fullName, data.employeeId, data.departmentId, data.email, passwordHash, data.role, data.status]
    );
    return getUserById(rows[0].id);
};

const updateUser = async (id, payload) => {
    const data = await assertPayload(payload, { requirePassword: false });
    await assertUnique({ ...data, excludeId: id });
    const { rowCount } = await pool.query(
        `UPDATE faculty_users
         SET full_name = $2, employee_id = $3, department_id = $4,
             account_role = $5, status = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, data.fullName, data.employeeId, data.departmentId, data.role, data.status]
    );
    if (!rowCount) throw new AppError('User account not found.', 404);
    return getUserById(id);
};

const updateStatus = async (id, status, currentAdminId) => {
    if (!['active', 'inactive', 'suspended'].includes(status)) throw new AppError('Invalid account status.', 422);
    if (String(id) === String(currentAdminId) && status !== 'active') {
        throw new AppError('You cannot deactivate your own admin account.', 422);
    }
    const { rowCount } = await pool.query(
        `UPDATE faculty_users SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, status]
    );
    if (!rowCount) throw new AppError('User account not found.', 404);
    return getUserById(id);
};

const resetPassword = async (id, payload) => {
    const user = await getUserById(id);
    if (!payload.password || payload.password !== payload.confirm_password) {
        throw new AppError('Password confirmation does not match.', 422);
    }
    const passwordCheck = validatePasswordPolicy({ password: payload.password, fullName: user.full_name, employeeId: user.employee_id, email: user.email });
    if (!passwordCheck.isValid) throw new AppError('Password policy validation failed.', 422, passwordCheck.errors);
    const passwordHash = await bcrypt.hash(payload.password, env.bcryptSaltRounds);
    await pool.query('UPDATE faculty_users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id, passwordHash]);
    return getUserById(id);
};

module.exports = { ADMIN_EMAIL, listUsers, createUser, updateUser, updateStatus, resetPassword };
