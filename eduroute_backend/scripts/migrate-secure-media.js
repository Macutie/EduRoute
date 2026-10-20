/*
 * Re-encrypt existing Cloudinary media without deleting the originals.
 *
 * Usage:
 *   node scripts/migrate-secure-media.js --dry-run
 *   node scripts/migrate-secure-media.js
 *   node scripts/migrate-secure-media.js --limit=25
 *   node scripts/migrate-secure-media.js --repair-protected-urls --base-url=https://your-backend.example.com
 *
 * The script is resumable: protected /api/secure-media URLs are skipped, and
 * every attempted replacement is recorded in secure_media_migration_backups.
 */
const crypto = require('crypto');
const pool = require('../src/db/pool');
const env = require('../src/config/env');
const { hasCloudinaryConfig, uploadImageBuffer, uploadFileBuffer, readSecureMedia } = require('../src/services/upload.service');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArgument = process.argv.find(argument => argument.startsWith('--limit='));
const limit = limitArgument ? Math.max(1, Number(limitArgument.split('=')[1]) || 1) : Infinity;
const tableArgument = process.argv.find(argument => argument.startsWith('--table='));
const selectedTable = tableArgument ? tableArgument.split('=')[1] : null;
const baseUrlArgument = process.argv.find(argument => argument.startsWith('--base-url='));
const requestedBaseUrl = baseUrlArgument ? baseUrlArgument.slice('--base-url='.length).replace(/\/+$/, '') : '';
const repairProtectedUrls = args.has('--repair-protected-urls');
const publicBackendUrl = requestedBaseUrl || String(process.env.SECURE_MEDIA_PUBLIC_BASE_URL || env.backendUrl || '').replace(/\/+$/, '');

const MEDIA_SOURCES = [
    { table: 'faculty_users', idColumn: 'id', urlColumn: 'profile_image_url', publicIdColumn: 'profile_image_public_id', mimeColumn: 'profile_image_mime_type', kind: 'image' },
    { table: 'dean_signature_settings', idColumn: 'dean_user_id', urlColumn: 'signature_url', publicIdColumn: 'signature_public_id', mimeColumn: 'signature_mime_type', kind: 'file' },
    { table: 'locator_slip_dean_signatures', idColumn: 'locator_slip_id', urlColumn: 'signature_url', publicIdColumn: 'signature_public_id', mimeColumn: 'signature_mime_type', kind: 'file' },
    { table: 'arrival_verifications', idColumn: 'id', urlColumn: 'image_url', publicIdColumn: 'image_public_id', mimeColumn: null, kind: 'image' },
    { table: 'arrival_verifications', idColumn: 'id', urlColumn: 'focal_person_signature_url', publicIdColumn: 'focal_person_signature_public_id', mimeColumn: null, kind: 'image' },
    { table: 'arrival_verifications', idColumn: 'id', urlColumn: 'arrival_photo_url', publicIdColumn: 'arrival_photo_public_id', mimeColumn: null, kind: 'image' },
    { table: 'arrival_verifications', idColumn: 'id', urlColumn: 'proof_compliance_image_url', publicIdColumn: 'proof_compliance_image_public_id', mimeColumn: null, kind: 'image' },
    { table: 'locator_slip_location_verifications', idColumn: 'id', urlColumn: 'image_url', publicIdColumn: 'image_public_id', mimeColumn: 'mime_type', kind: 'image' }
];

const isCloudinaryUrl = value => /^https:\/\/res\.cloudinary\.com\//i.test(String(value || ''));
const isProtectedUrl = value => /\/api\/secure-media\//i.test(String(value || ''));
const isLocalBackendUrl = value => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(String(value || ''));
const rebaseProtectedUrl = value => {
    if (!isProtectedUrl(value)) return value;
    const parsed = new URL(value);
    return `${publicBackendUrl}${parsed.pathname}${parsed.search}`;
};
const hashBuffer = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

const tableExists = async (client, table) => {
    const result = await client.query(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [table]
    );
    return result.rows[0].exists;
};

const columnExists = async (client, table, column) => {
    if (!column) return false;
    const result = await client.query(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ) AS exists`,
        [table, column]
    );
    return result.rows[0].exists;
};

const ensureBackupTable = async client => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS secure_media_migration_backups (
            id BIGSERIAL PRIMARY KEY,
            source_table TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_column TEXT NOT NULL,
            old_url TEXT NOT NULL,
            old_public_id TEXT,
            new_url TEXT,
            new_public_id TEXT,
            status VARCHAR(20) NOT NULL,
            error_message TEXT,
            migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_secure_media_migration_source
            ON secure_media_migration_backups(source_table, source_id, source_column);
    `);
};

const downloadOriginal = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cloudinary download failed with HTTP ${response.status}`);
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'application/octet-stream'
    };
};

const migrateAsset = async ({ buffer, contentType, source }) => {
    const extension = contentType.split('/')[1]?.split(';')[0] || 'bin';
    const options = {
        folder: `protected-migration/${source.table}`,
        publicId: `${source.urlColumn}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        format: extension,
        mimeType: contentType
    };
    return source.kind === 'file'
        ? uploadFileBuffer(buffer, options)
        : uploadImageBuffer(buffer, options);
};

