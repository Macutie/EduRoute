const fs = require('fs');
const path = require('path');

const escapePdfText = (value = '') => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const mmToPt = (value) => value * 2.83465;

const rgb = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;

const hexToRgb = (hex) => {
    const normalized = String(hex || '').replace('#', '').trim();
    if (normalized.length !== 6) return [0, 0, 0];
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
    ];
};

const PALETTE = {
    green: [6, 157, 27],
    greenSoft: [239, 247, 236],
    greenText: [12, 104, 29],
    red: [220, 53, 69],
    redSoft: [255, 239, 239],
    redText: [166, 30, 42],
    yellow: [154, 123, 5],
    yellowSoft: [248, 244, 226],
    yellowText: [108, 87, 5],
    ink: [39, 53, 72],
    muted: [112, 124, 139],
    border: [225, 232, 219],
    headerFill: [244, 248, 240],
    cardFill: [245, 249, 241],
    white: [255, 255, 255],
};

const wrapTextByWidth = (text, fontSize, maxWidth) => {
    const source = String(text || '').trim();
    if (!source) return [''];

    const averageCharWidth = fontSize * 0.52;
    const maxChars = Math.max(8, Math.floor(maxWidth / averageCharWidth));
    const words = source.split(/\s+/);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            return;
        }

        if (current) {
            lines.push(current);
            current = word;
            return;
        }

        let remainder = word;
        while (remainder.length > maxChars) {
            lines.push(remainder.slice(0, maxChars));
            remainder = remainder.slice(maxChars);
        }
        current = remainder;
    });

    if (current) lines.push(current);
    return lines;
};

const formatStatusTone = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'VERIFIED') {
        return {
            fill: PALETTE.greenSoft,
            text: PALETTE.greenText,
        };
    }

    if (normalized === 'REJECTED') {
        return {
            fill: PALETTE.redSoft,
            text: PALETTE.redText,
        };
    }

    return {
        fill: PALETTE.yellowSoft,
        text: PALETTE.yellowText,
    };
};

const toneAccent = {
    green: PALETTE.green,
    red: PALETTE.red,
    yellow: [155, 131, 24],
};

const resolveExistingPath = (candidates = []) => candidates.find((candidate) => fs.existsSync(candidate)) || null;

const reportLogoPath = resolveExistingPath([
    path.resolve(process.cwd(), 'public/eduroute-logo.jfif'),
    path.resolve(process.cwd(), '../public/eduroute-logo.jfif'),
    path.resolve(process.cwd(), 'eduroute-logo.jfif'),
    path.resolve(__dirname, '../../public/eduroute-logo.jfif'),
    path.resolve(__dirname, '../../../public/eduroute-logo.jfif'),
]);

const reportLogoBuffer = reportLogoPath ? fs.readFileSync(reportLogoPath) : null;
const reportLogoWidth = 600;
const reportLogoHeight = 600;

