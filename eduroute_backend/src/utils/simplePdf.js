const fs = require('fs');
const path = require('path');
const {
    PDFDocument,
    StandardFonts,
    rgb,
} = require('pdf-lib');

const PAGE = {
    width: 595.28,
    height: 841.89,
    marginX: 42,
    marginTop: 44,
    marginBottom: 44,
};

const COLORS = {
    green: rgb(6 / 255, 157 / 255, 27 / 255),
    greenSoft: rgb(242 / 255, 248 / 255, 236 / 255),
    greenText: rgb(12 / 255, 104 / 255, 29 / 255),
    red: rgb(220 / 255, 53 / 255, 69 / 255),
    redSoft: rgb(255 / 255, 239 / 255, 239 / 255),
    redText: rgb(166 / 255, 30 / 255, 42 / 255),
    yellow: rgb(139 / 255, 115 / 255, 0 / 255),
    yellowSoft: rgb(248 / 255, 244 / 255, 226 / 255),
    yellowText: rgb(108 / 255, 87 / 255, 5 / 255),
    ink: rgb(39 / 255, 53 / 255, 72 / 255),
    muted: rgb(112 / 255, 124 / 255, 139 / 255),
    border: rgb(225 / 255, 232 / 255, 219 / 255),
    cardFill: rgb(245 / 255, 249 / 255, 241 / 255),
    headerFill: rgb(244 / 255, 248 / 255, 240 / 255),
    white: rgb(1, 1, 1),
};

const REPORT_LOGO_CANDIDATES = [
    path.join(__dirname, '../assets/eduroute-report-logo.jfif'),
    path.join(__dirname, '../assets/eduroute-report-logo.jpg'),
    path.join(__dirname, '../../public/eduroute-logo.jfif'),
    path.join(__dirname, '../../public/eduroute-logo.png'),
];

const wrapTextByWidth = (font, text, size, width) => {
    const source = String(text || '').trim();
    if (!source) return [''];

    const words = source.split(/\s+/);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
            current = candidate;
            return;
        }

        if (current) {
            lines.push(current);
            current = word;
            return;
        }

        let remainder = word;
        while (remainder.length > 0) {
            let splitIndex = remainder.length;
            while (splitIndex > 1 && font.widthOfTextAtSize(remainder.slice(0, splitIndex), size) > width) {
                splitIndex -= 1;
            }
            lines.push(remainder.slice(0, splitIndex));
            remainder = remainder.slice(splitIndex);
        }
        current = '';
    });

    if (current) lines.push(current);
    return lines;
};

const drawWrappedText = (page, font, text, options) => {
    const {
        x,
        y,
        width,
        size,
        color,
        lineGap = 4,
    } = options;

    const lines = wrapTextByWidth(font, text, size, width);
    lines.forEach((line, index) => {
        page.drawText(line, {
            x,
            y: y - index * (size + lineGap),
            size,
            font,
            color,
        });
    });

    return lines.length;
};

const getStatusTone = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'VERIFIED') {
        return {
            fill: COLORS.greenSoft,
            text: COLORS.greenText,
        };
    }

    if (normalized === 'REJECTED') {
        return {
            fill: COLORS.redSoft,
            text: COLORS.redText,
        };
    }

    return {
        fill: COLORS.yellowSoft,
        text: COLORS.yellowText,
    };
};

const getSummaryCards = (summary) => ([
    {
        label: 'TOTAL MOVEMENTS',
        value: String(summary.totalMovements || 0),
        note: `${summary.successfulTrips || 0} successful trips`,
        accent: COLORS.green,
    },
    {
        label: 'FLAGGED INCIDENTS',
        value: String(summary.flaggedIncidents || 0),
        note: `${summary.lateReturns || 0} late | ${summary.unverifiedLocations || 0} unverified | ${summary.disconnectedLocations || 0} disconnected`,
        accent: COLORS.red,
    },
    {
        label: 'COMPLIANCE RATE',
        value: `${Number(summary.complianceRate || 0).toFixed(1)}%`,
        note: `${summary.successfulTrips || 0} compliant / ${summary.totalMovements || 0} total`,
        accent: COLORS.yellow,
    },
]);

const loadLogoBytes = () => {
    const logoPath = REPORT_LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
    return logoPath ? fs.readFileSync(logoPath) : null;
};

