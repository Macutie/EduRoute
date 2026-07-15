const formatRelativeTime = (value) => {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.max(Math.floor(diffMs / 1000), 0);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
};

const mapLiveFacultyRow = (row) => ({
    facultyUserId: row.faculty_user_id,
    facultyName: row.faculty_name,
    employeeId: row.employee_id,
    position: row.department_position || 'Instructor',
    collegeId: row.college_id,
    collegeName: row.college_name,
    locatorSlipId: row.locator_slip_id,
    tripId: row.trip_id,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    heading: row.heading === null ? null : Number(row.heading),
    speed: row.speed === null ? null : Number(row.speed),
    lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
    destination: row.destination || null,
    purpose: row.purpose || null,
    purposeOfTravel: row.purpose_of_travel || null,
    departureTime: row.departure_datetime ? new Date(row.departure_datetime).toISOString() : null,
    expectedReturnTime: row.expected_return_datetime ? new Date(row.expected_return_datetime).toISOString() : null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedByRole: row.reviewed_by_role || null,
    locationVerificationImageUrl: row.location_verification_image_url || null,
    locationVerificationStatus: row.location_verification_status || null,
    locationVerificationAt: row.location_verification_created_at ? new Date(row.location_verification_created_at).toISOString() : null,
    tripStatus: row.trip_status,
    verificationStatus: 'verified'
});

module.exports = {
    formatRelativeTime,
    mapLiveFacultyRow
};
