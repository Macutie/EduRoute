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

const PDF_PAGE = {
  width: 210,
  height: 297,
  margin: 14,
};

const loadImageDataUrl = async (src) => {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Unable to load image asset: ${src}`);
  }

  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read image asset: ${src}`));
    reader.readAsDataURL(blob);
  });
};

const captureSection = async (element) => {
  if (!element) {
    throw new Error('Analytics export section was not found.');
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#FFFFFF',
    scale: 2,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: -window.scrollY,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: Math.max(element.scrollWidth, element.clientWidth),
    windowHeight: Math.max(element.scrollHeight, element.clientHeight),
  });

  return {
    imageData: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
};

const drawHeader = async (pdf, { dateRangeLabel, departmentLabel }) => {
  const logoTop = 16;
  const logoLeft = PDF_PAGE.margin;
  const metaX = 140;

  try {
    const logoData = await loadImageDataUrl('/eduroute-logo.png');
    pdf.addImage(logoData, 'PNG', logoLeft, logoTop, 16, 20, undefined, 'FAST');
  } catch (error) {
    pdf.setDrawColor(230, 236, 227);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(logoLeft, logoTop, 16, 20, 2, 2, 'FD');
  }

  pdf.setTextColor(18, 164, 35);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text('EduRoute HRMU', logoLeft + 22, 22);

  pdf.setTextColor(28, 39, 64);
  pdf.setFontSize(14);
  pdf.text('ANALYTICS & REPORTING', logoLeft + 22, 31);

  pdf.setTextColor(34, 52, 84);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.text('OFFICIAL DOCUMENT', metaX, 21);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(94, 111, 142);
  pdf.text(`Coverage: ${dateRangeLabel}`, metaX, 29);
  pdf.text(`Department: ${departmentLabel}`, metaX, 36);

  pdf.setDrawColor(13, 158, 45);
  pdf.setLineWidth(1);
  pdf.line(PDF_PAGE.margin, 46, PDF_PAGE.width - PDF_PAGE.margin, 46);
};

const drawOverviewIntro = (pdf) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(28, 39, 64);
  pdf.text('Analytics & Reporting Overview', PDF_PAGE.margin, 60);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(115, 129, 150);
  pdf.text(
    'Advanced insights into faculty movement and departmental flow across campus transit routes.',
    PDF_PAGE.margin,
    68,
  );
};

const drawFilters = (pdf, { dateRangeLabel, departmentLabel }) => {
  const boxY = 74;
  const boxH = 16;
  const leftW = 86;
  const rightW = 86;
  const gap = 10;

  pdf.setDrawColor(226, 233, 223);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(PDF_PAGE.margin, boxY, leftW, boxH, 'FD');
  pdf.rect(PDF_PAGE.margin + leftW + gap, boxY, rightW, boxH, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(125, 137, 156);
  pdf.text('DATE RANGE', PDF_PAGE.margin + 4, boxY + 5);
  pdf.text('DEPARTMENT', PDF_PAGE.margin + leftW + gap + 4, boxY + 5);

  pdf.setFontSize(8.5);
  pdf.setTextColor(28, 39, 64);
  pdf.text(dateRangeLabel, PDF_PAGE.margin + 4, boxY + 12);
  pdf.text(departmentLabel, PDF_PAGE.margin + leftW + gap + 4, boxY + 12);
};

const drawSummaryCards = (pdf, { totalTrips, approvalRate, approvalNote, users, usersNote }) => {
  const startY = 96;
  const cardW = 44;
  const cardH = 24;
  const gap = 10;
  const specs = [
    { x: PDF_PAGE.margin, label: 'TOTAL TRIPS', value: totalTrips, note: '', accent: [14, 168, 37] },
    { x: PDF_PAGE.margin + cardW + gap, label: 'APPROVAL RATE', value: approvalRate, note: approvalNote, accent: [180, 148, 0] },
    { x: PDF_PAGE.margin + (cardW + gap) * 2, label: 'USERS', value: users, note: usersNote, accent: [14, 168, 37] },
  ];

  specs.forEach((card) => {
    pdf.setFillColor(245, 249, 239);
    pdf.rect(card.x, startY, cardW, cardH, 'F');
    pdf.setFillColor(...card.accent);
    pdf.rect(card.x, startY, 1.2, cardH, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(125, 137, 156);
    pdf.text(card.label, card.x + 4, startY + 6);

    pdf.setFontSize(15);
    pdf.setTextColor(28, 39, 64);
    pdf.text(card.value, card.x + 4, startY + 16);

    if (card.note) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.8);
      pdf.setTextColor(94, 111, 142);
      pdf.text(card.note, card.x + 4, startY + 21);
    }
  });
};

const drawSectionImage = (pdf, section, x, y, maxWidth) => {
  const height = (section.height * maxWidth) / section.width;
  pdf.addImage(section.imageData, 'PNG', x, y, maxWidth, height, undefined, 'FAST');
  return height;
};

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

  const exportPdf = useCallback(async ({ topGridElement, bottomGridElement, reportData }) => {
    if (!topGridElement || !bottomGridElement) {
      throw new Error('Analytics export sections were not found.');
    }

    const [topGridSection, bottomGridSection] = await Promise.all([
      captureSection(topGridElement),
      captureSection(bottomGridElement),
    ]);

    const pdf = new jsPDF('p', 'mm', 'a4');
    await drawHeader(pdf, reportData);
    drawOverviewIntro(pdf);
    drawFilters(pdf, reportData);
    drawSummaryCards(pdf, reportData);
    drawSectionImage(pdf, topGridSection, PDF_PAGE.margin, 126, PDF_PAGE.width - (PDF_PAGE.margin * 2));

    pdf.addPage();
    await drawHeader(pdf, reportData);
    drawSectionImage(pdf, bottomGridSection, PDF_PAGE.margin, 58, PDF_PAGE.width - (PDF_PAGE.margin * 2));

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
