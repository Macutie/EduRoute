const pool = require('../db/pool');
const AppError = require('../utils/appError');
const { formatDateTime } = require('../utils/dateFormatter');

const locatorSlipColumns = `
    ls.id,
    ls.faculty_user_id,
    fu.full_name,
    fu.employee_id,
    d.department_name,
    ls.destination,
    ls.purpose_of_travel,
    ls.custom_purpose,
    ls.departure_datetime,
    ls.expected_return_datetime,
    ls.additional_remarks,
    ls.status,
    ls.created_at,
    ls.updated_at
`;

const formatLocatorSlip = (row) => ({
    id: row.id,
    faculty_user_id: row.faculty_user_id,
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

    const query = `
        INSERT INTO locator_slips (
            faculty_user_id,
            destination,
            purpose_of_travel,
            custom_purpose,
            departure_datetime,
            expected_return_datetime,
            additional_remarks,
            status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
    `;

    const values = [
        facultyUserId,
        destination,
        purposeOfTravel,
        customPurpose,
        payload.departure_datetime,
        payload.expected_return_datetime,
        additionalRemarks
    ];

    const { rows } = await pool.query(query, values);

    return getLocatorSlipById(facultyUserId, rows[0].id);
};

const getMyLocatorSlips = async (facultyUserId) => {
    const query = `
        SELECT ${locatorSlipColumns}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = fu.department_id
        WHERE ls.faculty_user_id = $1
        ORDER BY ls.created_at DESC
    `;

    const { rows } = await pool.query(query, [facultyUserId]);
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

module.exports = {
    getFacultyProfile,
    createLocatorSlip,
    getMyLocatorSlips,
    getLocatorSlipById
};
