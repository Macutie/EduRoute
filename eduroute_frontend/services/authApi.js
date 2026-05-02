import { API_BASE_URL } from '../config';

export const registerFaculty = async (formData) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            full_name: formData.full_name,
            employee_id: formData.employee_id,
            department_id: Number(formData.department_id),
            email: formData.email,
            password: formData.password,
            confirm_password: formData.confirm_password,
            terms_accepted: formData.terms_accepted
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }

    return data;
};

export const loginFaculty = async (emailOrEmployeeId, password) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email_or_employee_id: emailOrEmployeeId,
            password
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Login failed');
    }

    return data;
};

export const fetchDepartments = async () => {
    const response = await fetch(`${API_BASE_URL}/api/departments`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch departments');
    }

    return data;
};

export const forgotPassword = async (email) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Forgot password failed');
    }

    return data;
};