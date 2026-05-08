const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const CONTENT_X = 32;
const CONTENT_WIDTH = PAGE_WIDTH - 64;
const HEADER_TOP = 32;
const LOGO_SIZE = 48;
const ROW_HEIGHT = 44;
const TABLE_HEADER_HEIGHT = 32;
const MAX_ROWS_FIRST_PAGE = 10;
const MAX_ROWS_OTHER_PAGES = 13;

const COLORS = {
    pageBg: '#ffffff',
    ink: '#263548',
    muted: '#71808f',
    green: '#069d1b',
    greenSoft: '#edf7ec',
    greenText: '#0c681d',
    red: '#dc3545',
    redSoft: '#ffefef',
    redText: '#a61e2a',
    yellow: '#9a7b05',
    yellowSoft: '#f8f4e2',
    yellowText: '#6c5705',
    border: '#e1e8db',
    headerFill: '#f4f8f0',
    cardFill: '#f5f9f1',
    gold: '#c9a620',
};

const escapeXml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const formatStatusTone = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'VERIFIED') {
        return { fill: COLORS.greenSoft, text: COLORS.greenText };
    }
    if (normalized === 'REJECTED') {
        return { fill: COLORS.redSoft, text: COLORS.redText };
    }
    return { fill: COLORS.yellowSoft, text: COLORS.yellowText };
};

const toneAccent = {
    green: COLORS.green,
    red: COLORS.red,
    yellow: '#9b8318',
};

const resolveExistingPath = (candidates = []) => candidates.find((candidate) => fs.existsSync(candidate)) || null;

const reportLogoPath = resolveExistingPath([
    path.resolve(__dirname, '../assets/gc-logo-pdf.jpg'),
    path.resolve(__dirname, '../assets/gc-logo-header.jpg'),
    path.resolve(__dirname, '../assets/gc-logo.jpg'),
    path.resolve(process.cwd(), 'public/gc-logo-pdf.jpg'),
    path.resolve(process.cwd(), 'public/gc-logo-header.jpg'),
    path.resolve(process.cwd(), 'public/gc-logo.jpg'),
    path.resolve(__dirname, '../../public/gc-logo-pdf.jpg'),
    path.resolve(__dirname, '../../public/gc-logo-header.jpg'),
    path.resolve(__dirname, '../../public/gc-logo.jpg'),
    path.resolve(__dirname, '../../../public/gc-logo-pdf.jpg'),
    path.resolve(__dirname, '../../../public/gc-logo-header.jpg'),
    path.resolve(__dirname, '../../../public/gc-logo.jpg'),
]);

const reportLogoDataUri = reportLogoPath
    ? `data:image/jpeg;base64,${fs.readFileSync(reportLogoPath).toString('base64')}`
    : null;

