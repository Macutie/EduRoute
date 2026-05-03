const http = require('http');
const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');
const { createTripTrackingSocketServer } = require('./socket/tripTracking.socket');

const startServer = async () => {
    try {
        console.log('Starting EduRoute backend...');
        await pool.query('SELECT 1');
        console.log('PostgreSQL connected successfully.');

        // Auto-run missing migrations to fix Railway DB sync issues
        try {
            console.log('Running auto-migrations...');
            await pool.query('ALTER TABLE locator_slips ADD COLUMN IF NOT EXISTS expected_return_datetime TIMESTAMP;');
            console.log('Auto-migrations completed successfully.');
        } catch (migrationError) {
            console.error('Auto-migration failed, but continuing:', migrationError);
        }

        const server = http.createServer(app);
        createTripTrackingSocketServer(server);

        server.listen(env.port, '0.0.0.0', () => {
            console.log(`Server running on port ${env.port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
