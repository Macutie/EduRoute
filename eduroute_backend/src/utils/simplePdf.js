const escapePdfText = (value = '') => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const buildWrappedLines = (text, maxChars = 88) => {
    const source = String(text || '').trim();
    if (!source) return [''];

    const words = source.split(/\s+/);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            return;
        }

        if (current) lines.push(current);
        current = word;
    });

    if (current) lines.push(current);
    return lines;
};

const buildHrmuMonthlyReportPdf = ({ reportMeta, summary, locatorSlipLogs }) => {
    const pageWidth = 595;
    const pageHeight = 842;
    const marginLeft = 48;
    const marginRight = 48;
    const topStart = 790;
    const bottomLimit = 58;
    const lineHeight = 17;
    const pages = [];
    let currentPage = [];
    let currentY = topStart;

    const addLine = (text, options = {}) => {
        const {
            size = 12,
            x = marginLeft,
            yStep = lineHeight,
        } = options;

        if (currentY < bottomLimit) {
            pages.push(currentPage);
            currentPage = [];
            currentY = topStart;
        }

        currentPage.push({
            text: escapePdfText(text),
            size,
            x,
            y: currentY,
        });
        currentY -= yStep;
    };

    const addParagraph = (text, options = {}) => {
        buildWrappedLines(text, options.maxChars || 88).forEach((line) => {
            addLine(line, options);
        });
    };

    const reportId = `HRMU-${reportMeta.year}-${String(reportMeta.monthIndex).padStart(2, '0')}-SEC`;
    const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    addLine('EduRoute HRMU', { size: 18, yStep: 22 });
    addLine('FACULTY MOVEMENT', { size: 13, yStep: 24 });
    addLine(reportMeta.title || 'Monthly Security Report', { size: 20, yStep: 26 });
    addLine(`Report ID: ${reportId}`, { size: 11 });
    addLine(`Generated: ${generatedDate}`, { size: 11 });
    addLine(`Coverage: ${reportMeta.monthName}, ${reportMeta.year}`, { size: 11, yStep: 24 });

    addLine('Monthly Movement & Violation Summary', { size: 16, yStep: 24 });
    addParagraph(
        `This report provides a comprehensive overview of logistical activities, security transitions, and flagged trip incidents within the HRMU jurisdiction for month of ${reportMeta.monthName}.`,
        { size: 11, yStep: 15, maxChars: 92 }
    );

    addLine('', { size: 10, yStep: 10 });
    addLine(`Total Movements: ${summary.totalMovements || 0}`, { size: 12 });
    addLine(`Flagged Incidents: ${summary.flaggedIncidents || 0}`, { size: 12 });
    addLine(`Compliance Rate: ${Number(summary.complianceRate || 0).toFixed(1)}%`, { size: 12 });
    addLine(`Late Returns: ${summary.lateReturns || 0}`, { size: 11 });
    addLine(`Unverified Locations: ${summary.unverifiedLocations || 0}`, { size: 11 });
    addLine(`Disconnected Locations: ${summary.disconnectedLocations || 0}`, { size: 11, yStep: 24 });

    addLine('Key Incident Log', { size: 15, yStep: 22 });
    addLine('Timestamp | Location | Personnel | Status', { size: 11, yStep: 18 });

    if (!Array.isArray(locatorSlipLogs) || locatorSlipLogs.length === 0) {
      addLine('No logs found for this month.', { size: 11 });
    } else {
        locatorSlipLogs.forEach((row, index) => {
            addLine(`${index + 1}. ${row.timestampLabel || '--'} | ${row.status || '--'}`, { size: 11, yStep: 16 });
            addParagraph(`Location: ${row.location || 'Unknown destination'}`, { size: 10, yStep: 14, maxChars: 92 });
            addParagraph(`Personnel: ${row.personnel || 'Unknown faculty'}`, { size: 10, yStep: 14, maxChars: 92 });

            if (Array.isArray(row.flaggedReasons) && row.flaggedReasons.length > 0) {
                addParagraph(
                    `Flagged Reasons: ${row.flaggedReasons.map((reason) => reason.label).join(', ')}`,
                    { size: 10, yStep: 14, maxChars: 92 }
                );
            }

            addLine('', { size: 10, yStep: 10 });
        });
    }

    if (currentPage.length) {
        pages.push(currentPage);
    }

    const objectEntries = [];
    const pageObjectIds = [];
    const fontObjectId = 3;
    const firstContentObjectId = 4;

    pages.forEach((page, index) => {
        const contentStream = [
            'BT',
            ...page.flatMap((line) => ([
                `/F1 ${line.size} Tf`,
                `1 0 0 1 ${line.x} ${line.y} Tm`,
                `(${line.text}) Tj`,
            ])),
            'ET',
        ].join('\n');

        const contentObjectId = firstContentObjectId + (index * 2);
        const pageObjectId = contentObjectId + 1;

        objectEntries[contentObjectId] = `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`;
        objectEntries[pageObjectId] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
        pageObjectIds.push(pageObjectId);
    });

    objectEntries[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objectEntries[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objectEntries[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    const normalizedObjects = objectEntries
        .map((entry, index) => (entry ? `${index} 0 obj\n${entry}\nendobj\n` : null))
        .filter(Boolean);
    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    normalizedObjects.forEach((entry) => {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += entry;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${normalizedObjects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${normalizedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
};

module.exports = {
    buildHrmuMonthlyReportPdf,
};
