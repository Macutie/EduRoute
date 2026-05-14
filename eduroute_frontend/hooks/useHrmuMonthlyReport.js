import { useCallback, useEffect, useState } from 'react';
import {
  getHrmuMonthlyReport,
  getHrmuMonthlyReportDetails,
} from '../services/hrmuReportsApi';
import { getHrmuProofComplianceDetails } from '../services/proofComplianceApi';

const getCurrentReportMonthDefaults = () => {
  const now = new Date();
  return {
    monthIndex: now.getMonth() + 1,
    year: now.getFullYear(),
  };
};

export const useHrmuMonthlyReport = ({
  initialMonthIndex = getCurrentReportMonthDefaults().monthIndex,
  initialYear = getCurrentReportMonthDefaults().year,
} = {}) => {
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

  const openDetails = useCallback(async (row) => {
    if (!row || !row.locatorSlipId) return;

    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      if (row.proofId) {
        const detail = await getHrmuProofComplianceDetails(row.proofId);
        setSelectedDetail({ ...detail, isProof: true });
      } else {
        const detail = await getHrmuMonthlyReportDetails(row.locatorSlipId);
        setSelectedDetail({ ...detail, isProof: false });
      }
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
