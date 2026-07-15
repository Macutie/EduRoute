const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { signAccessToken } = require('../utils/jwt');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');
const { generateResetCode, hashResetCode, compareResetCode } = require('../utils/resetCode');
const { sendResetCodeEmail } = require('./email.service');
const cloudinary = require('../config/cloudinary');
const { optimizeImage } = require('./imageOptimization.service');
const { encryptNullableText } = require('../utils/fieldEncryption');

const ROLE_LABELS = {
    faculty: 'Faculty',
    hrmu: 'HRMU',
    cssu: 'CSSU',
    admin: 'Admin',
    assistant_dean: 'Assistant Dean',
    college_dean: 'College Dean'
};

const getDepartments = async () => {
    const query = `
    SELECT id, department_name
    FROM departments
    ORDER BY department_name ASC
  `;

    const { rows } = await pool.query(query);
    return rows;
};

const sanitizeFaculty = (faculty) => ({
    id: faculty.id,
    full_name: faculty.full_name,
    employee_id: faculty.employee_id,
    email: faculty.email,
    account_role: faculty.account_role,
    status: faculty.status,
    department_id: faculty.department_id,
    department_name: faculty.department_name,
    profile_image_url: faculty.profile_image_url,
    last_login_at: faculty.last_login_at,
    created_at: faculty.created_at
});

const encryptAuthField = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    return encryptNullableText(String(value));
};

const buildEncryptedAuthProfile = (faculty) => ({
    id: encryptAuthField(faculty.id),
    full_name: encryptAuthField(faculty.full_name),
    employee_id: encryptAuthField(faculty.employee_id),
    email: encryptAuthField(faculty.email),
    department_id: encryptAuthField(faculty.department_id),
    department_name: encryptAuthField(faculty.department_name),
    profile_image_url: encryptAuthField(faculty.profile_image_url),
    last_login_at: encryptAuthField(faculty.last_login_at),
    created_at: encryptAuthField(faculty.created_at)
});

const sanitizeAuthSession = (faculty) => ({
    account_role: faculty.account_role,
    encrypted_profile: buildEncryptedAuthProfile(faculty)
});