const wrapTextByWidth = (text, maxChars) => {
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

const chunkRows = (rows) => {
    if (!rows.length) return [[]];
    const pages = [];
    let index = 0;
    pages.push(rows.slice(index, index + MAX_ROWS_FIRST_PAGE));
    index += MAX_ROWS_FIRST_PAGE;
    while (index < rows.length) {
        pages.push(rows.slice(index, index + MAX_ROWS_OTHER_PAGES));
        index += MAX_ROWS_OTHER_PAGES;
    }
    return pages;
};

const buildSummaryCards = (summary) => ([
    {
        label: 'TOTAL MOVEMENTS',
        value: String(summary.totalMovements || 0),
        note: `${summary.successfulTrips || 0} successful trips`,
        tone: 'green',
    },
    {
        label: 'FLAGGED INCIDENTS',
        value: String(summary.flaggedIncidents || 0),
        note: `${summary.lateReturns || 0} late | ${summary.unverifiedLocations || 0} unverified | ${summary.disconnectedLocations || 0} disconnected`,
        tone: 'red',
    },
    {
        label: 'COMPLIANCE RATE',
        value: `${Number(summary.complianceRate || 0).toFixed(1)}%`,
        note: `${summary.successfulTrips || 0} compliant / ${summary.totalMovements || 0} total`,
        tone: 'yellow',
    },
]);

const renderSummaryCards = (summaryCards) => {
    const cardGap = 14;
    const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
    const cardHeight = 74;
    const y = 292;

    return summaryCards.map((card, index) => {
        const x = CONTENT_X + (cardWidth + cardGap) * index;
        const noteLines = wrapTextByWidth(card.note, 28);
        return `
            <g transform="translate(${x}, ${y})">
                <rect width="${cardWidth}" height="${cardHeight}" rx="0" fill="${COLORS.cardFill}" />
                <rect width="3" height="${cardHeight}" fill="${toneAccent[card.tone] || COLORS.green}" />
                <text x="16" y="20" font-size="8" font-weight="700" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">${escapeXml(card.label)}</text>
                <text x="16" y="50" font-size="18" font-weight="500" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">${escapeXml(card.value)}</text>
                ${noteLines.map((line, noteIndex) => `
                    <text x="16" y="${74 + noteIndex * 11 - 18}" font-size="8" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">${escapeXml(line)}</text>
                `).join('')}
            </g>
        `;
    }).join('');
};

const renderTable = (rows, tableY) => {
    const columns = [
        { key: 'timestampLabel', label: 'TIMESTAMP', width: 86 },
        { key: 'location', label: 'LOCATION', width: 155 },
        { key: 'personnel', label: 'PERSONNEL', width: 126 },
        { key: 'status', label: 'STATUS', width: 90 },
        { key: 'action', label: 'ACTION', width: 74 },
    ];

    const header = `
        <g transform="translate(${CONTENT_X}, ${tableY})">
            <rect width="${CONTENT_WIDTH}" height="${TABLE_HEADER_HEIGHT}" fill="${COLORS.headerFill}" stroke="${COLORS.border}" stroke-width="1" />
            ${columns.reduce((acc, column, index) => {
                const x = columns.slice(0, index).reduce((sum, item) => sum + item.width, 0);
                const divider = index > 0
                    ? `<line x1="${x}" y1="0" x2="${x}" y2="${TABLE_HEADER_HEIGHT}" stroke="${COLORS.border}" stroke-width="1" />`
                    : '';
                return `${acc}${divider}<text x="${x + 10}" y="20" font-size="8" font-weight="700" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">${escapeXml(column.label)}</text>`;
            }, '')}
        </g>
    `;

    if (!rows.length) {
        return `${header}
            <g transform="translate(${CONTENT_X}, ${tableY + TABLE_HEADER_HEIGHT})">
                <rect width="${CONTENT_WIDTH}" height="38" fill="#ffffff" stroke="${COLORS.border}" stroke-width="1" />
                <text x="12" y="24" font-size="9" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">No logs found for this month.</text>
            </g>
        `;
    }

    const body = rows.map((row, rowIndex) => {
        const y = tableY + TABLE_HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
        const tone = formatStatusTone(row.status);
        const values = [
            escapeXml(row.timestampLabel || '--'),
            escapeXml(row.location || 'Unknown destination'),
            escapeXml(row.personnel || 'Unknown faculty'),
        ];
        return `
            <g transform="translate(${CONTENT_X}, ${y})">
                <rect width="${CONTENT_WIDTH}" height="${ROW_HEIGHT}" fill="#ffffff" stroke="${COLORS.border}" stroke-width="1" />
                <line x1="86" y1="0" x2="86" y2="${ROW_HEIGHT}" stroke="${COLORS.border}" stroke-width="1" />
                <line x1="241" y1="0" x2="241" y2="${ROW_HEIGHT}" stroke="${COLORS.border}" stroke-width="1" />
                <line x1="367" y1="0" x2="367" y2="${ROW_HEIGHT}" stroke="${COLORS.border}" stroke-width="1" />
                <line x1="457" y1="0" x2="457" y2="${ROW_HEIGHT}" stroke="${COLORS.border}" stroke-width="1" />
                <text x="10" y="26" font-size="8.8" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">${values[0]}</text>
                <text x="96" y="26" font-size="8.8" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">${values[1]}</text>
                <text x="251" y="26" font-size="8.8" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">${values[2]}</text>
                <rect x="393" y="10" width="54" height="18" rx="0" fill="${tone.fill}" />
                <text x="401" y="22" font-size="7.5" font-weight="700" fill="${tone.text}" font-family="Arial, Helvetica, sans-serif">${escapeXml(String(row.status || '--').toUpperCase())}</text>
                <text x="478" y="26" font-size="8.5" font-weight="700" fill="${COLORS.green}" font-family="Arial, Helvetica, sans-serif">Details</text>
            </g>
        `;
    }).join('');

    return `${header}${body}`;
};

const buildPageSvg = ({ reportMeta, summaryCards, rows, pageIndex }) => {
    const monthName = reportMeta.monthName || 'Month';
    const sequence = `${reportMeta.monthIndex || 1} / ${reportMeta.totalMonths || 12}`;
    const isFirstPage = pageIndex === 0;
    const tableY = isFirstPage ? 454 : 124;

    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
            <rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${COLORS.pageBg}" />

            ${reportLogoDataUri ? `<image href="${reportLogoDataUri}" x="${CONTENT_X}" y="${HEADER_TOP}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" preserveAspectRatio="xMidYMid meet" />` : ''}

            <text x="${CONTENT_X + 58}" y="42" font-size="13" font-weight="500" fill="${COLORS.green}" font-family="Arial, Helvetica, sans-serif">EduRoute HRMU</text>
            <text x="${CONTENT_X + 58}" y="64" font-size="14" font-weight="400" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">FACULTY MOVEMENT</text>

            <text x="${PAGE_WIDTH - 202}" y="38" font-size="10" font-weight="700" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">OFFICIAL DOCUMENT</text>
            <text x="${PAGE_WIDTH - 182}" y="56" font-size="8" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">Report Sequence: ${escapeXml(sequence)}</text>
            <text x="${PAGE_WIDTH - 182}" y="70" font-size="8" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">Coverage: ${escapeXml(monthName)}, ${escapeXml(reportMeta.year)}</text>

            <line x1="${CONTENT_X}" y1="100" x2="${PAGE_WIDTH - CONTENT_X}" y2="100" stroke="${COLORS.green}" stroke-width="2" />

            ${isFirstPage ? `
                <text x="${CONTENT_X}" y="146" font-size="17" font-weight="400" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">Monthly Movement &amp; Violation Summary</text>
                <rect x="${CONTENT_X}" y="170" width="78" height="3" fill="${COLORS.gold}" />
                <text x="${CONTENT_X}" y="216" font-size="10" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">This report provides a comprehensive overview of logistical activities, security transitions, and</text>
                <text x="${CONTENT_X}" y="234" font-size="10" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif">flagged trip incidents within the HRMU jurisdiction for month of ${escapeXml(monthName)}.</text>
                ${renderSummaryCards(summaryCards)}
                <text x="${CONTENT_X}" y="428" font-size="14" font-weight="400" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">Key Incident Log</text>
                <rect x="${CONTENT_X}" y="416" width="3" height="12" fill="${COLORS.green}" />
            ` : `
                <text x="${CONTENT_X}" y="112" font-size="14" font-weight="400" fill="${COLORS.ink}" font-family="Arial, Helvetica, sans-serif">Key Incident Log</text>
                <rect x="${CONTENT_X}" y="100" width="3" height="12" fill="${COLORS.green}" />
            `}

            ${renderTable(rows, tableY)}
        </svg>
    `;
};

