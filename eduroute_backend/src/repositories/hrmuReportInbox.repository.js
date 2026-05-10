const pool = require('../db/pool');

let ensureInboxTablePromise = null;

const ensureInboxTable = async () => {
    if (!ensureInboxTablePromise) {
        ensureInboxTablePromise = pool.query(
            `CREATE TABLE IF NOT EXISTS hrmu_report_inbox (
                id BIGSERIAL PRIMARY KEY,
                sender_user_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                sent_to_role TEXT NOT NULL DEFAULT 'hrmu',
                report_kind TEXT NOT NULL DEFAULT 'cssu_movement',
                report_title TEXT NOT NULL,
                report_subtitle TEXT,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                file_data BYTEA NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                read_at TIMESTAMPTZ NULL
            );
            CREATE INDEX IF NOT EXISTS idx_hrmu_report_inbox_created_at
                ON hrmu_report_inbox (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_hrmu_report_inbox_role_read
                ON hrmu_report_inbox (sent_to_role, is_read, created_at DESC);`
        ).catch((error) => {
            ensureInboxTablePromise = null;
            throw error;
        });
    }

    await ensureInboxTablePromise;
};

const createInboxAttachment = async ({
    senderUserId,
    senderName,
    reportKind = 'cssu_movement',
    reportTitle,
    reportSubtitle = null,
    filename,
    mimeType = 'application/pdf',
    fileData,
    filters = {},
    sentToRole = 'hrmu',
}) => {
    await ensureInboxTable();

    const { rows } = await pool.query(
        `INSERT INTO hrmu_report_inbox (
            sender_user_id,
            sender_name,
            sent_to_role,
            report_kind,
            report_title,
            report_subtitle,
            filename,
            mime_type,
            file_data,
            file_size,
            filters_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        RETURNING
            id,
            sender_user_id,
            sender_name,
            sent_to_role,
            report_kind,
            report_title,
            report_subtitle,
            filename,
            mime_type,
            file_size,
            filters_json,
            created_at,
            is_read,
            read_at`,
        [
            String(senderUserId),
            senderName,
            sentToRole,
            reportKind,
            reportTitle,
            reportSubtitle,
            filename,
            mimeType,
            fileData,
            Buffer.isBuffer(fileData) ? fileData.length : 0,
            JSON.stringify(filters || {}),
        ]
    );

    return rows[0] || null;
};

const listInboxAttachments = async ({ sentToRole = 'hrmu', limit = 50 } = {}) => {
    await ensureInboxTable();

    const safeLimit = Math.max(Math.min(Number(limit) || 50, 200), 1);
    const { rows } = await pool.query(
        `SELECT
            id,
            sender_user_id,
            sender_name,
            sent_to_role,
            report_kind,
            report_title,
            report_subtitle,
            filename,
            mime_type,
            file_size,
            filters_json,
            created_at,
            is_read,
            read_at
         FROM hrmu_report_inbox
         WHERE sent_to_role = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [sentToRole, safeLimit]
    );

    return rows;
};

const getInboxAttachmentById = async (id, { includeFileData = false } = {}) => {
    await ensureInboxTable();

    const selectFile = includeFileData ? ', file_data' : '';
    const { rows } = await pool.query(
        `SELECT
            id,
            sender_user_id,
            sender_name,
            sent_to_role,
            report_kind,
            report_title,
            report_subtitle,
            filename,
            mime_type,
            file_size,
            filters_json,
            created_at,
            is_read,
            read_at
            ${selectFile}
         FROM hrmu_report_inbox
         WHERE id = $1
         LIMIT 1`,
        [id]
    );

    return rows[0] || null;
};

const markInboxAttachmentRead = async (id) => {
    await ensureInboxTable();

    await pool.query(
        `UPDATE hrmu_report_inbox
         SET is_read = TRUE,
             read_at = COALESCE(read_at, NOW())
         WHERE id = $1`,
        [id]
    );
};

module.exports = {
    createInboxAttachment,
    ensureInboxTable,
    getInboxAttachmentById,
    listInboxAttachments,
    markInboxAttachmentRead,
};
