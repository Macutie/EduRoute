import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_TRANSPORTS } from '../config';
import {
  getDeanLocatorSlips,
  getDeanNotifications,
  getDeanPendingApprovals,
  getDeanSummary,
} from '../services/deanApi';

export const useDeanDashboardSummary = () => {
  const [summary, setSummary] = useState({
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    totalFaculty: 0,
    college: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await getDeanSummary());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { summary, setSummary, loading, error, reload };
};

export const useDeanNotifications = (limit = 5) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDeanNotifications({ limit });
      setNotifications(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { notifications, setNotifications, loading, error, reload };
};

export const useDeanPendingApprovals = (limit = 5) => {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPendingApprovals(await getDeanPendingApprovals({ limit }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { pendingApprovals, setPendingApprovals, loading, error, reload };
};

export const useDeanLocatorSlips = (filters = {}) => {
  const [locatorSlips, setLocatorSlips] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDeanLocatorSlips(filters);
      setLocatorSlips(data.items || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.search, filters.page, filters.limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { locatorSlips, pagination, loading, error, reload };
};

export const useDeanRealtimeNotifications = ({
  setSummary,
  setNotifications,
  setPendingApprovals,
}) => {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    const socket = io(API_BASE_URL || window.location.origin, {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    });

    const handleNewLocatorSlip = (payload) => {
      setToast(`${payload.facultyName} submitted a locator slip.`);
      setSummary?.((prev) => ({
        ...prev,
        pendingRequests: Number(prev.pendingRequests || 0) + 1,
      }));
      setNotifications?.((prev) => [
        {
          id: `live-${payload.locatorSlipId}`,
          locator_slip_id: payload.locatorSlipId,
          title: 'New locator slip request',
          message: `${payload.facultyName} submitted a locator slip for ${payload.purpose}.`,
          is_read: false,
          formatted_created_at: payload.formattedCreatedAt,
        },
        ...prev,
      ].slice(0, 8));
      setPendingApprovals?.((prev) => [
        {
          locatorSlipId: payload.locatorSlipId,
          facultyName: payload.facultyName,
          facultyInitials: payload.facultyName
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join(''),
          collegeName: payload.collegeName,
          purpose: payload.purpose,
          dateSubmitted: payload.formattedCreatedAt,
          status: 'pending',
        },
        ...prev,
      ].slice(0, 5));

      window.setTimeout(() => setToast(null), 4000);
    };

    socket.on('locator-slip:new', handleNewLocatorSlip);

    return () => {
      socket.off('locator-slip:new', handleNewLocatorSlip);
      socket.disconnect();
    };
  }, [setSummary, setNotifications, setPendingApprovals]);

  return { toast };
};