const embedJpegPageAsPdf = (jpegBuffer, objectEntries, objectBaseId, pageObjectIds) => {
    const imageObjectId = objectBaseId;
    const contentObjectId = objectBaseId + 1;
    const pageObjectId = objectBaseId + 2;

    objectEntries[imageObjectId] = Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`, 'utf8'),
        jpegBuffer,
        Buffer.from('\nendstream', 'utf8'),
    ]);

    const contentStream = `q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im1 Do Q`;
    objectEntries[contentObjectId] = Buffer.from(`<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`, 'utf8');
    objectEntries[pageObjectId] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im1 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`, 'utf8');
    pageObjectIds.push(pageObjectId);
};

const buildPdfFromJpegs = (jpegBuffers) => {
    const objectEntries = [];
    const pageObjectIds = [];

    jpegBuffers.forEach((jpegBuffer, index) => {
        const baseId = 3 + index * 3;
        embedJpegPageAsPdf(jpegBuffer, objectEntries, baseId, pageObjectIds);
    });

    objectEntries[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'utf8');
    objectEntries[2] = Buffer.from(`<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`, 'utf8');

    const normalizedObjects = objectEntries
        .map((entry, index) => (entry ? Buffer.concat([
            Buffer.from(`${index} 0 obj\n`, 'utf8'),
            entry,
            Buffer.from('\nendobj\n', 'utf8'),
        ]) : null))
        .filter(Boolean);

    const parts = [Buffer.from('%PDF-1.4\n', 'utf8')];
    const offsets = [0];

    normalizedObjects.forEach((entry) => {
        const currentSize = parts.reduce((sum, part) => sum + part.length, 0);
        offsets.push(currentSize);
        parts.push(entry);
    });

    const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
    let xref = `xref\n0 ${normalizedObjects.length + 1}\n`;
    xref += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
        xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    xref += `trailer\n<< /Size ${normalizedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    parts.push(Buffer.from(xref, 'utf8'));

    return Buffer.concat(parts);
};

const buildHrmuMonthlyReportPdf = async ({ reportMeta, summary, locatorSlipLogs }) => {
    const summaryCards = buildSummaryCards(summary || {});
    const rows = Array.isArray(locatorSlipLogs) ? locatorSlipLogs : [];
    const rowPages = chunkRows(rows);

    const jpegBuffers = [];
    for (let index = 0; index < rowPages.length; index += 1) {
        const svg = buildPageSvg({
            reportMeta,
            summaryCards,
            rows: rowPages[index],
            pageIndex: index,
        });

        const jpegBuffer = await sharp(Buffer.from(svg))
            .jpeg({ quality: 96, mozjpeg: true })
            .toBuffer();

        jpegBuffers.push(jpegBuffer);
    }

    return buildPdfFromJpegs(jpegBuffers);
};

module.exports = {
    buildHrmuMonthlyReportPdf,
};
