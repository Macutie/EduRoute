import { useCallback, useEffect, useState } from 'react';
import {
  getHrmuMonthlyReport,
  getHrmuMonthlyReportDetails,
} from '../services/hrmuReportsApi';

export const useHrmuMonthlyReport = ({ initialMonthIndex = 1, initialYear = new Date().getUTCFullYear() } = {}) => {
  const [monthIndex, setMonthIndex] = useState(initialMonthIndex);
  const [baseYear, setBaseYear] = useState(initialYear);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);

  const loadReport = useCallback(async (nextMonthIndex = monthIndex, nextYear = baseYear) => {
    setLoading(true);
    setError('');

    try {
      const data = await getHrmuMonthlyReport({
        monthIndex: nextMonthIndex,
        year: nextYear,
      });
      setReport(data);
    } catch (requestError) {
      setError(requestError.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [baseYear, monthIndex]);

  useEffect(() => {
    loadReport(monthIndex, baseYear);
  }, [baseYear, loadReport, monthIndex]);

  const goPrevious = useCallback(() => {
    setMonthIndex((current) => Math.max(current - 1, 1));
  }, []);

  const goNext = useCallback(() => {
    setMonthIndex((current) => Math.min(current + 1, 12));
  }, []);

  const openDetails = useCallback(async (locatorSlipId) => {
    if (!locatorSlipId) return;

    setDetailLoading(true);
    try {
      const detail = await getHrmuMonthlyReportDetails(locatorSlipId);
      setSelectedDetail(detail);
    } catch (requestError) {
      setError(requestError.message);
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return {
    monthIndex,
    baseYear,
    setBaseYear,
    report,
    loading,
    error,
    detailLoading,
    selectedDetail,
    setSelectedDetail,
    refetch: loadReport,
    goPrevious,
    goNext,
    openDetails,
  };
};
