import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTripSocketClient, HRMU_LIVE_SOCKET_EVENTS } from '../services/tripSocket';
import {
  getHrmuActiveFaculty,
  getHrmuFacultyActivity,
  getHrmuFacultyLiveDetail,
} from '../services/hrmuLiveTrackingApi';

const getToken = () => localStorage.getItem('token');

const mergeFacultyLocation = (currentRows, incomingRow) => {
  const nextRows = [...currentRows];
  const index = nextRows.findIndex((row) => row.facultyUserId === incomingRow.facultyUserId);

  if (index >= 0) {
    nextRows[index] = {
      ...nextRows[index],
      ...incomingRow,
    };
  } else {
    nextRows.push(incomingRow);
  }

  return nextRows.sort((left, right) => {
    const leftTime = left.lastUpdatedAt ? new Date(left.lastUpdatedAt).getTime() : 0;
    const rightTime = right.lastUpdatedAt ? new Date(right.lastUpdatedAt).getTime() : 0;
    return rightTime - leftTime;
  });
};

export const useHrmuLiveTracking = ({
  getActiveFacultyFn = getHrmuActiveFaculty,
  getFacultyActivityFn = getHrmuFacultyActivity,
  getFacultyLiveDetailFn = getHrmuFacultyLiveDetail,
} = {}) => {
  const socketRef = useRef(null);
  const selectedFacultyIdRef = useRef(null);
  const [center, setCenter] = useState({
    lat: 14.8386,
    lng: 120.2828,
    label: 'Olongapo City',
  });
  const [facultyLocations, setFacultyLocations] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState(null);
  const [selectedFacultyDetail, setSelectedFacultyDetail] = useState(null);
  const [activityItems, setActivityItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState('');

  const loadActiveFaculty = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getActiveFacultyFn();
      setCenter(data?.center || { lat: 14.8386, lng: 120.2828, label: 'Olongapo City' });

      const rows = Array.isArray(data?.faculty) ? data.faculty : [];
      setFacultyLocations(rows);
      setSelectedFacultyId((current) => {
        if (current && rows.some((item) => item.facultyUserId === current)) {
          return current;
        }

        return rows[0]?.facultyUserId || null;
      });
    } catch (requestError) {
      setError(requestError.message);
      setFacultyLocations([]);
      setSelectedFacultyId(null);
    } finally {
      setLoading(false);
    }
  }, [getActiveFacultyFn]);

  const selectedFaculty = useMemo(() => (
    facultyLocations.find((item) => item.facultyUserId === selectedFacultyId) || null
  ), [facultyLocations, selectedFacultyId]);

  useEffect(() => {
    selectedFacultyIdRef.current = selectedFacultyId;
  }, [selectedFacultyId]);

  const selectFaculty = useCallback((faculty) => {
    if (!faculty?.facultyUserId) return;
    setSelectedFacultyId(faculty.facultyUserId);
  }, []);

  const loadSelectedFacultyDetail = useCallback(async (facultyUserId) => {
    if (!facultyUserId) {
      setSelectedFacultyDetail(null);
      return;
    }

    setDetailLoading(true);

    try {
      const detail = await getFacultyLiveDetailFn(facultyUserId);
      setSelectedFacultyDetail(detail);
    } catch (requestError) {
      setError(requestError.message);
      setSelectedFacultyDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [getFacultyLiveDetailFn]);

  const loadSelectedFacultyActivity = useCallback(async (facultyUserId, tripId, limit = 6) => {
    if (!facultyUserId) {
      setActivityItems([]);
      return;
    }

    setActivityLoading(true);

    try {
      const activity = await getFacultyActivityFn(facultyUserId, {
        tripId,
        limit,
      });
      setActivityItems(Array.isArray(activity?.activity) ? activity.activity : []);
    } catch (requestError) {
      setError(requestError.message);
      setActivityItems([]);
    } finally {
      setActivityLoading(false);
    }
  }, [getFacultyActivityFn]);

  useEffect(() => {
    loadActiveFaculty();
  }, [loadActiveFaculty]);

  useEffect(() => {
    if (!selectedFacultyId) {
      setSelectedFacultyDetail(null);
      setActivityItems([]);
      return;
    }

    loadSelectedFacultyDetail(selectedFacultyId);
  }, [selectedFacultyId, loadSelectedFacultyDetail]);

  useEffect(() => {
    if (!selectedFacultyId) return;

    loadSelectedFacultyActivity(selectedFacultyId, selectedFaculty?.tripId);
  }, [selectedFaculty?.tripId, selectedFacultyId, loadSelectedFacultyActivity]);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;

    const socket = createTripSocketClient({ token });
    socketRef.current = socket;

    const handleFacultyLocationUpdate = (payload) => {
      if (!payload) return;

      if (Array.isArray(payload.faculty)) {
        setCenter(payload.center || { lat: 14.8386, lng: 120.2828, label: 'Olongapo City' });
        setFacultyLocations(payload.faculty);
        return;
      }

      setFacultyLocations((current) => mergeFacultyLocation(current, payload));
    };

    const handleFacultyActivityUpdate = (payload) => {
      if (!payload?.activityItem || payload.facultyUserId !== selectedFacultyIdRef.current) return;

      setActivityItems((current) => {
        const next = [payload.activityItem, ...current.filter((item) => item.id !== payload.activityItem.id)];
        return next.slice(0, 20);
      });
    };

    socket.on('connect', () => {
      socket.emit(HRMU_LIVE_SOCKET_EVENTS.join);
    });
    socket.on(HRMU_LIVE_SOCKET_EVENTS.facultyLocationUpdate, handleFacultyLocationUpdate);
    socket.on(HRMU_LIVE_SOCKET_EVENTS.facultyActivityUpdate, handleFacultyActivityUpdate);
    socket.connect();

    return () => {
      socket.off(HRMU_LIVE_SOCKET_EVENTS.facultyLocationUpdate, handleFacultyLocationUpdate);
      socket.off(HRMU_LIVE_SOCKET_EVENTS.facultyActivityUpdate, handleFacultyActivityUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    center,
    facultyLocations,
    selectedFaculty,
    selectedFacultyDetail,
    activityItems,
    loading,
    detailLoading,
    activityLoading,
    error,
    selectFaculty,
    reload: loadActiveFaculty,
    loadMoreActivity: (limit = 20) => loadSelectedFacultyActivity(selectedFacultyId, selectedFaculty?.tripId, limit),
  };
};