const registerFaculty = async (payload) => {
    const client = await pool.connect();

    try {
        const accountRole = payload.account_role || 'faculty';
        if (accountRole !== 'faculty') {
            throw new AppError(
                'Self-registration is limited to faculty accounts. HRMU, CSSU, and Dean accounts must be assigned by an authorized administrator.',
                403
            );
        }
        const fullName = payload.full_name.trim();
        const employeeId = payload.employee_id.trim();
        const departmentId = Number(payload.department_id);
        const email = payload.email.trim().toLowerCase();
        const password = payload.password;
        const termsAccepted = payload.terms_accepted === true;

        const passwordCheck = validatePasswordPolicy({
            password,
            fullName,
            employeeId,
            email
        });

        if (!passwordCheck.isValid) {
            throw new AppError('Password policy validation failed', 422, passwordCheck.errors);
        }

        await client.query('BEGIN');

        let department = null;

        if (departmentId) {
            const departmentResult = await client.query(
                'SELECT id, department_name FROM departments WHERE id = $1',
                [departmentId]
            );

            if (departmentResult.rowCount === 0) {
                throw new AppError('Selected department does not exist.', 404);
            }

            department = departmentResult.rows[0];
        }

        const duplicateEmail = await client.query(
            'SELECT id FROM faculty_users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (duplicateEmail.rowCount > 0) {
            throw new AppError('Email is already registered.', 409);
        }

        const duplicateEmployee = await client.query(
            'SELECT id FROM faculty_users WHERE employee_id = $1',
            [employeeId]
        );

        if (duplicateEmployee.rowCount > 0) {
            throw new AppError('Employee ID is already registered.', 409);
        }

        const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

        const insertResult = await client.query(
            `INSERT INTO faculty_users (
        full_name,
        employee_id,
        department_id,
        email,
        password_hash,
        account_role,
        terms_accepted
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, full_name, employee_id, department_id, email, account_role, status, created_at, last_login_at`,
            [fullName, employeeId, departmentId, email, passwordHash, accountRole, termsAccepted]
        );

        const registeredFaculty = {
            ...insertResult.rows[0],
            department_name: department?.department_name || null
        };
        const responsePayload = sanitizeAuthSession(registeredFaculty);

        await client.query('COMMIT');

        return responsePayload;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

const loginFaculty = async ({ email_or_employee_id, password, portal_role = 'faculty' }) => {
    const identifier = email_or_employee_id.trim();
    const selectedPortalRole = portal_role || 'faculty';

    const query = `
    SELECT
      fu.id,
      fu.full_name,
      fu.employee_id,
      fu.email,
      fu.password_hash,
      fu.account_role,
      fu.status,
      fu.department_id,
      fu.profile_image_url,
      fu.profile_image_public_id,
      fu.last_login_at,
      fu.created_at,
      d.department_name
    FROM faculty_users fu
    LEFT JOIN departments d ON d.id = fu.department_id
    WHERE LOWER(fu.email) = LOWER($1)
       OR fu.employee_id = $1
    LIMIT 1
  `;

    const { rows, rowCount } = await pool.query(query, [identifier]);

    if (rowCount === 0) {
        throw new AppError('Invalid credentials.', 401);
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
        throw new AppError('Invalid credentials.', 401);
    }

    if (user.status !== 'active') {
        throw new AppError('This account is not active.', 403);
    }

    const adminPortalDeanRoles = ['assistant_dean', 'college_dean'];
    const isDeanUsingAdminPortal = selectedPortalRole === 'admin' && adminPortalDeanRoles.includes(user.account_role);

    if (user.account_role !== selectedPortalRole && !isDeanUsingAdminPortal) {
        const actualRole = ROLE_LABELS[user.account_role] || user.account_role;
        const requestedRole = ROLE_LABELS[selectedPortalRole] || selectedPortalRole;
        throw new AppError(
            `Access denied. This account is registered for the ${actualRole} portal and cannot log in to the ${requestedRole} portal.`,
            403
        );
    }

    const updateResult = await pool.query(
        `UPDATE faculty_users
     SET last_login_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING last_login_at`,
        [user.id]
    );

    const token = signAccessToken({
        sub: user.id,
        role: user.account_role
    });

    return {
        token,
        user: sanitizeAuthSession({
            ...user,
            last_login_at: updateResult.rows[0]?.last_login_at || user.last_login_at
        })
    };
};

const getCurrentFaculty = async (facultyId) => {
    const query = `
    SELECT
      fu.id,
      fu.full_name,
      fu.employee_id,
      fu.email,
      fu.account_role,
      fu.status,
      fu.department_id,
      fu.profile_image_url,
      fu.profile_image_public_id,
      fu.last_login_at,
      fu.created_at,
      d.department_name
    FROM faculty_users fu
    LEFT JOIN departments d ON d.id = fu.department_id
    WHERE fu.id = $1
    LIMIT 1
  `;

    const { rows, rowCount } = await pool.query(query, [facultyId]);

    if (rowCount === 0) {
        throw new AppError('Faculty user not found.', 404);
    }

    return sanitizeFaculty(rows[0]);
};

const updateCurrentFacultyProfile = async (facultyId, payload) => {
    const fullName = payload.full_name.trim();
    const hasDepartmentUpdate = Object.prototype.hasOwnProperty.call(payload, 'department_id')
        && payload.department_id !== null
        && payload.department_id !== '';
    const departmentId = hasDepartmentUpdate ? Number(payload.department_id) : null;

    if (hasDepartmentUpdate) {
        const departmentResult = await pool.query(
            'SELECT id FROM departments WHERE id = $1',
            [departmentId]
        );

        if (departmentResult.rowCount === 0) {
            throw new AppError('Selected department does not exist.', 404);
        }
    }

    const updateParams = [facultyId, fullName];
    const departmentAssignment = hasDepartmentUpdate ? ', department_id = $3' : '';

    if (hasDepartmentUpdate) {
        updateParams.push(departmentId);
    }

    const updateResult = await pool.query(
        `UPDATE faculty_users
         SET full_name = $2
             ${departmentAssignment},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id`,
        updateParams
    );

    if (updateResult.rowCount === 0) {
        throw new AppError('Faculty user not found.', 404);
    }

    return getCurrentFaculty(facultyId);
};

const uploadToCloudinary = (optimizedImage, facultyId) =>
    new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'eduroute/faculty-profile-images',
                public_id: `faculty-${facultyId}-${Date.now()}`,
                overwrite: true,
                resource_type: 'image',
                format: optimizedImage.extension
            },
            (error, result) => {
                if (error) return reject(error);
                return resolve(result);
            }
        );

        uploadStream.end(optimizedImage.buffer);
    });

