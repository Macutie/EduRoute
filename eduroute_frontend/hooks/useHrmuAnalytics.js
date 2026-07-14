import { useCallback, useEffect, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  getHrmuAnalyticsApprovalRate,
  getHrmuAnalyticsDailyMovement,
  getHrmuAnalyticsOverview,
  generateHrmuSmartAnalytics,
} from '../services/hrmuAnalyticsApi';

const HRMU_ANALYTICS_COLLEGE_ORDER = [
  'College of Education, Arts and Sciences',
  'College of Business and Accountancy',
  'College of Allied Health Studies',
  'College of Hospitality and Tourism Management',
  'College of Computer Studies',
];

const getTodayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthStartIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

export const useHrmuAnalytics = () => {
  const defaultStartDate = getMonthStartIso();
  const defaultEndDate = getTodayIso();

  const [filters, setFilters] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    collegeId: '',
    collegeName: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    collegeId: '',
    collegeName: '',
  });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [smartGenerating, setSmartGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadAnalytics = useCallback(async (nextFilters = appliedFilters, { keepLoading = false, includeSmart = false } = {}) => {
    if (!keepLoading) {
      setLoading(true);
    }
    if (includeSmart) {
      setSmartGenerating(true);
    }
    setError('');

    try {
      const overview = await getHrmuAnalyticsOverview(nextFilters);
      const [dailyMovementResult, approvalRateResult] = await Promise.allSettled([
        getHrmuAnalyticsDailyMovement(nextFilters),
        getHrmuAnalyticsApprovalRate(nextFilters),
      ]);
      const dailyMovement = dailyMovementResult.status === 'fulfilled' ? dailyMovementResult.value : {};
      const approvalRate = approvalRateResult.status === 'fulfilled' ? approvalRateResult.value : {};
      const smartAnalytics = includeSmart ? await generateHrmuSmartAnalytics(nextFilters) : overview.smartAnalytics;

      setAnalytics({
        ...overview,
        dateRange: dailyMovement.dateRange || overview.dateRange,
        selectedCollege: dailyMovement.selectedCollege || approvalRate.selectedCollege || overview.selectedCollege || null,
        dailyFacultyMovement: dailyMovement.dailyFacultyMovement || overview.dailyFacultyMovement,
        approvalRate: approvalRate.approvalRate || overview.approvalRate,
        smartAnalytics,
      });

      if (overview.smartAnalyticsWarning || dailyMovementResult.status === 'rejected' || approvalRateResult.status === 'rejected') {
        const warnings = [
          overview.smartAnalyticsWarning,
          dailyMovementResult.status === 'rejected' ? dailyMovementResult.reason?.message : '',
          approvalRateResult.status === 'rejected' ? approvalRateResult.reason?.message : '',
        ].filter(Boolean);
        setExportMessage(`Analytics loaded with partial data. ${warnings[0] || ''}`.trim());
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      if (includeSmart) {
        setSmartGenerating(false);
      }
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadAnalytics(appliedFilters);
    // Filter changes are loaded explicitly by applyFilters to avoid duplicate requests.
  }, []);

  const applyFilters = useCallback(() => {
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      setError('Start date must be before or equal to end date.');
      return;
    }

    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    loadAnalytics(nextFilters, { includeSmart: true });
  }, [filters, loadAnalytics]);

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

    setExporting(true);
    setError('');
    setExportMessage('');

    let exportSurface = null;

    try {
      exportSurface = element.cloneNode(true);
      exportSurface.classList.add('is-exporting-pdf', 'hrmu-analytics-export-staging');
      exportSurface.setAttribute('aria-hidden', 'true');

      // cloneNode does not reliably preserve the current value of form controls.
      const sourceControls = element.querySelectorAll('input, select, textarea');
      const clonedControls = exportSurface.querySelectorAll('input, select, textarea');
      sourceControls.forEach((control, index) => {
        const clonedControl = clonedControls[index];
        if (!clonedControl) return;
        clonedControl.value = control.value;
        if ('checked' in control) clonedControl.checked = control.checked;
      });

      document.body.appendChild(exportSurface);
      await document.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const sourceBlocks = Array.from(exportSurface.children).flatMap((child) => {
        if (child.classList?.contains('hrmu-smart-analytics-section')) {
          return Array.from(child.children);
        }

        return [child];
      }).filter((child) => !child.hasAttribute('data-html2canvas-ignore'));

      if (sourceBlocks.length === 0) {
        throw new Error('No analytics content is available to export.');
      }

      let cursorY = margin;
      let hasContent = false;

      for (const block of sourceBlocks) {
        const canvas = await html2canvas(block, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 1200,
          windowHeight: Math.max(900, exportSurface.scrollHeight),
        });

        if (!canvas.width || !canvas.height) continue;

        const imageData = canvas.toDataURL('image/png');
        const imageHeight = (canvas.height * contentWidth) / canvas.width;

        if (hasContent && cursorY + imageHeight > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }

        if (imageHeight <= contentHeight) {
          pdf.addImage(imageData, 'PNG', margin, cursorY, contentWidth, imageHeight, undefined, 'FAST');
          cursorY += imageHeight + 5;
          hasContent = true;
          continue;
        }

        let sourceY = 0;
        const pageCanvasHeight = Math.floor((contentHeight * canvas.width) / contentWidth);
        while (sourceY < canvas.height) {
          const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const sliceContext = sliceCanvas.getContext('2d');
          if (!sliceContext) throw new Error('Unable to prepare an analytics PDF page.');
          sliceContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const sliceImage = sliceCanvas.toDataURL('image/png');
          const renderedSliceHeight = (sliceHeight * contentWidth) / canvas.width;

          if (hasContent) {
            pdf.addPage();
          }

          pdf.addImage(sliceImage, 'PNG', margin, margin, contentWidth, renderedSliceHeight, undefined, 'FAST');
          hasContent = true;
          sourceY += sliceHeight;
        }

        cursorY = margin;
      }

      if (!hasContent) {
        throw new Error('Analytics charts could not be rendered for export.');
      }

      const safeDateLabel = `${appliedFilters.startDate || 'start'}-${appliedFilters.endDate || 'end'}`.replace(/[^\w-]+/g, '-');
      pdf.save(`eduroute-hrmu-analytics-${safeDateLabel}.pdf`);
      setExportMessage('Analytics PDF downloaded successfully.');
    } catch (requestError) {
      setError(requestError?.message || 'Analytics PDF export failed.');
      throw requestError;
    } finally {
      exportSurface?.remove();
      setExporting(false);
    }
  }, [appliedFilters]);

  const generateSmartAnalytics = useCallback(async () => {
    setSmartGenerating(true);
    setError('');

    try {
      const smartAnalytics = await generateHrmuSmartAnalytics(appliedFilters);
      setAnalytics((current) => ({
        ...(current || {}),
        dateRange: smartAnalytics.dateRange || current?.dateRange,
        selectedCollege: smartAnalytics.selectedCollege || current?.selectedCollege || null,
        smartAnalytics,
      }));
      setExportMessage('Smart HRMU analytics refreshed successfully.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSmartGenerating(false);
    }
  }, [appliedFilters]);

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
    exporting,
    smartGenerating,
    error,
    exportMessage,
    departmentOptions,
    updateFilter,
    applyFilters,
    reload: loadAnalytics,
    generateSmartAnalytics,
    exportPdf,
  };
};
