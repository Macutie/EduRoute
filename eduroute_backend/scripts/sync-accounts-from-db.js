const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const ACCOUNT_TABLES = ['departments', 'faculty_users', 'faculty_permission_preferences'];

const parseDatabaseUrl = (value) => {
    try {
        return new URL(value);
    } catch (error) {
        return null;
    }
};

const isLocalDatabase = (databaseUrl) => {
    const parsed = parseDatabaseUrl(databaseUrl);
    return parsed && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
};

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getColumns = async (pool, tableName) => {
    const { rows } = await pool.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
        `,
        [tableName]
    );

    return rows.map((row) => row.column_name);
};

const getSharedColumns = async (sourcePool, targetPool, tableName) => {
    const [sourceColumns, targetColumns] = await Promise.all([
        getColumns(sourcePool, tableName),
        getColumns(targetPool, tableName)
    ]);
    const targetColumnSet = new Set(targetColumns);
    return sourceColumns.filter((column) => targetColumnSet.has(column));
};

const selectRows = async (pool, tableName, columns) => {
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const { rows } = await pool.query(`SELECT ${columnSql} FROM ${quoteIdentifier(tableName)}`);
    return rows;
};

const upsertRows = async (client, tableName, columns, conflictColumns, rows) => {
    if (!rows.length) {
        return 0;
    }

    const columnSql = columns.map(quoteIdentifier).join(', ');
    const conflictSql = conflictColumns.map(quoteIdentifier).join(', ');
    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    const updateSql = updateColumns.length
        ? updateColumns
            .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
            .join(', ')
        : conflictColumns.map((column) => `${quoteIdentifier(column)} = ${quoteIdentifier(tableName)}.${quoteIdentifier(column)}`).join(', ');

    for (const row of rows) {
        const values = columns.map((column) => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
            `
            INSERT INTO ${quoteIdentifier(tableName)} (${columnSql})
            VALUES (${placeholders})
            ON CONFLICT (${conflictSql})
            DO UPDATE SET ${updateSql}
            `,
            values
        );
    }

    return rows.length;
};

const syncDepartments = async (sourcePool, targetClient) => {
    const columns = await getSharedColumns(sourcePool, targetClient, 'departments');
    const rows = await selectRows(sourcePool, 'departments', columns);
    const count = await upsertRows(targetClient, 'departments', columns, ['id'], rows);

    await targetClient.query(`
        SELECT setval(
            pg_get_serial_sequence('departments', 'id'),
            COALESCE((SELECT MAX(id) FROM departments), 1),
            true
        )
    `);

    return count;
};

const clearConflictingLocalAccounts = async (targetClient, sourceFacultyRows) => {
    for (const user of sourceFacultyRows) {
        await targetClient.query(
            `
            DELETE FROM faculty_users
            WHERE id <> $1
              AND (
                LOWER(email) = LOWER($2)
                OR employee_id = $3
              )
            `,
            [user.id, user.email, user.employee_id]
        );
    }
};

const syncFacultyUsers = async (sourcePool, targetClient) => {
    const columns = await getSharedColumns(sourcePool, targetClient, 'faculty_users');
    const rows = await selectRows(sourcePool, 'faculty_users', columns);
    await clearConflictingLocalAccounts(targetClient, rows);
    return upsertRows(targetClient, 'faculty_users', columns, ['id'], rows);
};

const syncPermissionPreferences = async (sourcePool, targetClient) => {
    const columns = await getSharedColumns(sourcePool, targetClient, 'faculty_permission_preferences');
    const rows = await selectRows(sourcePool, 'faculty_permission_preferences', columns);
    return upsertRows(targetClient, 'faculty_permission_preferences', columns, ['faculty_user_id'], rows);
};

const main = async () => {
    const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL;
    const targetDatabaseUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

    if (!sourceDatabaseUrl) {
        throw new Error('SOURCE_DATABASE_URL is required. Use your deployed PostgreSQL connection URL as the read-only source.');
    }

    if (!targetDatabaseUrl) {
        throw new Error('TARGET_DATABASE_URL or DATABASE_URL is required for the local database.');
    }

    if (!isLocalDatabase(targetDatabaseUrl)) {
        throw new Error('Refusing to write to a non-local target database. This sync is hard-locked to localhost targets only.');
    }

    const sourcePool = new Pool({
        connectionString: sourceDatabaseUrl,
        ssl: process.env.SOURCE_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    const targetPool = new Pool({ connectionString: targetDatabaseUrl });
    const targetClient = await targetPool.connect();

    try {
        await sourcePool.query('SELECT 1');
        await targetClient.query('SELECT 1');

        await targetClient.query('BEGIN');
        const departmentCount = await syncDepartments(sourcePool, targetClient);
        const facultyUserCount = await syncFacultyUsers(sourcePool, targetClient);
        const permissionCount = await syncPermissionPreferences(sourcePool, targetClient);
        await targetClient.query('COMMIT');

        console.log('Account sync completed.');
        console.log(JSON.stringify({
            copiedTables: ACCOUNT_TABLES,
            departments: departmentCount,
            facultyUsers: facultyUserCount,
            permissionPreferences: permissionCount
        }, null, 2));
    } catch (error) {
        await targetClient.query('ROLLBACK');
        throw error;
    } finally {
        targetClient.release();
        await sourcePool.end();
        await targetPool.end();
    }
};

main().catch((error) => {
    console.error(`Account sync failed: ${error.message}`);
    process.exit(1);
});