const updateCurrentFacultyProfileImage = async (facultyId, file) => {
    if (!file) {
        throw new AppError('Profile image is required.', 422);
    }

    const currentImageResult = await pool.query(
        'SELECT profile_image_public_id FROM faculty_users WHERE id = $1',
        [facultyId]
    );
    const optimizedImage = await optimizeImage(file, 'profile');
    const uploadResult = await uploadToCloudinary(optimizedImage, facultyId);

    await pool.query(
        `UPDATE faculty_users
         SET profile_image_url = $2,
             profile_image_public_id = $3,
             profile_image_mime_type = $4,
             profile_image_file_size = $5,
             profile_image_original_file_size = $6,
             profile_image_width = $7,
             profile_image_height = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
            facultyId,
            uploadResult.secure_url,
            uploadResult.public_id,
            optimizedImage.mimetype,
            optimizedImage.size,
            optimizedImage.original.size,
            optimizedImage.width,
            optimizedImage.height
        ]
    );

    const currentPublicId = currentImageResult.rows[0]?.profile_image_public_id;

    if (currentPublicId) {
        cloudinary.uploader.destroy(currentPublicId).catch((error) => {
            console.error('Failed to remove old Cloudinary profile image:', error.message);
        });
    }

    return getCurrentFaculty(facultyId);
};

const changeCurrentFacultyPassword = async (facultyId, payload) => {
    const userResult = await pool.query(
        `SELECT id, full_name, employee_id, email, password_hash, status
         FROM faculty_users
         WHERE id = $1
         LIMIT 1`,
        [facultyId]
    );

    if (userResult.rowCount === 0) {
        throw new AppError('Faculty user not found.', 404);
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
        throw new AppError('This account is not active.', 403);
    }

    const currentPasswordMatches = await bcrypt.compare(payload.current_password, user.password_hash);

    if (!currentPasswordMatches) {
        throw new AppError('Current password is incorrect.', 400);
    }

    const passwordCheck = validatePasswordPolicy({
        password: payload.new_password,
        fullName: user.full_name,
        employeeId: user.employee_id,
        email: user.email
    });

    if (!passwordCheck.isValid) {
        throw new AppError('Password policy validation failed', 422, passwordCheck.errors);
    }

    const sameAsCurrent = await bcrypt.compare(payload.new_password, user.password_hash);

    if (sameAsCurrent) {
        throw new AppError('New password must be different from the current password.', 422);
    }

    const newPasswordHash = await bcrypt.hash(payload.new_password, env.bcryptSaltRounds);

    await pool.query(
        `UPDATE faculty_users
         SET password_hash = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [facultyId, newPasswordHash]
    );
};

const getRecoveryEmailFailureMessage = (error) => {
    const message = String(error?.message || '');

    if (/BREVO_API_KEY is missing/i.test(message)) {
        return 'EduRoute password recovery is not configured. Please set BREVO_API_KEY in the backend environment.';
    }

    if (/EMAIL_FROM is missing/i.test(message)) {
        return 'EduRoute password recovery sender is not configured. Please set EMAIL_FROM in the backend environment.';
    }

    if (/sender|from|unauthorized|not verified|invalid api key|authentication|permission|Key not found/i.test(message)) {
        return 'EduRoute could not send the recovery PIN through Brevo. Please verify BREVO_API_KEY and that EMAIL_FROM is a verified Brevo sender.';
    }

    return 'EduRoute could not send the recovery PIN right now. Please try again later or contact the IT Support Desk.';
};

