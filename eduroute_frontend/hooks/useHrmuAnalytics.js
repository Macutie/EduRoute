import { useCallback, useEffect, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  getHrmuAnalyticsApprovalRate,
  getHrmuAnalyticsDailyMovement,
  getHrmuAnalyticsOverview,
} from '../services/hrmuAnalyticsApi';

const HRMU_ANALYTICS_COLLEGE_ORDER = [
  'College of Education, Arts and Sciences',
  'College of Business and Accountancy',
  'College of Allied Health Studies',
  'College of Hospitality and Tourism Management',
  'College of Computer Studies',
];

const MONTH_RANGE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
});

const createMonthRangeOptions = (year) => Array.from({ length: 12 }, (_, index) => {
  const startDate = new Date(Date.UTC(year, index, 1));
  const endDate = new Date(Date.UTC(year, index + 1, 0));

  return {
    value: String(index + 1),
    label: `${MONTH_RANGE_LABEL_FORMATTER.format(startDate)} - ${MONTH_RANGE_LABEL_FORMATTER.format(endDate)}`,
  };
});

export const useHrmuAnalytics = () => {
  const currentDate = new Date();
  const defaultMonth = String(currentDate.getUTCMonth() + 1);
  const defaultYear = String(currentDate.getUTCFullYear());

  const [filters, setFilters] = useState({
    month: defaultMonth,
    year: defaultYear,
    collegeId: '',
    collegeName: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    month: defaultMonth,
    year: defaultYear,
    collegeId: '',
    collegeName: '',
  });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  const monthOptions = useMemo(() => createMonthRangeOptions(Number(filters.year || defaultYear)), [defaultYear, filters.year]);

  const loadAnalytics = useCallback(async (nextFilters = appliedFilters, { keepLoading = false } = {}) => {
    if (!keepLoading) {
      setLoading(true);
    }
    setError('');

    try {
      const [overview, dailyMovement, approvalRate] = await Promise.all([
        getHrmuAnalyticsOverview(nextFilters),
        getHrmuAnalyticsDailyMovement(nextFilters),
        getHrmuAnalyticsApprovalRate(nextFilters),
      ]);

      setAnalytics({
        ...overview,
        dateRange: dailyMovement.dateRange || overview.dateRange,
        selectedCollege: dailyMovement.selectedCollege || approvalRate.selectedCollege || overview.selectedCollege || null,
        dailyFacultyMovement: dailyMovement.dailyFacultyMovement || overview.dailyFacultyMovement,
        approvalRate: approvalRate.approvalRate || overview.approvalRate,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadAnalytics(appliedFilters);
  }, [appliedFilters, loadAnalytics]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(filters);
  }, [filters]);

  const updateFilter = useCallback((key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'collegeId' ? { collegeName: '' } : {}),
      ...(key === 'collegeName' ? { collegeId: '' } : {}),
    }));
  }, []);

  const exportPdf = useCallback(async ({ element }) => {
    if (!element) {
      throw new Error('Analytics export surface is unavailable.');
    }

    const canvas = await html2canvas(element, {
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    const imageData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;

    let heightLeft = imageHeight;
    let position = 0;

    pdf.addImage(imageData, 'PNG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imageHeight;
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    const monthLabel = monthOptions.find((option) => option.value === appliedFilters.month)?.label || 'analytics';
    const safeMonthLabel = monthLabel.replace(/[^\w-]+/g, '-');
    pdf.save(`eduroute-hrmu-analytics-${safeMonthLabel}.pdf`);

    setExportMessage('Analytics PDF downloaded successfully.');
  }, [appliedFilters, monthOptions]);

  const departmentOptions = useMemo(() => [
    { value: '', label: 'All Departments' },
    ...HRMU_ANALYTICS_COLLEGE_ORDER.map((collegeName) => ({
      value: collegeName,
      label: collegeName,
    })),
  ], []);

  return {
    filters,
    appliedFilters,
    analytics,
    loading,
    error,
    exportMessage,
    departmentOptions,
    monthOptions,
    updateFilter,
    applyFilters,
    reload: loadAnalytics,
    exportPdf,
  };
};
