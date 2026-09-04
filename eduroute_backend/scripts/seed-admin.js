require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../src/db/pool');
const env = require('../src/config/env');

const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin.eduroute.system@gmail.com';
const password = process.env.DEFAULT_ADMIN_PASSWORD;

if (!password) {
    throw new Error('DEFAULT_ADMIN_PASSWORD must be set before running the admin seed.');
}

(async () => {
    const existing = await pool.query('SELECT id FROM faculty_users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (existing.rowCount) {
        console.log(`Admin account already exists for ${email}; no changes made.`);
        return;
    }
    const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
    await pool.query(
        `INSERT INTO faculty_users (full_name, employee_id, email, password_hash, account_role, status, terms_accepted)
         VALUES ($1, $2, $3, $4, 'admin', 'active', TRUE)`,
        ['EduRoute System Administrator', 'ADMIN-001', email, passwordHash]
    );
    console.log(`Default admin account created for ${email}.`);
})()
    .catch(error => { console.error('Admin seed failed:', error); process.exitCode = 1; })
    .finally(() => pool.end());