const forgotPassword = async ({ email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const userResult = await pool.query(
        'SELECT id, full_name, email, status FROM faculty_users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [normalizedEmail]
    );

    if (userResult.rowCount === 0) {
        return;
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
        return;
    }

    const resetCode = generateResetCode();
    const resetCodeHash = await hashResetCode(resetCode);
    const expiresAt = new Date(Date.now() + env.resetCodeTtlMinutes * 60 * 1000);

    await pool.query(
        `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE faculty_user_id = $1 AND used_at IS NULL`,
        [user.id]
    );

    await pool.query(
        `INSERT INTO password_reset_tokens (faculty_user_id, reset_code_hash, expires_at, attempts)
     VALUES ($1, $2, $3, 0)`,
        [user.id, resetCodeHash, expiresAt]
    );

    try {
        await sendResetCodeEmail({
            to: user.email,
            fullName: user.full_name,
            resetCode
        });
    } catch (error) {
        console.error('Failed to send password reset email:', error);
        throw new AppError(getRecoveryEmailFailureMessage(error), 503);
    }
};

const verifyResetCode = async ({ email, reset_code }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const code = reset_code.trim();

    const query = `
    SELECT
      prt.id,
      prt.faculty_user_id,
      prt.reset_code_hash,
      prt.expires_at,
      prt.used_at,
      COALESCE(prt.attempts, 0) AS attempts,
      fu.email,
      fu.status
    FROM password_reset_tokens prt
    JOIN faculty_users fu ON fu.id = prt.faculty_user_id
    WHERE LOWER(fu.email) = LOWER($1)
      AND prt.used_at IS NULL
    ORDER BY prt.created_at DESC
    LIMIT 1
  `;

    const { rows, rowCount } = await pool.query(query, [normalizedEmail]);

    if (rowCount === 0) {
        throw new AppError('Invalid or expired reset PIN.', 400);
    }

    const tokenRecord = rows[0];

    if (tokenRecord.status !== 'active') {
        throw new AppError('This account is not active.', 403);
    }

    if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
        throw new AppError('Reset PIN has expired.', 400);
    }

    if (Number(tokenRecord.attempts || 0) >= 5) {
        throw new AppError('Too many invalid reset PIN attempts. Please request a new PIN.', 429);
    }

    const codeMatches = await compareResetCode(code, tokenRecord.reset_code_hash);

    if (!codeMatches) {
        await pool.query(
            `UPDATE password_reset_tokens
             SET attempts = COALESCE(attempts, 0) + 1
             WHERE id = $1`,
            [tokenRecord.id]
        );
        throw new AppError('Invalid or expired reset PIN.', 400);
    }

    return { verified: true };
};

const resetPassword = async ({ email, reset_code, new_password }) => {
    const client = await pool.connect();

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const code = reset_code.trim();

        await client.query('BEGIN');

        const userResult = await client.query(
            `SELECT fu.id, fu.full_name, fu.employee_id, fu.email, fu.status
       FROM faculty_users fu
       WHERE LOWER(fu.email) = LOWER($1)
       LIMIT 1`,
            [normalizedEmail]
        );

        if (userResult.rowCount === 0) {
            throw new AppError('Invalid reset request.', 400);
        }

        const user = userResult.rows[0];

        if (user.status !== 'active') {
            throw new AppError('This account is not active.', 403);
        }

        const passwordCheck = validatePasswordPolicy({
            password: new_password,
            fullName: user.full_name,
            employeeId: user.employee_id,
            email: user.email
        });

        if (!passwordCheck.isValid) {
            throw new AppError('Password policy validation failed', 422, passwordCheck.errors);
        }

        const tokenResult = await client.query(
            `SELECT id, faculty_user_id, reset_code_hash, expires_at, used_at, COALESCE(attempts, 0) AS attempts
       FROM password_reset_tokens
       WHERE faculty_user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
            [user.id]
        );

        if (tokenResult.rowCount === 0) {
        throw new AppError('Invalid or expired reset PIN.', 400);
        }

        const tokenRecord = tokenResult.rows[0];

        if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
            throw new AppError('Reset PIN has expired.', 400);
        }

        if (Number(tokenRecord.attempts || 0) >= 5) {
            throw new AppError('Too many invalid reset PIN attempts. Please request a new PIN.', 429);
        }

        const codeMatches = await compareResetCode(code, tokenRecord.reset_code_hash);

        if (!codeMatches) {
            await client.query(
                `UPDATE password_reset_tokens
                 SET attempts = COALESCE(attempts, 0) + 1
                 WHERE id = $1`,
                [tokenRecord.id]
            );
            throw new AppError('Invalid or expired reset PIN.', 400);
        }

        const newPasswordHash = await bcrypt.hash(new_password, env.bcryptSaltRounds);

        await client.query(
            `UPDATE faculty_users
       SET password_hash = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(email) = LOWER($1)`,
            [normalizedEmail, newPasswordHash]
        );

        await client.query(
            `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE faculty_user_id = $1 AND used_at IS NULL`,
            [user.id]
        );

        await client.query('COMMIT');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    getDepartments,
    registerFaculty,
    loginFaculty,
    getCurrentFaculty,
    updateCurrentFacultyProfile,
    updateCurrentFacultyProfileImage,
    changeCurrentFacultyPassword,
    forgotPassword,
    verifyResetCode,
    resetPassword
};
