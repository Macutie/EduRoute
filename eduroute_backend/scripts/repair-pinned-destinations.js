const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

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

const APPROVAL_DESTINATION_PATTERN = /^Your locator slip to (.+) has been approved\.$/i;

const extractDestinationFromNotification = (message) => {
    const normalizedMessage = String(message || '').trim();
    const match = normalizedMessage.match(APPROVAL_DESTINATION_PATTERN);
    return match?.[1]?.trim() || null;
};

const main = async () => {
    const databaseUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error('TARGET_DATABASE_URL or DATABASE_URL is required for the local database.');
    }

    if (!isLocalDatabase(databaseUrl)) {
        throw new Error('Refusing to repair a non-local target database. This script is hard-locked to localhost targets only.');
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { rows } = await client.query(`
            SELECT
                ls.id AS locator_slip_id,
                ls.locator_slip_code,
                ls.destination AS current_destination,
                t.id AS trip_id,
                t.destination_name AS current_trip_destination_name,
                n.message AS approval_message
            FROM locator_slips ls
            LEFT JOIN LATERAL (
                SELECT id, destination_name
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

            const locatorSlipResult = await client.query(
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
                const tripResult = await client.query(
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

        await client.query('COMMIT');
        console.log('Pinned destination repair completed.');
        console.log(JSON.stringify({ repairedLocatorSlips, repairedTrips }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

main().catch((error) => {
    console.error(`Pinned destination repair failed: ${error.message}`);
    process.exit(1);
});
