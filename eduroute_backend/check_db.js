const pool = require('./src/db/pool');

async function test() {
    try {
        const { rows } = await pool.query("SELECT id, status FROM locator_slips ORDER BY updated_at DESC LIMIT 5");
        console.log("Locator Slips:", rows);

        const trips = await pool.query("SELECT id, locator_slip_id, status FROM trips ORDER BY updated_at DESC LIMIT 5");
        console.log("Trips:", trips.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

test();