const buildHrmuMonthlyReportPdf = ({ reportMeta, summary, locatorSlipLogs }) => {
    const pageWidth = 595;
    const pageHeight = 842;
    const left = 32;
    const right = 32;
    const top = 810;
    const bottom = 54;
    const contentWidth = pageWidth - left - right;
    const pages = [];

    const fonts = {
        regular: 3,
        bold: 4,
    };

    let page = null;
    let cursorY = top;

    const createPage = () => ({
        drawings: [],
        texts: [],
    });

    const ensurePage = () => {
        if (!page) {
            page = createPage();
            pages.push(page);
            cursorY = top;
        }
    };

    const newPage = () => {
        page = createPage();
        pages.push(page);
        cursorY = top;
    };

    const addText = ({
        text,
        x,
        y,
        size = 12,
        color = PALETTE.ink,
        font = fonts.regular,
    }) => {
        ensurePage();
        page.texts.push({
            text: escapePdfText(text),
            x,
            y,
            size,
            color: rgb(...color),
            font,
        });
    };

    const addWrappedText = ({
        text,
        x,
        y,
        width,
        size = 12,
        lineGap = 4,
        color = PALETTE.ink,
        font = fonts.regular,
    }) => {
        const lines = wrapTextByWidth(text, size, width);
        lines.forEach((line, index) => {
            addText({
                text: line,
                x,
                y: y - index * (size + lineGap),
                size,
                color,
                font,
            });
        });
        return lines.length;
    };

    const fillRect = (x, y, width, height, color) => {
        ensurePage();
        page.drawings.push(`q ${rgb(...color)} rg ${x.toFixed(2)} ${(y - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
    };

    const strokeRect = (x, y, width, height, color, lineWidth = 1) => {
        ensurePage();
        page.drawings.push(`q ${rgb(...color)} RG ${lineWidth.toFixed(2)} w ${x.toFixed(2)} ${(y - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
    };

    const drawLine = (x1, y1, x2, y2, color, lineWidth = 1) => {
        ensurePage();
        page.drawings.push(`q ${rgb(...color)} RG ${lineWidth.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
    };

    const drawLogoImage = (x, y, width, height) => {
        if (!reportLogoBuffer) return false;
        ensurePage();
        page.drawings.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(y - height).toFixed(2)} cm /Im1 Do Q`);
        return true;
    };

    const drawPolygon = (points, color) => {
        if (!Array.isArray(points) || points.length < 3) return;
        ensurePage();
        const [first, ...rest] = points;
        const pathOps = [
            `${first[0].toFixed(2)} ${first[1].toFixed(2)} m`,
            ...rest.map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)} l`),
            'h',
        ].join(' ');
        page.drawings.push(`q ${rgb(...color)} rg ${pathOps} f Q`);
    };

    const drawCircleFill = (cx, cy, radius, color) => {
        ensurePage();
        const k = 0.5522847498;
        const c = radius * k;
        const x0 = cx - radius;
        const x1 = cx - c;
        const x2 = cx + c;
        const x3 = cx + radius;
        const y0 = cy - radius;
        const y1 = cy - c;
        const y2 = cy + c;
        const y3 = cy + radius;
        const pathOps = [
            `${cx.toFixed(2)} ${y3.toFixed(2)} m`,
            `${x2.toFixed(2)} ${y3.toFixed(2)} ${x3.toFixed(2)} ${y2.toFixed(2)} ${x3.toFixed(2)} ${cy.toFixed(2)} c`,
            `${x3.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y0.toFixed(2)} ${cx.toFixed(2)} ${y0.toFixed(2)} c`,
            `${x1.toFixed(2)} ${y0.toFixed(2)} ${x0.toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${cy.toFixed(2)} c`,
            `${x0.toFixed(2)} ${y2.toFixed(2)} ${x1.toFixed(2)} ${y3.toFixed(2)} ${cx.toFixed(2)} ${y3.toFixed(2)} c`,
            'h',
        ].join(' ');
        page.drawings.push(`q ${rgb(...color)} rg ${pathOps} f Q`);
    };

    const drawFallbackLogo = (x, y, size) => {
        const centerX = x + size * 0.5;
        const centerY = y - size * 0.44;
        const outerRadius = size * 0.31;
        const innerRadius = size * 0.17;

        drawCircleFill(centerX, centerY, outerRadius, PALETTE.green);
        drawPolygon([
            [centerX - size * 0.15, y - size * 0.62],
            [centerX + size * 0.15, y - size * 0.62],
            [centerX, y - size * 0.95],
        ], PALETTE.green);
        drawCircleFill(centerX, centerY, innerRadius, PALETTE.white);
        drawPolygon([
            [x + size * 0.25, y - size * 0.45],
            [x + size * 0.79, y - size * 0.33],
            [x + size * 0.73, y - size * 0.54],
            [x + size * 0.19, y - size * 0.66],
        ], [255, 209, 0]);
        drawPolygon([
            [x + size * 0.72, y - size * 0.58],
            [x + size * 0.96, y - size * 0.52],
            [x + size * 0.88, y - size * 0.30],
            [x + size * 0.66, y - size * 0.36],
        ], PALETTE.white);
    };

    const reserve = (height) => {
        ensurePage();
        if (cursorY - height < bottom) {
            newPage();
        }
    };

    const moveDown = (value) => {
        cursorY -= value;
    };

    const reportId = `HRMU-${reportMeta.year}-${String(reportMeta.monthIndex).padStart(2, '0')}-SEC`;
    const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const summaryCards = [
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
    ];

    reserve(190);

    const brandIconX = left;
    const brandIconY = cursorY;
    const logoBoxSize = 64;
    const logoInset = 4;
    const logoDrawSize = logoBoxSize - (logoInset * 2);

    fillRect(brandIconX, brandIconY, logoBoxSize, logoBoxSize, PALETTE.white);
    strokeRect(brandIconX, brandIconY, logoBoxSize, logoBoxSize, PALETTE.border, 1);
    if (!drawLogoImage(brandIconX + logoInset, brandIconY - logoInset, logoDrawSize, logoDrawSize)) {
        drawFallbackLogo(brandIconX + logoInset, brandIconY - logoInset, logoDrawSize);
    }

    addText({
        text: 'EduRoute HRMU',
        x: brandIconX + 78,
        y: cursorY - 6,
        size: 13,
        color: PALETTE.green,
        font: fonts.regular,
    });
    addText({
        text: 'FACULTY MOVEMENT',
        x: brandIconX + 78,
        y: cursorY - 23,
        size: 14,
        color: PALETTE.ink,
        font: fonts.regular,
    });

    addText({
        text: 'OFFICIAL DOCUMENT',
        x: pageWidth - right - 140,
        y: cursorY - 4,
        size: 10,
        color: PALETTE.ink,
        font: fonts.bold,
    });
    addText({
        text: `Report Sequence: ${reportMeta.monthIndex} / ${reportMeta.totalMonths || 12}`,
        x: pageWidth - right - 140,
        y: cursorY - 18,
        size: 8,
        color: PALETTE.muted,
        font: fonts.regular,
    });
    addText({
        text: `Coverage: ${reportMeta.monthName}, ${reportMeta.year}`,
        x: pageWidth - right - 140,
        y: cursorY - 30,
        size: 8,
        color: PALETTE.muted,
        font: fonts.regular,
    });

    moveDown(50);
    drawLine(left, cursorY, pageWidth - right, cursorY, PALETTE.green, 2);
    moveDown(36);

    addText({
        text: 'Monthly Movement & Violation Summary',
        x: left,
        y: cursorY,
        size: 17,
        color: PALETTE.ink,
        font: fonts.regular,
    });
    moveDown(18);
    fillRect(left, cursorY, 78, 2, [201, 166, 32]);
    moveDown(22);
    addWrappedText({
        text: `This report provides a comprehensive overview of logistical activities, security transitions, and flagged trip incidents within the HRMU jurisdiction for month of ${reportMeta.monthName}.`,
        x: left,
        y: cursorY,
        width: contentWidth,
        size: 10,
        lineGap: 5,
        color: PALETTE.muted,
    });
    moveDown(62);

    const cardGap = 14;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const cardHeight = 74;

    summaryCards.forEach((card, index) => {
        const x = left + (cardWidth + cardGap) * index;
        fillRect(x, cursorY, cardWidth, cardHeight, PALETTE.cardFill);
        fillRect(x, cursorY, 3, cardHeight, toneAccent[card.tone] || PALETTE.green);
        addText({
            text: card.label,
            x: x + 16,
            y: cursorY - 18,
            size: 8,
            color: PALETTE.muted,
            font: fonts.bold,
        });
        addText({
            text: card.value,
            x: x + 16,
            y: cursorY - 40,
            size: 18,
            color: PALETTE.ink,
            font: fonts.regular,
        });
        addWrappedText({
            text: card.note,
            x: x + 16,
            y: cursorY - 58,
            width: cardWidth - 28,
            size: 8,
            lineGap: 3,
            color: PALETTE.muted,
        });
    });

    moveDown(cardHeight + 28);

    addText({
        text: 'Key Incident Log',
        x: left + 22,
        y: cursorY,
        size: 14,
        color: PALETTE.ink,
        font: fonts.regular,
    });
    addText({
        text: '[]',
        x: left,
        y: cursorY,
        size: 12,
        color: PALETTE.green,
        font: fonts.bold,
    });
    moveDown(20);

    const tableX = left;
    const tableWidth = contentWidth;
    const headerHeight = 32;
    const columns = [
        { key: 'timestampLabel', label: 'TIMESTAMP', width: 86 },
        { key: 'location', label: 'LOCATION', width: 155 },
        { key: 'personnel', label: 'PERSONNEL', width: 126 },
        { key: 'status', label: 'STATUS', width: 90 },
        { key: 'action', label: 'ACTION', width: 74 },
    ];

    const drawTableHeader = () => {
        reserve(headerHeight + 8);
        fillRect(tableX, cursorY, tableWidth, headerHeight, PALETTE.headerFill);
        strokeRect(tableX, cursorY, tableWidth, headerHeight, PALETTE.border, 1);
        let x = tableX;
        columns.forEach((column) => {
            addText({
                text: column.label,
                x: x + 10,
                y: cursorY - 20,
                size: 8,
                color: PALETTE.muted,
                font: fonts.bold,
            });
            x += column.width;
            if (x < tableX + tableWidth - 2) {
                drawLine(x, cursorY, x, cursorY - headerHeight, PALETTE.border, 1);
            }
        });
        moveDown(headerHeight);
    };

    drawTableHeader();

    const rows = Array.isArray(locatorSlipLogs) ? locatorSlipLogs : [];
    const bodyFontSize = 8.8;
    const bodyLineGap = 3;

    if (rows.length === 0) {
        reserve(38);
        strokeRect(tableX, cursorY, tableWidth, 38, PALETTE.border, 1);
        addText({
            text: 'No logs found for this month.',
            x: tableX + 12,
            y: cursorY - 22,
            size: 9,
            color: PALETTE.muted,
            font: fonts.regular,
        });
        moveDown(38);
    } else {
        rows.forEach((row) => {
            const cellData = [
                wrapTextByWidth(row.timestampLabel || '--', bodyFontSize, columns[0].width - 16),
                wrapTextByWidth(row.location || 'Unknown destination', bodyFontSize, columns[1].width - 16),
                wrapTextByWidth(row.personnel || 'Unknown faculty', bodyFontSize, columns[2].width - 16),
                [String(row.status || '--').toUpperCase()],
                ['Details'],
            ];

            const maxLines = Math.max(...cellData.slice(0, 3).map((lines) => lines.length), 1);
            const rowHeight = Math.max(34, 14 + maxLines * (bodyFontSize + bodyLineGap));

            if (cursorY - rowHeight < bottom) {
                newPage();
                drawTableHeader();
            }

            strokeRect(tableX, cursorY, tableWidth, rowHeight, PALETTE.border, 1);

            let x = tableX;
            columns.forEach((column, columnIndex) => {
                if (columnIndex > 0) {
                    drawLine(x, cursorY, x, cursorY - rowHeight, PALETTE.border, 1);
                }

                if (column.key === 'status') {
                    const tone = formatStatusTone(row.status);
                    const pillWidth = 54;
                    const pillHeight = 18;
                    const pillX = x + 18;
                    const pillY = cursorY - 8;
                    fillRect(pillX, pillY, pillWidth, pillHeight, tone.fill);
                    addText({
                        text: String(row.status || '--').toUpperCase(),
                        x: pillX + 8,
                        y: pillY - 12,
                        size: 7.5,
                        color: tone.text,
                        font: fonts.bold,
                    });
                } else if (column.key === 'action') {
                    addText({
                        text: 'Details',
                        x: x + 16,
                        y: cursorY - 20,
                        size: 8.5,
                        color: PALETTE.green,
                        font: fonts.bold,
                    });
                } else {
                    cellData[columnIndex].forEach((line, lineIndex) => {
                        addText({
                            text: line,
                            x: x + 10,
                            y: cursorY - 18 - lineIndex * (bodyFontSize + bodyLineGap),
                            size: bodyFontSize,
                            color: PALETTE.ink,
                            font: fonts.regular,
                        });
                    });
                }

                x += column.width;
            });

            moveDown(rowHeight);
        });
    }

    const objectEntries = [];
    const pageObjectIds = [];
    const fontRegularObjectId = 3;
    const fontBoldObjectId = 4;
    const imageObjectId = reportLogoBuffer ? 5 : null;
    const firstContentObjectId = reportLogoBuffer ? 6 : 5;

    pages.forEach((pdfPage, index) => {
        const textOps = pdfPage.texts.flatMap((line) => ([
            'BT',
            `${line.color} rg`,
            `/F${line.font === fonts.bold ? 2 : 1} ${line.size} Tf`,
            `1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`,
            `(${line.text}) Tj`,
            'ET',
        ]));

        const contentStream = [
            ...pdfPage.drawings,
            ...textOps,
        ].join('\n');

        const contentObjectId = firstContentObjectId + (index * 2);
        const pageObjectId = contentObjectId + 1;

        objectEntries[contentObjectId] = Buffer.from(`<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`, 'utf8');
        objectEntries[pageObjectId] =
            Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >>${reportLogoBuffer ? ` /XObject << /Im1 ${imageObjectId} 0 R >>` : ''} >> /Contents ${contentObjectId} 0 R >>`, 'utf8');
        pageObjectIds.push(pageObjectId);
    });

    objectEntries[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'utf8');
    objectEntries[2] = Buffer.from(`<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`, 'utf8');
    objectEntries[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'utf8');
    objectEntries[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>', 'utf8');
    if (reportLogoBuffer) {
        objectEntries[imageObjectId] = Buffer.concat([
            Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${reportLogoWidth} /Height ${reportLogoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${reportLogoBuffer.length} >>\nstream\n`, 'utf8'),
            reportLogoBuffer,
            Buffer.from('\nendstream', 'utf8'),
        ]);
    }

    const normalizedObjects = objectEntries
        .map((entry, index) => (entry ? Buffer.concat([
            Buffer.from(`${index} 0 obj\n`, 'utf8'),
            Buffer.isBuffer(entry) ? entry : Buffer.from(String(entry), 'utf8'),
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

module.exports = {
    buildHrmuMonthlyReportPdf,
};
