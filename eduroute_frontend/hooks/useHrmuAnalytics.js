import { useCallback, useEffect, useMemo, useState } from 'react';
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

const drawDailyMovementSection = (pdf, reportData) => {
  const sectionY = 126;
  const leftX = PDF_PAGE.margin;
  const sectionW = 132;
  const sectionH = 84;
  const rowH = 7.5;
  const headerH = 10;
  const dayColW = 24;

  pdf.setDrawColor(226, 233, 223);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(leftX, sectionY, sectionW, sectionH, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(14, 168, 37);
  pdf.text('Daily Faculty Movement', leftX + 6, sectionY + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(94, 111, 142);
  pdf.text(
    reportData.dailyMovementSubtitle || 'Tracking locator slip volume across the five HRMU colleges',
    leftX + 6,
    sectionY + 16,
  );

  const tableY = sectionY + 22;
  const countColW = sectionW - dayColW - 12;
  pdf.setFillColor(247, 248, 247);
  pdf.rect(leftX + 6, tableY, dayColW, headerH, 'F');
  pdf.rect(leftX + 6 + dayColW, tableY, countColW, headerH, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(125, 137, 156);
  pdf.text('DAY', leftX + 10, tableY + 6.5);
  pdf.text('LOCATOR SLIPS', leftX + 6 + dayColW + 4, tableY + 6.5);

  const rows = (reportData.dailyRows || []).slice(0, 7);
  rows.forEach((row, index) => {
    const y = tableY + headerH + (index * rowH);
    pdf.setDrawColor(234, 239, 229);
    pdf.line(leftX + 6, y, leftX + sectionW - 6, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(28, 39, 64);
    pdf.text(String(row.label || '--'), leftX + 10, y + 5.5);
    pdf.text(String(row.value ?? 0), leftX + 6 + dayColW + 4, y + 5.5);
  });
};

const drawApprovalRateSection = (pdf, reportData) => {
  const x = 152;
  const y = 126;
  const w = 44;
  const h = 84;

  pdf.setFillColor(11, 163, 31);
  pdf.roundedRect(x, y, w, h, 2, 2, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Approval Rate', x + 6, y + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  pdf.text('Request vs Approval efficiency', x + 6, y + 16);

  pdf.setDrawColor(255, 204, 51);
  pdf.setFillColor(255, 204, 51);
  pdf.circle(x + 22, y + 36, 11, 'S');
  pdf.setFillColor(11, 163, 31);
  pdf.circle(x + 22, y + 36, 7.5, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(reportData.approvalRate || '0%', x + 22, y + 37.5, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text((reportData.approvalStatusLabel || 'IN REVIEW'), x + 22, y + 44.5, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.4);
  const approvalNoteLines = pdf.splitTextToSize(reportData.approvalNote || '', w - 12);
  const approvalTrendLines = pdf.splitTextToSize(reportData.approvalTrend || '', w - 12);
  pdf.text(approvalNoteLines.slice(0, 2), x + 6, y + 57);
  pdf.text(approvalTrendLines.slice(0, 3), x + 6, y + 67);
};

const drawFrequentDestinationsSection = (pdf, reportData) => {
  const x = PDF_PAGE.margin;
  const y = 58;
  const w = 80;
  const h = 126;

  pdf.setDrawColor(226, 233, 223);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(14, 168, 37);
  pdf.text('Frequent Destinations', x + 6, y + 12);

  const rows = (reportData.frequentDestinations || []).slice(0, 5);
  const maxCount = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  rows.forEach((row, index) => {
    const rowY = y + 22 + (index * 19);
    pdf.setFillColor(240, 248, 237);
    pdf.circle(x + 10, rowY, 5.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(14, 168, 37);
    pdf.text(String(row.rank || index + 1), x + 10, rowY + 1.5, { align: 'center' });

    pdf.setTextColor(28, 39, 64);
    pdf.setFontSize(7.8);
    const destinationLines = pdf.splitTextToSize(String(row.label || '--'), 50);
    pdf.text(destinationLines.slice(0, 2), x + 18, rowY - 1);

    pdf.setDrawColor(222, 228, 220);
    pdf.setLineWidth(2.5);
    pdf.line(x + 18, rowY + 6, x + 64, rowY + 6);
    pdf.setDrawColor(14, 168, 37);
    pdf.line(x + 18, rowY + 6, x + 18 + ((Number(row.count || 0) / maxCount) * 46), rowY + 6);

    pdf.setFont('helvetica', 'bold');
    pdf.text(String(row.count || 0), x + 70, rowY - 1, { align: 'right' });
  });
};

const drawMonthlyPerformanceSection = (pdf, reportData) => {
  const x = 98;
  const y = 58;
  const w = 98;
  const h = 126;
  const cardW = 21;
  const cardH = 34;
  const cardGap = 3;

  pdf.setDrawColor(226, 233, 223);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(14, 168, 37);
  pdf.text('Monthly Performance Summary', x + 6, y + 12);

  (reportData.summaryCards || []).slice(0, 4).forEach((card, index) => {
    const cardX = x + 6 + (index * (cardW + cardGap));
    const cardY = y + 18;
    const accentMap = {
      green: [14, 168, 37],
      yellow: [255, 204, 51],
      dark: [109, 117, 130],
    };
    const accent = accentMap[card.tone] || accentMap.green;

    pdf.setFillColor(247, 248, 247);
    pdf.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'F');
    pdf.setFillColor(...accent);
    pdf.rect(cardX, cardY, 1.2, cardH, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.6);
    pdf.setTextColor(125, 137, 156);
    pdf.text(String(card.label || ''), cardX + 3.5, cardY + 6, { maxWidth: cardW - 5 });

    pdf.setFontSize(7.8);
    pdf.setTextColor(28, 39, 64);
    const valueLines = pdf.splitTextToSize(String(card.value || '--'), cardW - 5);
    pdf.text(valueLines.slice(0, 3), cardX + 3.5, cardY + 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.4);
    pdf.setTextColor(94, 111, 142);
    const noteLines = pdf.splitTextToSize(String(card.note || ''), cardW - 5);
    pdf.text(noteLines.slice(0, 3), cardX + 3.5, cardY + 25);
  });

  pdf.setDrawColor(234, 239, 229);
  pdf.line(x + 6, y + 65, x + w - 6, y + 65);

  const milestoneY = y + 86;
  const milestoneStartX = x + 10;
  const currentStep = Number(reportData.currentMilestoneStep || 3);
  for (let index = 0; index < 5; index += 1) {
    const cx = milestoneStartX + (index * 13);
    const isDone = index + 1 < currentStep;
    const isCurrent = index + 1 === currentStep;
    if (index > 0) {
      pdf.setDrawColor(isDone ? 14 : 214, isDone ? 168 : 220, isDone ? 37 : 214);
      pdf.setLineWidth(1);
      pdf.line(cx - 8, milestoneY, cx - 3, milestoneY);
    }
    if (isDone) {
      pdf.setFillColor(14, 168, 37);
      pdf.circle(cx, milestoneY, 4.5, 'F');
      pdf.setTextColor(255, 255, 255);
    } else if (isCurrent) {
      pdf.setDrawColor(14, 168, 37);
      pdf.setFillColor(255, 255, 255);
      pdf.circle(cx, milestoneY, 4.5, 'FD');
      pdf.setTextColor(14, 168, 37);
    } else {
      pdf.setFillColor(239, 243, 238);
      pdf.circle(cx, milestoneY, 4.5, 'F');
      pdf.setTextColor(109, 117, 130);
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(String(index + 1), cx, milestoneY + 1.7, { align: 'center' });
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(14, 168, 37);
  pdf.text('CURRENT MILESTONE', x + 60, y + 83);

  pdf.setFontSize(8.5);
  pdf.setTextColor(28, 39, 64);
  const milestoneLines = pdf.splitTextToSize(String(reportData.currentMilestoneLabel || 'HRMU Verification Finalized'), 32);
  pdf.text(milestoneLines, x + 60, y + 91);
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

  const exportPdf = useCallback(async ({ reportData }) => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    await drawHeader(pdf, reportData);
    drawOverviewIntro(pdf);
    drawFilters(pdf, reportData);
    drawSummaryCards(pdf, reportData);
    drawDailyMovementSection(pdf, reportData);
    drawApprovalRateSection(pdf, reportData);

    pdf.addPage();
    await drawHeader(pdf, reportData);
    drawFrequentDestinationsSection(pdf, reportData);
    drawMonthlyPerformanceSection(pdf, reportData);

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
