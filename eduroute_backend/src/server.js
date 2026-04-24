const http = require('http');
const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');
const { createTripTrackingSocketServer } = require('./socket/tripTracking.socket');

const startServer = async () => {
    try {
        console.log('DATABASE_URL:', process.env.DATABASE_URL);
        await pool.query('SELECT 1');
        console.log('PostgreSQL connected successfully.');

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