const drawHeader = ({ page, fonts, logoImage, reportMeta }) => {
    const topY = PAGE.height - PAGE.marginTop;
    const brandBoxSize = 54;
    const brandBoxX = PAGE.marginX;
    const brandBoxY = topY - brandBoxSize;

    page.drawRectangle({
        x: brandBoxX,
        y: brandBoxY,
        width: brandBoxSize,
        height: brandBoxSize,
        color: COLORS.white,
        borderColor: COLORS.border,
        borderWidth: 1,
    });

    if (logoImage) {
        page.drawImage(logoImage, {
            x: brandBoxX + 4,
            y: brandBoxY + 4,
            width: brandBoxSize - 8,
            height: brandBoxSize - 8,
        });
    }

    page.drawText('EduRoute HRMU', {
        x: brandBoxX + brandBoxSize + 16,
        y: topY - 2,
        size: 15,
        font: fonts.regular,
        color: COLORS.green,
    });

    page.drawText('FACULTY MOVEMENT', {
        x: brandBoxX + brandBoxSize + 16,
        y: topY - 26,
        size: 15,
        font: fonts.regular,
        color: COLORS.ink,
    });

    const rightMetaX = PAGE.width - PAGE.marginX - 150;
    page.drawText('OFFICIAL DOCUMENT', {
        x: rightMetaX,
        y: topY - 1,
        size: 10,
        font: fonts.bold,
        color: COLORS.ink,
    });

    page.drawText(`Report Sequence: ${reportMeta.monthIndex} / ${reportMeta.totalMonths || 12}`, {
        x: rightMetaX,
        y: topY - 17,
        size: 8.5,
        font: fonts.regular,
        color: COLORS.muted,
    });

    page.drawText(`Coverage: ${reportMeta.monthName}, ${reportMeta.year}`, {
        x: rightMetaX,
        y: topY - 31,
        size: 8.5,
        font: fonts.regular,
        color: COLORS.muted,
    });

    page.drawLine({
        start: { x: PAGE.marginX, y: topY - 62 },
        end: { x: PAGE.width - PAGE.marginX, y: topY - 62 },
        thickness: 2,
        color: COLORS.green,
    });

    return topY - 95;
};

const drawSummarySection = ({ page, fonts, summary, reportMeta, startY }) => {
    let y = startY;

    page.drawText('Monthly Movement & Violation Summary', {
        x: PAGE.marginX,
        y,
        size: 18,
        font: fonts.regular,
        color: COLORS.ink,
    });

    page.drawRectangle({
        x: PAGE.marginX,
        y: y - 20,
        width: 78,
        height: 3,
        color: COLORS.yellow,
    });

    const introLines = drawWrappedText(page, fonts.regular, `This report provides a comprehensive overview of logistical activities, security transitions, and flagged trip incidents within the HRMU jurisdiction for month of ${reportMeta.monthName}.`, {
        x: PAGE.marginX,
        y: y - 52,
        width: PAGE.width - PAGE.marginX * 2,
        size: 10.5,
        color: COLORS.muted,
        lineGap: 4,
    });

    y = y - 52 - introLines * 15 - 26;

    const cards = getSummaryCards(summary);
    const gap = 18;
    const cardWidth = (PAGE.width - PAGE.marginX * 2 - gap * 2) / 3;
    const cardHeight = 86;

    cards.forEach((card, index) => {
        const x = PAGE.marginX + index * (cardWidth + gap);
        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: COLORS.cardFill,
        });
        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: 4,
            height: cardHeight,
            color: card.accent,
        });

        page.drawText(card.label, {
            x: x + 16,
            y: y - 18,
            size: 8.5,
            font: fonts.bold,
            color: COLORS.muted,
        });

        page.drawText(card.value, {
            x: x + 16,
            y: y - 42,
            size: 18,
            font: fonts.regular,
            color: COLORS.ink,
        });

        drawWrappedText(page, fonts.regular, card.note, {
            x: x + 16,
            y: y - 60,
            width: cardWidth - 28,
            size: 8.2,
            color: COLORS.muted,
            lineGap: 3,
        });
    });

    return y - cardHeight - 30;
};

const drawTableHeader = ({ page, fonts, columns, y }) => {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);

    page.drawRectangle({
        x: PAGE.marginX,
        y: y - 34,
        width: totalWidth,
        height: 34,
        color: COLORS.headerFill,
        borderColor: COLORS.border,
        borderWidth: 1,
    });

    let cursorX = PAGE.marginX;
    columns.forEach((column, index) => {
        page.drawText(column.label, {
            x: cursorX + 10,
            y: y - 22,
            size: 8.2,
            font: fonts.bold,
            color: COLORS.muted,
        });

        cursorX += column.width;
        if (index < columns.length - 1) {
            page.drawLine({
                start: { x: cursorX, y },
                end: { x: cursorX, y: y - 34 },
                thickness: 1,
                color: COLORS.border,
            });
        }
    });

    return y - 34;
};

const drawLogTitle = ({ page, fonts, y }) => {
    page.drawRectangle({
        x: PAGE.marginX,
        y: y - 12,
        width: 4,
        height: 12,
        color: COLORS.green,
    });

    page.drawText('Key Incident Log', {
        x: PAGE.marginX + 28,
        y,
        size: 15,
        font: fonts.regular,
        color: COLORS.ink,
    });

    return y - 22;
};

