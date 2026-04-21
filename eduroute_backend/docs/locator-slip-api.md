# Locator Slip API

All locator slip routes are protected with JWT authentication. The faculty user is resolved from `Authorization: Bearer <token>` via `req.user.sub`; clients must not send `faculty_user_id`.

## Endpoints

### GET `/api/locator-slips/faculty-profile`

Returns the logged-in faculty account for the Faculty Credentials card.

```json
{
  "success": true,
  "message": "Faculty profile fetched successfully.",
  "data": {
    "full_name": "Dr. Alex Nilo",
    "employee_id": "FAC-2024-0891",
    "department_name": "College of Computer Studies"
  }
}
```

### POST `/api/locator-slips`

Creates a pending locator slip for the logged-in faculty member.

Request:

```json
{
  "destination": "CHED Regional Office",
  "purpose_of_travel": "Official Meeting/Conference",
  "custom_purpose": null,
  "departure_datetime": "2026-04-21T14:51",
  "expected_return_datetime": "2026-04-21T17:30",
  "additional_remarks": "Available by phone during the meeting."
}
```

Response:

```json
{
  "success": true,
  "message": "Locator slip submitted successfully.",
  "data": {
    "id": "3c450939-9175-41ef-afb6-9aee917c0a7e",
    "faculty_user_id": "0e4d7d29-31fa-44fa-89de-e2d3a98f11d6",
    "faculty": {
      "full_name": "Dr. Alex Nilo",
      "employee_id": "FAC-2024-0891",
      "department_name": "College of Computer Studies"
    },
    "destination": "CHED Regional Office",
    "purpose_of_travel": "Official Meeting/Conference",
    "custom_purpose": null,
    "departure_datetime": "2026-04-21T14:51:00.000Z",
    "expected_return_datetime": "2026-04-21T17:30:00.000Z",
    "formatted_departure_datetime": "04/21/2026 02:51 PM",
    "formatted_expected_return_datetime": "04/21/2026 05:30 PM",
    "additional_remarks": "Available by phone during the meeting.",
    "status": "pending"
  }
}
```

### GET `/api/locator-slips/my-slips`

Returns the logged-in faculty member's slips, newest first.

### GET `/api/locator-slips/:id`

Returns one slip only when it belongs to the logged-in faculty member.

## React Integration Pattern

```jsx
const PURPOSE_OPTIONS = [
  'Official Meeting/Conference',
  'Submission/Retrieval of Documents',
  'Coordination/Consultation',
  'Field Inspection/Monitoring',
  'Others',
];

const [facultyProfile, setFacultyProfile] = useState(null);
const [form, setForm] = useState({
  destination: '',
  purpose_of_travel: '',
  custom_purpose: '',
  departure_datetime: '',
  expected_return_datetime: '',
  additional_remarks: '',
});

const errors = {};
if (!form.destination.trim()) errors.destination = 'Destination is required.';
if (!form.purpose_of_travel) errors.purpose_of_travel = 'Purpose of travel is required.';
if (form.purpose_of_travel === 'Others' && !form.custom_purpose.trim()) {
  errors.custom_purpose = 'Please specify your purpose.';
}
if (!form.departure_datetime) errors.departure_datetime = 'Departure is required.';
if (!form.expected_return_datetime) errors.expected_return_datetime = 'Expected return is required.';
if (
  form.departure_datetime &&
  form.expected_return_datetime &&
  new Date(form.expected_return_datetime) <= new Date(form.departure_datetime)
) {
  errors.expected_return_datetime = 'Expected return must be later than departure.';
}

const canSubmit = facultyProfile && Object.keys(errors).length === 0;

useEffect(() => {
  fetch(`${API_BASE_URL}/api/locator-slips/faculty-profile`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
    .then((res) => res.json())
    .then((json) => setFacultyProfile(json.data));
}, []);

const submit = async () => {
  if (!canSubmit) return;

  await fetch(`${API_BASE_URL}/api/locator-slips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(form),
  });
};
```
