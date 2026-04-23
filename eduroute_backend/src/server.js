const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');

const startServer = async () => {
    try {
        console.log('DATABASE_URL:', process.env.DATABASE_URL);
        await pool.query('SELECT 1');
        console.log('PostgreSQL connected successfully.');

        app.listen(env.port, '0.0.0.0', () => {
            console.log(`Server running on port ${env.port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