const buildHrmuMonthlyReportPdf = async ({ reportMeta, summary, locatorSlipLogs }) => {
    const pdfDoc = await PDFDocument.create();
    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const logoBytes = loadLogoBytes();
    let logoImage = null;

    if (logoBytes) {
        const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
        logoImage = isPng ? await pdfDoc.embedPng(logoBytes) : await pdfDoc.embedJpg(logoBytes);
    }

    const rows = Array.isArray(locatorSlipLogs) ? locatorSlipLogs : [];
    const columns = [
        { key: 'timestampLabel', label: 'TIMESTAMP', width: 84 },
        { key: 'location', label: 'LOCATION', width: 152 },
        { key: 'personnel', label: 'PERSONNEL', width: 126 },
        { key: 'status', label: 'STATUS', width: 92 },
        { key: 'action', label: 'ACTION', width: 78 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const bodyFontSize = 8.5;
    const bodyLineGap = 3;

    let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    let cursorY = drawHeader({ page, fonts, logoImage, reportMeta });
    cursorY = drawSummarySection({ page, fonts, summary, reportMeta, startY: cursorY });
    cursorY = drawLogTitle({ page, fonts, y: cursorY });
    cursorY = drawTableHeader({ page, fonts, columns, y: cursorY });

    if (rows.length === 0) {
        page.drawRectangle({
            x: PAGE.marginX,
            y: cursorY - 38,
            width: tableWidth,
            height: 38,
            borderColor: COLORS.border,
            borderWidth: 1,
            color: COLORS.white,
        });
        page.drawText('No logs found for this month.', {
            x: PAGE.marginX + 12,
            y: cursorY - 24,
            size: 9,
            font: fonts.regular,
            color: COLORS.muted,
        });
    } else {
        rows.forEach((row) => {
            const timestampLines = wrapTextByWidth(fonts.regular, row.timestampLabel || '--', bodyFontSize, columns[0].width - 18);
            const locationLines = wrapTextByWidth(fonts.regular, row.location || 'Unknown destination', bodyFontSize, columns[1].width - 18);
            const personnelLines = wrapTextByWidth(fonts.regular, row.personnel || 'Unknown faculty', bodyFontSize, columns[2].width - 18);
            const maxLines = Math.max(timestampLines.length, locationLines.length, personnelLines.length, 1);
            const rowHeight = Math.max(36, 14 + maxLines * (bodyFontSize + bodyLineGap));

            if (cursorY - rowHeight < PAGE.marginBottom) {
                page = pdfDoc.addPage([PAGE.width, PAGE.height]);
                cursorY = drawHeader({ page, fonts, logoImage, reportMeta });
                cursorY = drawLogTitle({ page, fonts, y: cursorY });
                cursorY = drawTableHeader({ page, fonts, columns, y: cursorY });
            }

            page.drawRectangle({
                x: PAGE.marginX,
                y: cursorY - rowHeight,
                width: tableWidth,
                height: rowHeight,
                color: COLORS.white,
                borderColor: COLORS.border,
                borderWidth: 1,
            });

            let cellX = PAGE.marginX;
            const cellTopY = cursorY - 18;
            const rowCells = [timestampLines, locationLines, personnelLines];

            columns.forEach((column, index) => {
                if (index > 0) {
                    page.drawLine({
                        start: { x: cellX, y: cursorY },
                        end: { x: cellX, y: cursorY - rowHeight },
                        thickness: 1,
                        color: COLORS.border,
                    });
                }

                if (column.key === 'status') {
                    const tone = getStatusTone(row.status);
                    const pillWidth = 56;
                    const pillHeight = 18;
                    const pillX = cellX + 16;
                    const pillY = cursorY - 8 - pillHeight;

                    page.drawRectangle({
                        x: pillX,
                        y: pillY,
                        width: pillWidth,
                        height: pillHeight,
                        color: tone.fill,
                    });
                    page.drawText(String(row.status || '--').toUpperCase(), {
                        x: pillX + 7,
                        y: pillY + 6,
                        size: 7.2,
                        font: fonts.bold,
                        color: tone.text,
                    });
                } else if (column.key === 'action') {
                    page.drawText('Details', {
                        x: cellX + 16,
                        y: cursorY - 22,
                        size: 8.4,
                        font: fonts.bold,
                        color: COLORS.green,
                    });
                } else {
                    const lines = rowCells[index];
                    lines.forEach((line, lineIndex) => {
                        page.drawText(line, {
                            x: cellX + 10,
                            y: cellTopY - lineIndex * (bodyFontSize + bodyLineGap),
                            size: bodyFontSize,
                            font: fonts.regular,
                            color: COLORS.ink,
                        });
                    });
                }

                cellX += column.width;
            });

            cursorY -= rowHeight;
        });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};

module.exports = {
    buildHrmuMonthlyReportPdf,
};
