const pool = require('../db/pool');
const AppError = require('../utils/appError');
const { formatDateTime } = require('../utils/dateFormatter');
const cloudinary = require('../config/cloudinary');
const { optimizeImage } = require('./imageOptimization.service');
const notificationService = require('./notification.service');

const LOCATOR_SLIP_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

const locatorSlipColumns = `
    ls.id,
    ls.faculty_user_id,
    ls.college_id,
    fu.full_name,
    fu.employee_id,
    d.department_name,
    ls.destination,
    ls.purpose_of_travel,
    ls.custom_purpose,
    ls.departure_datetime,
    ls.expected_return_datetime,
    ls.additional_remarks,
    ls.is_urgent,
    ls.status,
    ls.created_at,
    ls.updated_at
`;

const formatLocatorSlip = (row) => ({
    id: row.id,
    faculty_user_id: row.faculty_user_id,
    college_id: row.college_id,
    faculty: {
        full_name: row.full_name,
        employee_id: row.employee_id,
        department_name: row.department_name
    },
    destination: row.destination,
    purpose_of_travel: row.purpose_of_travel,
    custom_purpose: row.custom_purpose,
    departure_datetime: row.departure_datetime,
    expected_return_datetime: row.expected_return_datetime,
    formatted_departure_datetime: formatDateTime(row.departure_datetime),
    formatted_expected_return_datetime: formatDateTime(row.expected_return_datetime),
    additional_remarks: row.additional_remarks,
    is_urgent: row.is_urgent === true,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const getFacultyProfile = async (facultyUserId) => {
    const query = `
        SELECT fu.full_name, fu.employee_id, d.department_name
        FROM faculty_users fu
        JOIN departments d ON d.id = fu.department_id
        WHERE fu.id = $1
        LIMIT 1
    `;

    const { rows, rowCount } = await pool.query(query, [facultyUserId]);

    if (rowCount === 0) {
        throw new AppError('Faculty user not found.', 404);
    }

    return rows[0];
};

const createLocatorSlip = async (facultyUserId, payload) => {
    const destination = payload.destination.trim();
    const purposeOfTravel = payload.purpose_of_travel.trim();
    const customPurpose = purposeOfTravel === 'Others' ? payload.custom_purpose?.trim() : null;
    const additionalRemarks = payload.additional_remarks?.trim() || null;
    const isUrgent = payload.is_urgent === true;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const facultyResult = await client.query(
            `SELECT
                fu.id,
                fu.full_name,
                fu.department_id,
                d.department_name
             FROM faculty_users fu
             JOIN departments d ON d.id = fu.department_id
             WHERE fu.id = $1
               AND fu.account_role = 'faculty'
               AND fu.status = 'active'
             LIMIT 1`,
            [facultyUserId]
        );

        if (facultyResult.rowCount === 0) {
            throw new AppError('Faculty user not found or cannot submit locator slips.', 404);
        }

        const faculty = facultyResult.rows[0];

        const query = `
            INSERT INTO locator_slips (
                faculty_user_id,
                college_id,
                destination,
                purpose_of_travel,
                custom_purpose,
                departure_datetime,
                expected_return_datetime,
                additional_remarks,
                is_urgent,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
            RETURNING *
        `;

        const values = [
            facultyUserId,
            faculty.department_id,
            destination,
            purposeOfTravel,
            customPurpose,
            payload.departure_datetime,
            payload.expected_return_datetime,
            additionalRemarks,
            isUrgent
        ];

        const { rows } = await client.query(query, values);
        const insertedSlip = rows[0];

        const notificationPayload = {
            ...insertedSlip,
            faculty_name: faculty.full_name,
            college_name: faculty.department_name
        };

        await notificationService.createLocatorSlipDeanNotifications(client, notificationPayload);

        await client.query('COMMIT');
        notificationService.emitLocatorSlipDeanNotification(notificationPayload);

        return getLocatorSlipById(facultyUserId, insertedSlip.id);
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

const getMyLocatorSlips = async (facultyUserId, status = null) => {
    if (status && !LOCATOR_SLIP_STATUSES.includes(status)) {
        throw new AppError('Locator slip status filter is invalid.', 400);
    }

    const query = `
        SELECT ${locatorSlipColumns}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = fu.department_id
        WHERE ls.faculty_user_id = $1
          AND (
            ($2::varchar IS NULL AND ls.status <> 'cancelled')
            OR ls.status = $2
          )
        ORDER BY ls.created_at DESC
    `;

    const { rows } = await pool.query(query, [facultyUserId, status]);
    return rows.map(formatLocatorSlip);
};

const getLocatorSlipById = async (facultyUserId, locatorSlipId) => {
    const query = `
        SELECT ${locatorSlipColumns}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = fu.department_id
        WHERE ls.id = $1
          AND ls.faculty_user_id = $2
        LIMIT 1
    `;

    const { rows, rowCount } = await pool.query(query, [locatorSlipId, facultyUserId]);

    if (rowCount === 0) {
        throw new AppError('Locator slip not found.', 404);
    }

    return formatLocatorSlip(rows[0]);
};

const cancelLocatorSlip = async (facultyUserId, locatorSlipId) => {
    const query = `
        UPDATE locator_slips
        SET status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND faculty_user_id = $2
          AND status = 'pending'
        RETURNING id
    `;

    const { rows, rowCount } = await pool.query(query, [locatorSlipId, facultyUserId]);

    if (rowCount === 0) {
        throw new AppError('Pending locator slip not found or cannot be cancelled.', 404);
    }

    return getLocatorSlipById(facultyUserId, rows[0].id);
};

const uploadVerificationToCloudinary = (optimizedImage, locatorSlipId) =>
    new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'eduroute/location-verifications',
                public_id: `locator-${locatorSlipId}-${Date.now()}`,
                overwrite: true,
                resource_type: 'image',
                format: optimizedImage.extension
            },
            (error, result) => {
                if (error) return reject(error);
                return resolve(result);
            }
        );

        uploadStream.end(optimizedImage.buffer);
    });