const main = async () => {
    if (!repairProtectedUrls && !env.mediaEncryptionKey && !env.fieldEncryptionKey) {
        throw new Error('Set MEDIA_ENCRYPTION_KEY before running this migration.');
    }
    if (!repairProtectedUrls && !hasCloudinaryConfig()) throw new Error('Cloudinary configuration is required for this migration.');
    if (!/^https?:\/\//i.test(publicBackendUrl)) throw new Error('Set BACKEND_URL or pass --base-url=https://your-public-backend before migrating media.');
    if (!repairProtectedUrls && isLocalBackendUrl(publicBackendUrl) && env.nodeEnv === 'production') {
        throw new Error('Refusing to create production media URLs pointing to localhost. Set BACKEND_URL to the public backend URL.');
    }
    if (dryRun) console.log('Dry run: no uploads or database URL updates will be performed.');

    const client = await pool.connect();
    const migratedByUrl = new Map();
    let inspected = 0;
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    try {
        if (!dryRun) await ensureBackupTable(client);
        for (const source of MEDIA_SOURCES) {
            if (selectedTable && source.table !== selectedTable) continue;
            if (!(await tableExists(client, source.table))) {
                console.log(`Skipping ${source.table}: table does not exist.`);
                continue;
            }
            if (!(await columnExists(client, source.table, source.urlColumn))) {
                console.log(`Skipping ${source.table}.${source.urlColumn}: column does not exist.`);
                continue;
            }

            const publicIdAvailable = await columnExists(client, source.table, source.publicIdColumn);
            const mimeAvailable = await columnExists(client, source.table, source.mimeColumn);
            const publicIdSelect = publicIdAvailable ? `, ${source.publicIdColumn}` : '';
            const mimeSelect = mimeAvailable ? `, ${source.mimeColumn}` : '';
            const result = await client.query(
                `SELECT ${source.idColumn}, ${source.urlColumn}${publicIdSelect}${mimeSelect}
                 FROM ${source.table}
                 WHERE ${source.urlColumn} IS NOT NULL
                 ORDER BY ${source.idColumn}`
            );

            for (const row of result.rows) {
                if (inspected >= limit) break;
                inspected += 1;
                const oldUrl = row[source.urlColumn];
                const sourceId = String(row[source.idColumn]);
                if (isProtectedUrl(oldUrl)) {
                    if (repairProtectedUrls) {
                        const repairedUrl = rebaseProtectedUrl(oldUrl);
                        if (repairedUrl !== oldUrl) {
                            await client.query(
                                `UPDATE ${source.table}
                                 SET ${source.urlColumn} = $1
                                 WHERE ${source.idColumn} = $2 AND ${source.urlColumn} = $3`,
                                [repairedUrl, sourceId, oldUrl]
                            );
                            migrated += 1;
                            console.log(`Repaired ${source.table}.${source.urlColumn} ${sourceId}`);
                        } else {
                            skipped += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                    continue;
                }
                if (!isCloudinaryUrl(oldUrl)) {
                    skipped += 1;
                    continue;
                }

                try {
                    let replacement = migratedByUrl.get(oldUrl);
                    let originalBuffer;
                    let contentType = row[source.mimeColumn] || 'application/octet-stream';
                    if (!replacement) {
                        const downloaded = await downloadOriginal(oldUrl);
                        originalBuffer = downloaded.buffer;
                        contentType = row[source.mimeColumn] || downloaded.contentType;
                        if (dryRun) {
                            console.log(`[dry-run] ${source.table}.${source.urlColumn} ${sourceId} (${originalBuffer.length} bytes)`);
                            continue;
                        }
                        replacement = await migrateAsset({ buffer: originalBuffer, contentType, source });
                        const verification = await readSecureMedia(replacement.url.split('/').pop());
                        if (hashBuffer(verification.buffer) !== hashBuffer(originalBuffer)) {
                            throw new Error('Decrypted replacement did not match the original asset.');
                        }
                        replacement = { ...replacement, url: rebaseProtectedUrl(replacement.url) };
                        migratedByUrl.set(oldUrl, replacement);
                    }

                    await client.query(
                        `INSERT INTO secure_media_migration_backups
                            (source_table, source_id, source_column, old_url, old_public_id, new_url, new_public_id, status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, 'migrated')`,
                        [source.table, sourceId, source.urlColumn, oldUrl, publicIdAvailable ? row[source.publicIdColumn] : null, replacement.url, replacement.publicId]
                    );
                    await client.query(
                        `UPDATE ${source.table}
                         SET ${source.urlColumn} = $1${publicIdAvailable ? `, ${source.publicIdColumn} = $2` : ''}
                         WHERE ${source.idColumn} = $${publicIdAvailable ? 3 : 2}
                           AND ${source.urlColumn} = $${publicIdAvailable ? 4 : 3}`,
                        publicIdAvailable
                            ? [replacement.url, replacement.publicId, sourceId, oldUrl]
                            : [replacement.url, sourceId, oldUrl]
                    );
                    migrated += 1;
                    console.log(`Migrated ${source.table}.${source.urlColumn} ${sourceId}`);
                } catch (error) {
                    failed += 1;
                    await client.query(
                        `INSERT INTO secure_media_migration_backups
                            (source_table, source_id, source_column, old_url, old_public_id, status, error_message)
                         VALUES ($1, $2, $3, $4, $5, 'failed', $6)`,
                        [source.table, sourceId, source.urlColumn, oldUrl, publicIdAvailable ? row[source.publicIdColumn] : null, error.message]
                    );
                    console.error(`Failed ${source.table}.${source.urlColumn} ${sourceId}: ${error.message}`);
                }
            }
            if (inspected >= limit) break;
        }
    } finally {
        client.release();
        await pool.end();
    }

    console.log(JSON.stringify({ inspected, migrated, skipped, failed, dryRun }, null, 2));
    if (failed > 0) process.exitCode = 1;
};

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
