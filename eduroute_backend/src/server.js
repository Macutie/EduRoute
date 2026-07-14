const http = require('http');
const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');
const { createTripTrackingSocketServer } = require('./socket/tripTracking.socket');
const { getFirebaseAdminStatus, initializeFirebaseAdmin } = require('./config/firebaseAdmin');

const startServer = async () => {
    try {
        console.log('Starting EduRoute backend...');
        await pool.query('SELECT 1');
        console.log('PostgreSQL connected successfully.');

        try {
            const firebaseApp = initializeFirebaseAdmin();
            const firebaseStatus = getFirebaseAdminStatus();
            console.log(firebaseApp
                ? `Firebase Admin messaging configured for project ${firebaseStatus.projectId}.`
                : 'Firebase Admin messaging is not configured; background push delivery will be skipped.');
        } catch (firebaseError) {
            console.error('Firebase Admin initialization failed:', firebaseError.message);
        }

        // Auto-run missing migrations to fix Railway DB sync issues
        try {
            console.log('Running auto-migrations...');
            await pool.query('ALTER TABLE locator_slips ADD COLUMN IF NOT EXISTS expected_return_datetime TIMESTAMP;');
            await pool.query('ALTER TABLE locator_slips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;');
            await pool.query(`CREATE TABLE IF NOT EXISTS user_push_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
                fcm_token TEXT NOT NULL UNIQUE,
                platform TEXT,
                device_name TEXT,
                user_agent TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active
                ON user_push_tokens(user_id, is_active, updated_at DESC);`);
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
