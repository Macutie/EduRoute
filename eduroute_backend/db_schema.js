const pool = require('./src/db/pool');
async function run() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'locator_slips'");
  console.log(res.rows);
  process.exit(0);
}
run();