const verifyLocation = async (facultyUserId, locatorSlipId, file) => {
    if (!file) {
        throw new AppError('Location verification photo is required.', 422);
    }

    const locatorSlip = await getLocatorSlipById(facultyUserId, locatorSlipId);

    if (locatorSlip.status !== 'approved') {
        throw new AppError('Only approved locator slips can be verified by location photo.', 409);
    }

    const optimizedImage = await optimizeImage(file, 'locationVerification');
    const uploadResult = await uploadVerificationToCloudinary(optimizedImage, locatorSlipId);

    const query = `
        INSERT INTO locator_slip_location_verifications (
            locator_slip_id,
            faculty_user_id,
            target_location,
            image_url,
            image_public_id,
            mime_type,
            file_size,
            original_file_size,
            image_width,
            image_height,
            verification_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'submitted')
        RETURNING *
    `;

    const { rows } = await pool.query(query, [
        locatorSlipId,
        facultyUserId,
        locatorSlip.destination,
        uploadResult.secure_url,
        uploadResult.public_id,
        optimizedImage.mimetype,
        optimizedImage.size,
        optimizedImage.original.size,
        optimizedImage.width,
        optimizedImage.height
    ]);

    return {
        locator_slip: locatorSlip,
        verification: rows[0]
    };
};

const getLocationVerification = async (facultyUserId, locatorSlipId) => {
    const locatorSlip = await getLocatorSlipById(facultyUserId, locatorSlipId);

    const query = `
        SELECT
            id,
            locator_slip_id,
            faculty_user_id,
            target_location,
            image_url,
            image_public_id,
            mime_type,
            file_size,
            original_file_size,
            image_width,
            image_height,
            verification_status,
            created_at
        FROM locator_slip_location_verifications
        WHERE locator_slip_id = $1
          AND faculty_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
    `;

    const { rows } = await pool.query(query, [locatorSlipId, facultyUserId]);

    return {
        locator_slip: locatorSlip,
        verification: rows[0] || null
    };
};

module.exports = {
    LOCATOR_SLIP_STATUSES,
    getFacultyProfile,
    createLocatorSlip,
    getMyLocatorSlips,
    getLocatorSlipById,
    cancelLocatorSlip,
    verifyLocation,
    getLocationVerification
};
