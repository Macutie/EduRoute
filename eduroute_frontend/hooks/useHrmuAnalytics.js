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

const normalizeCssColorFunctions = value => String(value || '').replace(/color\(\s*([\w-]+)\s+([^)]*)\)/gi, (match, profile, channels) => {
  const [channelText, alphaText] = channels.split('/').map(part => part.trim());
  const channelValues = channelText.split(/\s+/).filter(Boolean);
  if (channelValues.length !== 3) return match;

  const toRgbChannel = channel => {
    const numericValue = Number.parseFloat(channel.replace('%', ''));
    if (!Number.isFinite(numericValue)) return null;
    return Math.round((channel.includes('%') ? numericValue / 100 : numericValue) * 255);
  };

  const rgbChannels = channelValues.map(toRgbChannel);
  if (rgbChannels.some(channel => channel === null)) return match;

  const alpha = alphaText ? Number.parseFloat(alphaText.replace('%', '')) / (alphaText.includes('%') ? 100 : 1) : 1;
  if (!Number.isFinite(alpha)) return match;
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return clampedAlpha >= 1
    ? `rgb(${rgbChannels.join(', ')})`
    : `rgba(${rgbChannels.join(', ')}, ${clampedAlpha})`;
});

const normalizeClonedDocumentColors = clonedDocument => {
  const view = clonedDocument.defaultView;
  if (!view) return;

  clonedDocument.querySelectorAll('*').forEach(element => {
    const computedStyle = view.getComputedStyle(element);
    for (let index = 0; index < computedStyle.length; index += 1) {
      const property = computedStyle[index];
      const value = computedStyle.getPropertyValue(property);
      if (!value.toLowerCase().includes('color(')) continue;
      const normalizedValue = normalizeCssColorFunctions(value);
      if (normalizedValue !== value) {
        element.style.setProperty(property, normalizedValue);
      }
    }
  });
};

const HRMU_CSV_COLUMNS = [
  'section', 'label', 'value', 'trips', 'completed', 'risk',
  'date', 'employee', 'department', 'destination', 'locator_slip', 'status',
  'filed_at', 'actual_exit', 'expected_return', 'actual_return',
  'variance_minutes', 'duration_minutes', 'notes'
];

const HRMU_CSV_HEADERS = [
  'Section', 'Label / Department', 'Value', 'Trips', 'Completed', 'Risk',
  'Date', 'Employee', 'Department', 'Destination', 'Locator Slip', 'Status',
  'Filed At', 'Actual Exit', 'Expected Return', 'Actual Return',
  'Variance', 'Duration', 'Notes'
];

const formatCsvRow = row => ({
  ...row,
  label: row.label || row.metric || row.department || '',
  value: row.unit === 'percent' && row.value !== '' && row.value !== null && row.value !== undefined
    ? `${row.value}%`
    : row.value,
});

const escapeCsvValue = value => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsvFile = ({ filename, rows = [] }) => {
  const normalizedRows = rows.map(formatCsvRow);
  const activeColumns = HRMU_CSV_COLUMNS.filter(column => normalizedRows.some(row => {
    const value = row[column];
    return value !== null && value !== undefined && String(value).trim() !== '';
  }));
  const activeHeaders = activeColumns.map(column => HRMU_CSV_HEADERS[HRMU_CSV_COLUMNS.indexOf(column)]);
  const csv = [
    activeHeaders.join(','),
    ...normalizedRows.flatMap((row, index) => {
      const previousRow = rows[index - 1];
      const separator = index > 0 && previousRow?.section !== row.section
        ? [activeColumns.map(() => '').join(',')]
        : [];
      if (index > 0 && previousRow?.section === row.section) row.section = '';
      return [...separator, activeColumns.map(column => escapeCsvValue(row[column])).join(',')];
    })
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

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
    employeeId: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    collegeId: '',
    collegeName: '',
    employeeId: '',
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
      ...(key === 'collegeId' || key === 'collegeName' ? { employeeId: '' } : {}),
    }));
  }, []);

  const exportPdf = useCallback(async ({ element, fileName = '' }) => {
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
      // Keep the export clone sized to its complete contents instead of inheriting
      // a viewport-height shell from the live dashboard.
      exportSurface.style.position = 'absolute';
      exportSurface.style.top = '0';
      exportSurface.style.left = '0';
      exportSurface.style.height = 'auto';
      exportSurface.style.minHeight = '0';
      exportSurface.style.maxHeight = 'none';
      exportSurface.style.overflow = 'visible';

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
      const sourceBlocks = [exportSurface];

      let cursorY = margin;
      let hasContent = false;

      for (const block of sourceBlocks) {
        const canvas = await html2canvas(block, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: normalizeClonedDocumentColors,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 1200,
          windowHeight: Math.max(900, exportSurface.scrollHeight),
        });

        if (!canvas.width || !canvas.height) continue;

        let sourceY = 0;
        while (sourceY < canvas.height) {
          let availableHeight = pageHeight - margin - cursorY;
          if (hasContent && availableHeight < 1) {
            pdf.addPage();
            cursorY = margin;
            availableHeight = contentHeight;
          }

          const remainingRenderedHeight = ((canvas.height - sourceY) * contentWidth) / canvas.width;
          const renderedSliceHeight = Math.min(remainingRenderedHeight, availableHeight);
          const sliceHeight = Math.max(1, Math.min(
            canvas.height - sourceY,
            Math.floor((renderedSliceHeight * canvas.width) / contentWidth)
          ));
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const sliceContext = sliceCanvas.getContext('2d');
          if (!sliceContext) throw new Error('Unable to prepare an analytics PDF page.');
          sliceContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const sliceImage = sliceCanvas.toDataURL('image/png');
          const actualSliceHeight = (sliceHeight * contentWidth) / canvas.width;

          pdf.addImage(sliceImage, 'PNG', margin, cursorY, contentWidth, actualSliceHeight, undefined, 'FAST');
          hasContent = true;
          sourceY += sliceHeight;

          if (sourceY < canvas.height) {
            pdf.addPage();
            cursorY = margin;
          } else {
            cursorY += actualSliceHeight + 5;
          }
        }
      }

      if (!hasContent) {
        throw new Error('Analytics charts could not be rendered for export.');
      }

      const safeFileName = String(fileName || '').trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
      const safeDateLabel = `${appliedFilters.startDate || 'start'}-${appliedFilters.endDate || 'end'}`.replace(/[^\w-]+/g, '-');
      pdf.save(safeFileName ? `eduroute-${safeFileName}.pdf` : `eduroute-hrmu-analytics-${safeDateLabel}.pdf`);
      setExportMessage('Analytics PDF downloaded successfully.');
    } catch (requestError) {
      setError(requestError?.message || 'Analytics PDF export failed.');
      throw requestError;
    } finally {
      exportSurface?.remove();
      setExporting(false);
    }
  }, [appliedFilters]);

  const exportCsv = useCallback(({ filename, rows }) => {
    downloadCsvFile({ filename, rows });
    setExportMessage('Analytics CSV downloaded successfully.');
  }, []);

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
  const employeeOptions = Array.isArray(analytics?.availableEmployees) ? analytics.availableEmployees : [];

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
    employeeOptions,
    updateFilter,
    applyFilters,
    reload: loadAnalytics,
    generateSmartAnalytics,
    exportPdf,
    exportCsv,
  };
};
