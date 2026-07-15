import { API_BASE_URL } from '../config';
import { clearAuthPayloadPublicKeyCache, encryptAuthPayload, withFreshAuthPayloadKeyRetry } from './authPayloadEncryption';

const isEncryptedPayloadDecryptError = (error) => /encrypted payload could not be decrypted|payload could not be decrypted|decryption failed/i.test(
    String(error?.message || error || '')
);

const parseJsonResponse = async (response, fallbackMessage) => {
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
};

const withRecoveryRequestTimeout = async (request) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
        return await request(controller.signal);
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Password recovery is taking too long. Please try again in a moment or contact the IT Support Desk.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const registerFaculty = async (formData) => {
    return withFreshAuthPayloadKeyRetry(async () => {
        const encryptedPayload = await encryptAuthPayload({
            full_name: formData.full_name,
            employee_id: formData.employee_id,
            department_id: Number(formData.department_id),
            email: formData.email,
            password: formData.password,
            confirm_password: formData.confirm_password,
            terms_accepted: formData.terms_accepted
        });

        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(encryptedPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        return data;
    });
};

export const loginFaculty = async (emailOrEmployeeId, password) => {
    return withFreshAuthPayloadKeyRetry(async () => {
        const encryptedPayload = await encryptAuthPayload({
            email_or_employee_id: emailOrEmployeeId,
            password
        });

        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(encryptedPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        return data;
    });
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
    const sendRequest = async (signal) => {
        const encryptedPayload = await encryptAuthPayload({ email });

        const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(encryptedPayload)
        });

        return parseJsonResponse(response, 'Forgot password failed');
    };

    try {
        return await withRecoveryRequestTimeout(sendRequest);
    } catch (error) {
        if (!isEncryptedPayloadDecryptError(error)) {
            throw error;
        }

        clearAuthPayloadPublicKeyCache();
        return withRecoveryRequestTimeout(sendRequest);
    }
};

export const changePassword = async ({ currentPassword, newPassword, confirmPassword }) => {
    return withFreshAuthPayloadKeyRetry(async () => {
        const encryptedPayload = await encryptAuthPayload({
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        });

        const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify(encryptedPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    });
};
