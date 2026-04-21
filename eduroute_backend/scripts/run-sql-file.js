const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../src/config/env');

const sqlFile = process.argv[2];

if (!sqlFile) {
    console.error('Usage: node scripts/run-sql-file.js <path-to-sql-file>');
    process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), sqlFile);

if (!fs.existsSync(absolutePath)) {
    console.error(`SQL file not found: ${absolutePath}`);
    process.exit(1);
}

const run = async () => {
    const client = new Client({
        connectionString: env.databaseUrl
    });

    await client.connect();

    try {
        const sql = fs.readFileSync(absolutePath, 'utf8');
        await client.query(sql);
        console.log(`Migration completed: ${sqlFile}`);
    } finally {
        await client.end();
    }
};

run().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
