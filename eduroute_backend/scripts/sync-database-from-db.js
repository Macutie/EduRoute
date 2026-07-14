const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const SYNC_TABLE_ORDER = [
    'departments',
    'faculty_users',
    'faculty_permission_preferences',
    'dean_signature_settings',
    'locator_slips',
    'locator_slip_dean_signatures',
    'locator_slip_location_verifications',
    'trips',
    'latest_locations',
    'trip_location_logs',
    'cssu_exit_logs',
    'notifications',
    'password_reset_tokens',
    'faculty_trips',
    'faculty_trip_events',
    'arrival_verifications',
    'user_push_tokens',
    'hrmu_report_inbox'
];

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

const getSharedTableSet = async (sourcePool, targetClient) => {
    const fetchTables = async (client) => {
        const { rows } = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
        `);
        return new Set(rows.map((row) => row.table_name));
    };

    const [sourceTables, targetTables] = await Promise.all([
        fetchTables(sourcePool),
        fetchTables(targetClient)
    ]);

    return new Set([...sourceTables].filter((tableName) => targetTables.has(tableName)));
};

const getColumns = async (client, tableName) => {
    const { rows } = await client.query(
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

const getSharedColumns = async (sourcePool, targetClient, tableName) => {
    const [sourceColumns, targetColumns] = await Promise.all([
        getColumns(sourcePool, tableName),
        getColumns(targetClient, tableName)
    ]);
    const targetColumnSet = new Set(targetColumns);
    return sourceColumns.filter((column) => targetColumnSet.has(column));
};

const selectRows = async (client, tableName, columns) => {
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const { rows } = await client.query(`SELECT ${columnSql} FROM ${quoteIdentifier(tableName)}`);
    return rows;
};

const insertRows = async (targetClient, tableName, columns, rows) => {
    if (!rows.length) {
        return 0;
    }

    const columnSql = columns.map(quoteIdentifier).join(', ');

    for (const row of rows) {
        const values = columns.map((column) => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await targetClient.query(
            `
            INSERT INTO ${quoteIdentifier(tableName)} (${columnSql})
            VALUES (${placeholders})
            `,
            values
        );
    }

    return rows.length;
};

const APPROVAL_DESTINATION_PATTERN = /^Your locator slip to (.+) has been approved\.$/i;

const extractDestinationFromNotification = (message) => {
    const normalizedMessage = String(message || '').trim();
    const match = normalizedMessage.match(APPROVAL_DESTINATION_PATTERN);
    return match?.[1]?.trim() || null;
};

const repairPinnedDestinations = async (targetClient) => {
    const { rows } = await targetClient.query(`
        SELECT
            ls.id AS locator_slip_id,
            t.id AS trip_id,
            n.message AS approval_message
        FROM locator_slips ls
        LEFT JOIN LATERAL (
            SELECT id
            FROM trips
            WHERE locator_slip_id = ls.id
            ORDER BY created_at DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT message
            FROM notifications
            WHERE locator_slip_id = ls.id
              AND title = 'Locator Slip Approved'
            ORDER BY created_at ASC
            LIMIT 1
        ) n ON TRUE
        WHERE ls.destination ILIKE 'Pinned location%'
    `);

    let repairedLocatorSlips = 0;
    let repairedTrips = 0;

    for (const row of rows) {
        const recoveredDestination = extractDestinationFromNotification(row.approval_message);
        if (!recoveredDestination) {
            continue;
        }

        const locatorSlipResult = await targetClient.query(
            `
            UPDATE locator_slips
            SET destination = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND destination ILIKE 'Pinned location%'
            `,
            [row.locator_slip_id, recoveredDestination]
        );
        repairedLocatorSlips += locatorSlipResult.rowCount || 0;

        if (row.trip_id) {
            const tripResult = await targetClient.query(
                `
                UPDATE trips
                SET destination_name = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                  AND destination_name ILIKE 'Pinned location%'
                `,
                [row.trip_id, recoveredDestination]
            );
            repairedTrips += tripResult.rowCount || 0;
        }
    }

    return { repairedLocatorSlips, repairedTrips };
};

const resetSerialSequences = async (targetClient, tableName) => {
    const { rows } = await targetClient.query(
        `
        SELECT
            column_name,
            pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS sequence_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_default LIKE 'nextval(%'
        `,
        [tableName]
    );

    for (const row of rows) {
        if (!row.sequence_name) {
            continue;
        }

        await targetClient.query(
            `
            SELECT setval(
                $1,
                COALESCE((SELECT MAX(${quoteIdentifier(row.column_name)}) FROM ${quoteIdentifier(tableName)}), 1),
                true
            )
            `,
            [row.sequence_name]
        );
    }
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

        const sharedTables = await getSharedTableSet(sourcePool, targetClient);
        const tablesToSync = SYNC_TABLE_ORDER.filter((tableName) => sharedTables.has(tableName));
        const reversedTables = [...tablesToSync].reverse();
        const copiedCounts = {};

        await targetClient.query('BEGIN');

        for (const tableName of reversedTables) {
            await targetClient.query(`TRUNCATE TABLE ${quoteIdentifier(tableName)} RESTART IDENTITY CASCADE`);
        }

        for (const tableName of tablesToSync) {
            const columns = await getSharedColumns(sourcePool, targetClient, tableName);
            const rows = await selectRows(sourcePool, tableName, columns);
            copiedCounts[tableName] = await insertRows(targetClient, tableName, columns, rows);
            await resetSerialSequences(targetClient, tableName);
        }

        const repairedDestinations = await repairPinnedDestinations(targetClient);

        await targetClient.query('COMMIT');

        console.log('Full database sync completed.');
        console.log(JSON.stringify({
            source: 'SOURCE_DATABASE_URL',
            target: parseDatabaseUrl(targetDatabaseUrl)?.href || 'local',
            copiedCounts,
            repairedDestinations
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
    console.error(`Full database sync failed: ${error.message}`);
    process.exit(1);
});
