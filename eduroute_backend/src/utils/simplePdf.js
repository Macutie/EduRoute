const fs = require('fs');
const path = require('path');

const PAGE = {
    width: 595.28,
    height: 841.89,
    marginX: 42,
    marginTop: 44,
    marginBottom: 44,
};

const rgbTuple = (r, g, b) => [r / 255, g / 255, b / 255];

const COLORS = {
    green: rgbTuple(6, 157, 27),
    greenSoft: rgbTuple(242, 248, 236),
    greenText: rgbTuple(12, 104, 29),
    red: rgbTuple(220, 53, 69),
    redSoft: rgbTuple(255, 239, 239),
    redText: rgbTuple(166, 30, 42),
    yellow: rgbTuple(139, 115, 0),
    yellowSoft: rgbTuple(248, 244, 226),
    yellowText: rgbTuple(108, 87, 5),
    ink: rgbTuple(39, 53, 72),
    muted: rgbTuple(112, 124, 139),
    border: rgbTuple(225, 232, 219),
    cardFill: rgbTuple(245, 249, 241),
    headerFill: rgbTuple(244, 248, 240),
    white: rgbTuple(255, 255, 255),
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

    if (normalized === 'ACTIVE' || normalized === 'ARRIVED' || normalized === 'APPROVED' || normalized === 'RETURNED') {
        return {
            fill: COLORS.greenSoft,
            text: COLORS.greenText,
        };
    }

    if (normalized === 'FLAGGED' || normalized === 'LATE' || normalized === 'UNVERIFIED' || normalized === 'DISCONNECTED') {
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

const buildHrmuNotificationLogReportPdf = async ({ reportTitle = 'Monthly Log Report', windowLabel = 'Last 30 days', rows = [] } = {}) => {
    let PDFDocument;
    let StandardFonts;
    let rgb;

    try {
        ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib'));
    } catch (error) {
        error.message = 'HRMU PDF export dependency "pdf-lib" is missing in the deployed backend. Reinstall backend dependencies and redeploy.';
        throw error;
    }

    const pdfDoc = await PDFDocument.create();
    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
    const colorize = (tuple) => rgb(tuple[0], tuple[1], tuple[2]);
    const logoBytes = loadLogoBytes();
    let logoImage = null;

    if (logoBytes) {
        const isPng = logoBytes.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        logoImage = isPng ? await pdfDoc.embedPng(logoBytes) : await pdfDoc.embedJpg(logoBytes);
    }

    const columns = [
        { label: 'DATE & TIME', width: 170 },
        { label: 'FACULTY USER', width: 245 },
        { label: 'STATUS', width: 96 },
    ];
    const tableWidth = columns.reduce((total, column) => total + column.width, 0);
    const headerHeight = 26;
    const rowHeight = 24;
    const statusPillHeight = 14;
    let page = null;
    let cursorY = 0;

    const drawPageHeader = () => {
        page = pdfDoc.addPage([PAGE.width, PAGE.height]);
        cursorY = PAGE.height - PAGE.marginTop;

        if (logoImage) {
            const logoDims = logoImage.scale(0.09);
            page.drawImage(logoImage, {
                x: PAGE.marginX,
                y: cursorY - 38,
                width: logoDims.width,
                height: logoDims.height,
            });
        }

        page.drawText('EduRoute HRMU', {
            x: PAGE.marginX + 42,
            y: cursorY - 8,
            size: 11,
            font: fonts.regular,
            color: colorize(COLORS.green),
        });
        page.drawText(reportTitle, {
            x: PAGE.marginX + 42,
            y: cursorY - 26,
            size: 18,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });
        page.drawText(`Coverage: ${windowLabel}`, {
            x: PAGE.marginX + 42,
            y: cursorY - 42,
            size: 9,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });

        const tableTopY = cursorY - 76;
        page.drawRectangle({
            x: PAGE.marginX,
            y: tableTopY - headerHeight,
            width: tableWidth,
            height: headerHeight,
            color: colorize(COLORS.headerFill),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });

        let headerX = PAGE.marginX;
        columns.forEach((column) => {
            page.drawText(column.label, {
                x: headerX + 10,
                y: tableTopY - 16,
                size: 8.5,
                font: fonts.bold,
                color: colorize(COLORS.muted),
            });
            headerX += column.width;
        });

        cursorY = tableTopY - headerHeight;
    };

    drawPageHeader();

    if (!rows.length) {
        page.drawRectangle({
            x: PAGE.marginX,
            y: cursorY - rowHeight,
            width: tableWidth,
            height: rowHeight,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });
        page.drawText('No logs found for the selected 30-day period.', {
            x: PAGE.marginX + 10,
            y: cursorY - 15,
            size: 9,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });
    } else {
        rows.forEach((row) => {
            if (cursorY - rowHeight < PAGE.marginBottom) {
                drawPageHeader();
            }

            const rowY = cursorY - rowHeight;
            page.drawRectangle({
                x: PAGE.marginX,
                y: rowY,
                width: tableWidth,
                height: rowHeight,
                color: colorize(COLORS.white),
                borderColor: colorize(COLORS.border),
                borderWidth: 1,
            });

            page.drawText(String(row.dateTimeLabel || '--'), {
                x: PAGE.marginX + 10,
                y: rowY + 8,
                size: 9,
                font: fonts.regular,
                color: colorize(COLORS.ink),
            });

            page.drawText(`${String(row.facultyName || 'Unknown faculty')} - ${String(row.actionLabel || 'update')}`, {
                x: PAGE.marginX + columns[0].width + 10,
                y: rowY + 8,
                size: 9,
                font: fonts.regular,
                color: colorize(COLORS.ink),
            });

            const statusTone = getStatusTone(row.status);
            const pillWidth = 72;
            const pillX = PAGE.marginX + columns[0].width + columns[1].width + 10;
            const pillY = rowY + ((rowHeight - statusPillHeight) / 2);
            page.drawRectangle({
                x: pillX,
                y: pillY,
                width: pillWidth,
                height: statusPillHeight,
                color: colorize(statusTone.fill),
            });
            page.drawText(String(row.status || '--').toUpperCase(), {
                x: pillX + 8,
                y: pillY + 4,
                size: 7.5,
                font: fonts.bold,
                color: colorize(statusTone.text),
            });

            cursorY = rowY;
        });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};

const loadLogoBytes = () => {
    const logoPath = REPORT_LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
    return logoPath ? fs.readFileSync(logoPath) : null;
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

const drawHeader = ({ page, fonts, logoImage, reportMeta, colorize }) => {
    const topY = PAGE.height - PAGE.marginTop;
    const brandBoxSize = 54;
    const brandBoxX = PAGE.marginX;
    const headerCenterY = topY - 24;
    const brandBoxY = headerCenterY - brandBoxSize / 2;
    const textX = brandBoxX + brandBoxSize + 16;

    page.drawRectangle({
        x: brandBoxX,
        y: brandBoxY,
        width: brandBoxSize,
        height: brandBoxSize,
        color: colorize(COLORS.white),
        borderColor: colorize(COLORS.border),
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
        x: textX,
        y: headerCenterY + 8,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.green),
    });

    page.drawText('FACULTY MOVEMENT', {
        x: textX,
        y: headerCenterY - 14,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.ink),
    });

    const rightMetaX = PAGE.width - PAGE.marginX - 150;
    page.drawText('OFFICIAL DOCUMENT', {
        x: rightMetaX,
        y: headerCenterY + 12,
        size: 10,
        font: fonts.bold,
        color: colorize(COLORS.ink),
    });

    page.drawText(`Report Sequence: ${reportMeta.monthIndex} / ${reportMeta.totalMonths || 12}`, {
        x: rightMetaX,
        y: headerCenterY - 2,
        size: 8.5,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    page.drawText(`Coverage: ${reportMeta.monthName}, ${reportMeta.year}`, {
        x: rightMetaX,
        y: headerCenterY - 16,
        size: 8.5,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    return topY - 82;
};

const drawSummarySection = ({ page, fonts, summary, reportMeta, startY, colorize }) => {
    let y = startY;

    page.drawText('Monthly Movement & Violation Summary', {
        x: PAGE.marginX,
        y,
        size: 18,
        font: fonts.regular,
        color: colorize(COLORS.ink),
    });

    page.drawRectangle({
        x: PAGE.marginX,
        y: y - 20,
        width: 78,
        height: 3,
        color: colorize(COLORS.yellow),
    });

    const introLines = drawWrappedText(page, fonts.regular, `This report provides a comprehensive overview of logistical activities, security transitions, and flagged trip incidents within the HRMU jurisdiction for month of ${reportMeta.monthName}.`, {
        x: PAGE.marginX,
        y: y - 52,
        width: PAGE.width - PAGE.marginX * 2,
        size: 10.5,
        color: colorize(COLORS.muted),
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
            color: colorize(COLORS.cardFill),
        });
        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: 4,
            height: cardHeight,
            color: colorize(card.accent),
        });

        page.drawText(card.label, {
            x: x + 16,
            y: y - 18,
            size: 8.5,
            font: fonts.bold,
            color: colorize(COLORS.muted),
        });

        page.drawText(card.value, {
            x: x + 16,
            y: y - 42,
            size: 18,
            font: fonts.regular,
            color: colorize(COLORS.ink),
        });

        drawWrappedText(page, fonts.regular, card.note, {
            x: x + 16,
            y: y - 60,
            width: cardWidth - 28,
            size: 8.2,
            color: colorize(COLORS.muted),
            lineGap: 3,
        });
    });

    return y - cardHeight - 30;
};

const drawLogTitle = ({ page, fonts, y, colorize }) => {
    page.drawText('Key Incident Log', {
        x: PAGE.marginX,
        y,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.ink),
    });

    return y - 22;
};

const drawTableHeader = ({ page, fonts, columns, y, colorize, x = PAGE.marginX }) => {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);

    page.drawRectangle({
        x,
        y: y - 34,
        width: totalWidth,
        height: 34,
        color: colorize(COLORS.headerFill),
        borderColor: colorize(COLORS.border),
        borderWidth: 1,
    });

    let cursorX = PAGE.marginX;
    cursorX = x;
    columns.forEach((column, index) => {
        page.drawText(column.label, {
            x: cursorX + 10,
            y: y - 22,
            size: 8.2,
            font: fonts.bold,
            color: colorize(COLORS.muted),
        });

        cursorX += column.width;
        if (index < columns.length - 1) {
            page.drawLine({
                start: { x: cursorX, y },
                end: { x: cursorX, y: y - 34 },
                thickness: 1,
                color: colorize(COLORS.border),
            });
        }
    });

    return y - 34;
};

const drawCssuReportHeader = ({ page, fonts, logoImage, reportMeta, filters, colorize }) => {
    const topY = PAGE.height - PAGE.marginTop;
    const brandBoxSize = 54;
    const brandBoxX = PAGE.marginX;
    const headerCenterY = topY - 24;
    const brandBoxY = headerCenterY - brandBoxSize / 2;
    const textX = brandBoxX + brandBoxSize + 16;

    page.drawRectangle({
        x: brandBoxX,
        y: brandBoxY,
        width: brandBoxSize,
        height: brandBoxSize,
        color: colorize(COLORS.white),
        borderColor: colorize(COLORS.border),
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

    page.drawText('EduRoute CSSU', {
        x: textX,
        y: headerCenterY + 8,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.green),
    });

    page.drawText('MOVEMENT LOGS PREVIEW', {
        x: textX,
        y: headerCenterY - 14,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.ink),
    });

    const rightMetaX = PAGE.width - PAGE.marginX - 150;
    page.drawText('OFFICIAL DOCUMENT', {
        x: rightMetaX,
        y: headerCenterY + 12,
        size: 10,
        font: fonts.bold,
        color: colorize(COLORS.ink),
    });

    page.drawText(`Report ID: ${reportMeta.reportId || 'CSSU-DRAFT'}`, {
        x: rightMetaX,
        y: headerCenterY - 2,
        size: 8.5,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    page.drawText(`Coverage: ${filters.dateRangeLabel || '--'}`, {
        x: rightMetaX,
        y: headerCenterY - 16,
        size: 8.5,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    return topY - 82;
};

const drawCssuSummaryCards = ({ page, fonts, summary, y, colorize }) => {
    const cards = [
        {
            label: 'TOTAL MOVEMENTS',
            value: String(summary.totalMovements || 0).padStart(2, '0'),
            note: 'Verified and flagged movement logs',
            accent: COLORS.green,
        },
        {
            label: 'EXIT CLEARANCES',
            value: String(summary.exitClearances || 0).padStart(2, '0'),
            note: 'Validated CSSU departures',
            accent: COLORS.green,
        },
        {
            label: 'FLAGGED EVENTS',
            value: String(summary.flaggedEvents || 0).padStart(2, '0'),
            note: 'Denied or investigated exits',
            accent: COLORS.red,
        },
    ];

    const gap = 14;
    const cardWidth = (PAGE.width - PAGE.marginX * 2 - gap * 2) / 3;
    const cardHeight = 84;

    cards.forEach((card, index) => {
        const x = PAGE.marginX + index * (cardWidth + gap);
        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: colorize(COLORS.cardFill),
        });
        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: 4,
            height: cardHeight,
            color: colorize(card.accent),
        });

        page.drawText(card.label, {
            x: x + 14,
            y: y - 18,
            size: 8.5,
            font: fonts.bold,
            color: colorize(COLORS.muted),
        });
        page.drawText(card.value, {
            x: x + 14,
            y: y - 44,
            size: 22,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });
        drawWrappedText(page, fonts.regular, card.note, {
            x: x + 14,
            y: y - 62,
            width: cardWidth - 24,
            size: 8.2,
            color: colorize(COLORS.muted),
            lineGap: 2,
        });
    });

    return y - cardHeight;
};

const buildHrmuMonthlyReportPdf = async ({ reportMeta, summary, locatorSlipLogs }) => {
    let PDFDocument;
    let StandardFonts;
    let rgb;

    try {
        ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib'));
    } catch (error) {
        error.message = 'HRMU PDF export dependency "pdf-lib" is missing in the deployed backend. Reinstall backend dependencies and redeploy.';
        throw error;
    }

    const colorize = (tuple) => rgb(tuple[0], tuple[1], tuple[2]);
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
        { key: 'personnel', label: 'PERSONNEL', width: 156 },
        { key: 'status', label: 'STATUS', width: 140 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const bodyFontSize = 8.5;
    const bodyLineGap = 3;

    let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    let cursorY = drawHeader({ page, fonts, logoImage, reportMeta, colorize });
    cursorY = drawSummarySection({ page, fonts, summary, reportMeta, startY: cursorY, colorize });
    cursorY = drawLogTitle({ page, fonts, y: cursorY, colorize });
    cursorY = drawTableHeader({ page, fonts, columns, y: cursorY, colorize });

    if (rows.length === 0) {
        page.drawRectangle({
            x: PAGE.marginX,
            y: cursorY - 38,
            width: tableWidth,
            height: 38,
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
            color: colorize(COLORS.white),
        });
        page.drawText('No logs found for this month.', {
            x: PAGE.marginX + 12,
            y: cursorY - 24,
            size: 9,
            font: fonts.regular,
            color: colorize(COLORS.muted),
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
                cursorY = drawHeader({ page, fonts, logoImage, reportMeta, colorize });
                cursorY = drawLogTitle({ page, fonts, y: cursorY, colorize });
                cursorY = drawTableHeader({ page, fonts, columns, y: cursorY, colorize });
            }

            page.drawRectangle({
                x: PAGE.marginX,
                y: cursorY - rowHeight,
                width: tableWidth,
                height: rowHeight,
                color: colorize(COLORS.white),
                borderColor: colorize(COLORS.border),
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
                        color: colorize(COLORS.border),
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
                        color: colorize(tone.fill),
                    });
                    page.drawText(String(row.status || '--').toUpperCase(), {
                        x: pillX + 7,
                        y: pillY + 6,
                        size: 7.2,
                        font: fonts.bold,
                        color: colorize(tone.text),
                    });
                } else {
                    const lines = rowCells[index];
                    lines.forEach((line, lineIndex) => {
                        page.drawText(line, {
                            x: cellX + 10,
                            y: cellTopY - lineIndex * (bodyFontSize + bodyLineGap),
                            size: bodyFontSize,
                            font: fonts.regular,
                            color: colorize(COLORS.ink),
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

const buildHrmuAnalyticsReportPdf = async (analytics = {}, filters = {}) => {
    let PDFDocument;
    let StandardFonts;
    let rgb;

    try {
        ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib'));
    } catch (error) {
        error.message = 'HRMU PDF export dependency "pdf-lib" is missing in the deployed backend. Reinstall backend dependencies and redeploy.';
        throw error;
    }

    const colorize = (tuple) => rgb(tuple[0], tuple[1], tuple[2]);
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

    const dateRangeLabel = analytics?.dateRange?.label || 'Current Month';
    const departmentLabel = filters.collegeName || analytics?.selectedCollege || 'All Departments';
    const dailyLabels = analytics?.dailyFacultyMovement?.labels || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const dailyValues = analytics?.dailyFacultyMovement?.values || [];
    const approvalRate = analytics?.approvalRate || {};
    const destinations = Array.isArray(analytics?.frequentDestinations) ? analytics.frequentDestinations.slice(0, 5) : [];
    const monthlySummary = analytics?.monthlyPerformanceSummary || {};
    const maxChartValue = dailyValues.length ? Math.max(...dailyValues, 1) : 1;
    const tripsDirectionSymbol = monthlySummary.tripsMonthOverMonthDirection === 'decrease'
        ? 'v'
        : monthlySummary.tripsMonthOverMonthDirection === 'increase'
            ? '^'
            : '-';
    const weeklyDirectionLabel = approvalRate.weeklyChangeDirection === 'decrease'
        ? 'decrease'
        : approvalRate.weeklyChangeDirection === 'increase'
            ? 'increase'
            : 'no change';
    const weeklyDirectionSymbol = approvalRate.weeklyChangeDirection === 'decrease'
        ? 'v'
        : approvalRate.weeklyChangeDirection === 'increase'
            ? '^'
            : '-';

    const drawAnalyticsHeader = (page) => {
        const topY = PAGE.height - PAGE.marginTop;
        const brandBoxSize = 54;
        const brandBoxX = PAGE.marginX;
        const brandBoxY = topY - brandBoxSize;
        const textX = brandBoxX + brandBoxSize + 14;
        const rightMetaX = PAGE.width - PAGE.marginX - 170;

        page.drawRectangle({
            x: brandBoxX,
            y: brandBoxY,
            width: brandBoxSize,
            height: brandBoxSize,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
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
            x: textX,
            y: topY - 16,
            size: 17,
            font: fonts.regular,
            color: colorize(COLORS.green),
        });

        page.drawText('ANALYTICS & REPORTING', {
            x: textX,
            y: topY - 39,
            size: 16,
            font: fonts.regular,
            color: colorize(COLORS.ink),
        });

        page.drawText('OFFICIAL DOCUMENT', {
            x: rightMetaX,
            y: topY - 12,
            size: 11,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });

        page.drawText(`Coverage: ${dateRangeLabel}`, {
            x: rightMetaX,
            y: topY - 30,
            size: 8.8,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });

        page.drawText(`Department: ${departmentLabel}`, {
            x: rightMetaX,
            y: topY - 44,
            size: 8.8,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });

        page.drawLine({
            start: { x: PAGE.marginX, y: topY - 68 },
            end: { x: PAGE.width - PAGE.marginX, y: topY - 68 },
            thickness: 3,
            color: colorize(COLORS.green),
        });

        return topY - 98;
    };

    const drawFilterCard = (page, y) => {
        const cardHeight = 64;
        const cardY = y - cardHeight;
        const leftWidth = (PAGE.width - PAGE.marginX * 2 - 20) / 2;
        const rightX = PAGE.marginX + leftWidth + 20;

        page.drawRectangle({
            x: PAGE.marginX,
            y: cardY,
            width: PAGE.width - PAGE.marginX * 2,
            height: cardHeight,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });

        page.drawText('DATE RANGE', {
            x: PAGE.marginX + 14,
            y: y - 18,
            size: 8.5,
            font: fonts.bold,
            color: colorize(COLORS.muted),
        });
        page.drawText(dateRangeLabel, {
            x: PAGE.marginX + 14,
            y: y - 40,
            size: 11,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });

        page.drawText('DEPARTMENT', {
            x: rightX,
            y: y - 18,
            size: 8.5,
            font: fonts.bold,
            color: colorize(COLORS.muted),
        });
        drawWrappedText(page, fonts.bold, departmentLabel, {
            x: rightX,
            y: y - 40,
            width: leftWidth - 10,
            size: 11,
            color: colorize(COLORS.ink),
            lineGap: 2,
        });

        return cardY - 24;
    };

    const drawTopSummaryCards = (page, y) => {
        const cards = [
            {
                label: 'TOTAL TRIPS',
                value: String(monthlySummary.totalTripsCompleted || 0),
                note: `${tripsDirectionSymbol} ${Number(monthlySummary.tripsMonthOverMonthPercent || 0).toFixed(1)}% MoM`,
                accent: COLORS.green,
            },
            {
                label: 'APPROVAL RATE',
                value: `${Number(approvalRate.percentage || 0).toFixed(1)}%`,
                note: `${approvalRate.approvedCount || 0} approved / ${approvalRate.totalFiledCount || 0} filed`,
                accent: COLORS.yellow,
            },
            {
                label: 'USERS',
                value: String(monthlySummary.uniqueUsersCompletedTrips || 0),
                note: `${Number(monthlySummary.engagementRatePercent || 0).toFixed(1)}% engaged`,
                accent: COLORS.green,
            },
        ];

        const gap = 18;
        const cardWidth = (PAGE.width - PAGE.marginX * 2 - gap * 2) / 3;
        const cardHeight = 88;

        cards.forEach((card, index) => {
            const x = PAGE.marginX + index * (cardWidth + gap);
            page.drawRectangle({
                x,
                y: y - cardHeight,
                width: cardWidth,
                height: cardHeight,
                color: colorize(COLORS.cardFill),
            });
            page.drawRectangle({
                x,
                y: y - cardHeight,
                width: 4,
                height: cardHeight,
                color: colorize(card.accent),
            });
            page.drawText(card.label, {
                x: x + 14,
                y: y - 18,
                size: 8.5,
                font: fonts.bold,
                color: colorize(COLORS.muted),
            });
            page.drawText(card.value, {
                x: x + 14,
                y: y - 42,
                size: 17,
                font: fonts.bold,
                color: colorize(COLORS.ink),
            });
            drawWrappedText(page, fonts.regular, card.note, {
                x: x + 14,
                y: y - 60,
                width: cardWidth - 26,
                size: 8.4,
                color: colorize(COLORS.muted),
                lineGap: 2,
            });
        });

        return y - cardHeight - 28;
    };

    const drawDailyMovementCard = (page, y) => {
        const cardX = PAGE.marginX;
        const cardWidth = 330;
        const cardHeight = 260;

        page.drawRectangle({
            x: cardX,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });

        page.drawText('Daily Faculty Movement', {
            x: cardX + 18,
            y: y - 28,
            size: 16,
            font: fonts.bold,
            color: colorize(COLORS.green),
        });

        drawWrappedText(page, fonts.regular, analytics?.selectedCollege
            ? `Tracking locator slip volume for ${analytics.selectedCollege}`
            : 'Tracking locator slip volume across the five HRMU colleges', {
            x: cardX + 18,
            y: y - 48,
            width: cardWidth - 36,
            size: 9.5,
            color: colorize(COLORS.ink),
            lineGap: 2,
        });

        page.drawCircle({ x: cardX + 236, y: y - 28, size: 4, color: colorize(COLORS.green) });
        page.drawText('Locator Slips', {
            x: cardX + 246,
            y: y - 31,
            size: 8.8,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });
        page.drawCircle({ x: cardX + 235, y: y - 44, size: 4, color: colorize(COLORS.yellow) });
        page.drawText(dateRangeLabel, {
            x: cardX + 245,
            y: y - 47,
            size: 8.4,
            font: fonts.bold,
            color: colorize(COLORS.ink),
        });

        const plotX = cardX + 26;
        const plotY = y - 198;
        const plotWidth = cardWidth - 52;
        const plotHeight = 116;
        const barSlot = plotWidth / Math.max(dailyLabels.length, 1);
        const barWidth = Math.max(Math.min(barSlot * 0.56, 24), 12);

        page.drawLine({
            start: { x: plotX, y: plotY },
            end: { x: plotX + plotWidth, y: plotY },
            thickness: 1,
            color: colorize(COLORS.border),
        });

        dailyLabels.forEach((label, index) => {
            const value = Number(dailyValues[index] || 0);
            const height = maxChartValue ? Math.max((value / maxChartValue) * plotHeight, value > 0 ? 8 : 2) : 2;
            const x = plotX + index * barSlot + (barSlot - barWidth) / 2;

            page.drawRectangle({
                x,
                y: plotY,
                width: barWidth,
                height,
                color: colorize(COLORS.green),
            });

            page.drawText(label, {
                x: x - 1,
                y: plotY - 16,
                size: 7.4,
                font: fonts.bold,
                color: colorize(COLORS.muted),
            });
        });

        return { cardHeight, cardWidth };
    };

    const drawApprovalRateCard = (page, x, y) => {
        const cardWidth = PAGE.width - PAGE.marginX - x;
        const cardHeight = 260;

        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: colorize(COLORS.green),
        });

        page.drawText('Approval Rate', {
            x: x + 18,
            y: y - 28,
            size: 16,
            font: fonts.bold,
            color: colorize(COLORS.white),
        });
        page.drawText('Request vs Approval efficiency', {
            x: x + 18,
            y: y - 48,
            size: 9.5,
            font: fonts.regular,
            color: colorize(COLORS.white),
        });

        const ringCenterX = x + cardWidth / 2;
        const ringCenterY = y - 126;

        page.drawCircle({
            x: ringCenterX,
            y: ringCenterY,
            size: 52,
            borderColor: colorize(COLORS.yellow),
            borderWidth: 14,
        });
        page.drawCircle({
            x: ringCenterX,
            y: ringCenterY,
            size: 38,
            color: colorize(COLORS.green),
        });

        page.drawText(`${Number(approvalRate.percentage || 0).toFixed(1)}%`, {
            x: ringCenterX - 24,
            y: ringCenterY - 6,
            size: 16,
            font: fonts.bold,
            color: colorize(COLORS.white),
        });
        page.drawText((Number(approvalRate.percentage || 0) >= 50 ? 'SUCCESS' : 'IN REVIEW'), {
            x: ringCenterX - 22,
            y: ringCenterY - 24,
            size: 8,
            font: fonts.bold,
            color: colorize(COLORS.white),
        });

        page.drawText(`${approvalRate.approvedCount || 0} approved / ${approvalRate.totalFiledCount || 0} filed`, {
            x: x + 18,
            y: y - 214,
            size: 9,
            font: fonts.regular,
            color: colorize(COLORS.white),
        });
        drawWrappedText(page, fonts.regular, `${weeklyDirectionSymbol} ${Number(approvalRate.weeklyChangePercent || 0).toFixed(1)}% ${weeklyDirectionLabel} from last period`, {
            x: x + 18,
            y: y - 230,
            width: cardWidth - 36,
            size: 8.2,
            color: colorize(COLORS.white),
            lineGap: 2,
        });

        return cardHeight;
    };

    const drawFrequentDestinationsCard = (page, y) => {
        const cardX = PAGE.marginX;
        const cardWidth = PAGE.width - PAGE.marginX * 2;
        const cardHeight = 286;
        const topCount = destinations[0]?.count || 1;

        page.drawRectangle({
            x: cardX,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });

        page.drawText('Frequent Destinations', {
            x: cardX + 18,
            y: y - 28,
            size: 16,
            font: fonts.bold,
            color: colorize(COLORS.green),
        });

        if (!destinations.length) {
            drawWrappedText(page, fonts.regular, 'No destination history found for this month.', {
                x: cardX + 18,
                y: y - 62,
                width: cardWidth - 36,
                size: 10,
                color: colorize(COLORS.muted),
                lineGap: 3,
            });
            return { cardWidth, cardHeight };
        }

        destinations.forEach((row, index) => {
            const rowY = y - 74 - index * 42;
            const badgeX = cardX + 18;

            page.drawCircle({
                x: badgeX + 12,
                y: rowY + 10,
                size: 12,
                color: colorize(COLORS.greenSoft),
            });
            page.drawText(String(row.rank || index + 1), {
                x: badgeX + 8,
                y: rowY + 6,
                size: 9,
                font: fonts.bold,
                color: colorize(COLORS.greenText),
            });
            drawWrappedText(page, fonts.bold, row.label, {
                x: cardX + 48,
                y: rowY + 10,
                width: cardWidth - 110,
                size: 9.5,
                color: colorize(COLORS.ink),
                lineGap: 1,
            });

            const trackX = cardX + 48;
            const trackY = rowY - 10;
            const trackWidth = cardWidth - 110;
            const fillWidth = Math.max((Number(row.count || 0) / topCount) * trackWidth, 12);

            page.drawRectangle({
                x: trackX,
                y: trackY,
                width: trackWidth,
                height: 8,
                color: colorize(COLORS.border),
            });
            page.drawRectangle({
                x: trackX,
                y: trackY,
                width: fillWidth,
                height: 8,
                color: colorize(COLORS.green),
            });
            page.drawText(String(row.count || 0), {
                x: cardX + cardWidth - 22,
                y: rowY + 6,
                size: 9,
                font: fonts.bold,
                color: colorize(COLORS.ink),
            });
        });

        return { cardWidth, cardHeight };
    };

    const drawMonthlySummaryCard = (page, x, y) => {
        const cardWidth = PAGE.width - PAGE.marginX - x;
        const cardHeight = 146;

        page.drawRectangle({
            x,
            y: y - cardHeight,
            width: cardWidth,
            height: cardHeight,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });

        page.drawText('Monthly Performance Summary', {
            x: x + 18,
            y: y - 28,
            size: 16,
            font: fonts.bold,
            color: colorize(COLORS.green),
        });

        const cards = [
            {
                label: 'TOTAL TRIPS',
                value: String(monthlySummary.totalTripsCompleted || 0),
                note: `${tripsDirectionSymbol} ${Number(monthlySummary.tripsMonthOverMonthPercent || 0).toFixed(1)}% MoM`,
                accent: COLORS.green,
            },
            {
                label: 'AVG. DISTANCE',
                value: `${Number(monthlySummary.averageDistanceKm || 0).toFixed(1)} km`,
                note: monthlySummary.averageDistanceLabel || 'Optimized',
                accent: COLORS.yellow,
            },
            {
                label: 'USERS',
                value: String(monthlySummary.uniqueUsersCompletedTrips || 0),
                note: `${Number(monthlySummary.engagementRatePercent || 0).toFixed(1)}% Engaged`,
                accent: COLORS.green,
            },
            {
                label: 'PEAK HOUR',
                value: monthlySummary.peakHour || '--',
                note: monthlySummary.peakHourLabel || 'No peak hour',
                accent: COLORS.muted,
            },
        ];

        const gridGap = 10;
        const miniWidth = (cardWidth - 36 - gridGap * 3) / 4;
        const gridY = y - 40;

        cards.forEach((card, index) => {
            const cardX = x + 18 + index * (miniWidth + gridGap);
            page.drawRectangle({
                x: cardX,
                y: gridY - 82,
                width: miniWidth,
                height: 82,
                color: colorize(COLORS.cardFill),
            });
            page.drawRectangle({
                x: cardX,
                y: gridY - 82,
                width: 4,
                height: 82,
                color: colorize(card.accent),
            });
            page.drawText(card.label, {
                x: cardX + 10,
                y: gridY - 18,
                size: 8,
                font: fonts.bold,
                color: colorize(COLORS.muted),
            });
            drawWrappedText(page, fonts.bold, card.value, {
                x: cardX + 10,
                y: gridY - 38,
                width: miniWidth - 20,
                size: 14,
                color: colorize(COLORS.ink),
                lineGap: 1,
            });
            drawWrappedText(page, fonts.regular, card.note, {
                x: cardX + 10,
                y: gridY - 62,
                width: miniWidth - 20,
                size: 8,
                color: colorize(COLORS.ink),
                lineGap: 2,
            });
        });

        return cardHeight;
    };

    let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    let y = drawAnalyticsHeader(page);

    page.drawText('Analytics & Reporting Overview', {
        x: PAGE.marginX,
        y,
        size: 18,
        font: fonts.bold,
        color: colorize(COLORS.ink),
    });

    drawWrappedText(page, fonts.regular, 'Advanced insights into faculty movement and departmental flow across campus transit routes.', {
        x: PAGE.marginX,
        y: y - 22,
        width: PAGE.width - PAGE.marginX * 2,
        size: 10.5,
        color: colorize(COLORS.muted),
        lineGap: 3,
    });

    y = drawFilterCard(page, y - 58);
    const monthlySummaryHeight = drawMonthlySummaryCard(page, PAGE.marginX, y);
    const topChartY = y - monthlySummaryHeight - 22;
    const chartMetrics = drawDailyMovementCard(page, topChartY);
    drawApprovalRateCard(page, PAGE.marginX + chartMetrics.cardWidth + 20, topChartY);

    page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    y = drawAnalyticsHeader(page);
    drawFrequentDestinationsCard(page, y);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};

const buildCssuMovementReportPdf = async ({ filters, summary, movementLogs, reportMeta, sortOrder = 'desc', exportedBy = 'CSSU Administrator' }) => {
    let PDFDocument;
    let StandardFonts;
    let rgb;

    try {
        ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib'));
    } catch (error) {
        error.message = 'CSSU PDF export dependency "pdf-lib" is missing in the deployed backend. Reinstall backend dependencies and redeploy.';
        throw error;
    }

    const colorize = (tuple) => rgb(tuple[0], tuple[1], tuple[2]);
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

    const rows = Array.isArray(movementLogs) ? movementLogs : [];
    const reportTitle = 'Movement Logs Preview';
    const reportSubtitle = `Displaying data for ${filters.dateRangeLabel || '--'}`;
    const columns = [
        { key: 'occurredDateTimeLabel', label: 'VALIDATED AT', width: 112 },
        { key: 'facultyName', label: 'FACULTY MEMBER', width: 104 },
        { key: 'details', label: 'DETAILS', width: 172 },
        { key: 'movementStatusLabel', label: 'STATUS', width: 70 },
        { key: 'validatedByName', label: 'VALIDATED BY', width: 90 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const tableX = PAGE.marginX + ((PAGE.width - PAGE.marginX * 2 - tableWidth) / 2);
    const bodyFontSize = 8.3;
    const bodyLineGap = 2;

    let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    let cursorY = drawCssuReportHeader({ page, fonts, logoImage, reportMeta, filters, colorize });

    page.drawText(reportTitle, {
        x: PAGE.marginX,
        y: cursorY,
        size: 18,
        font: fonts.bold,
        color: colorize(COLORS.green),
    });

    page.drawText(reportSubtitle, {
        x: PAGE.marginX,
        y: cursorY - 22,
        size: 10.5,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    const sortOrderLabel = `Sort Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`;
    const exportedByLabel = `Exported by: ${exportedBy || 'CSSU Administrator'}`;
    const rightMetaX = PAGE.width - PAGE.marginX - 150;

    page.drawText(sortOrderLabel, {
        x: rightMetaX,
        y: cursorY - 4,
        size: 8.8,
        font: fonts.bold,
        color: colorize(COLORS.greenText),
    });

    page.drawText(exportedByLabel, {
        x: rightMetaX,
        y: cursorY - 18,
        size: 8.6,
        font: fonts.regular,
        color: colorize(COLORS.muted),
    });

    cursorY = drawCssuSummaryCards({
        page,
        fonts,
        summary,
        y: cursorY - 54,
        colorize,
    }) - 28;

    page.drawText('Movement Log Table', {
        x: PAGE.marginX,
        y: cursorY,
        size: 15,
        font: fonts.regular,
        color: colorize(COLORS.ink),
    });

    cursorY = drawTableHeader({
        page,
        fonts,
        columns,
        y: cursorY - 16,
        colorize,
        x: tableX,
    });

    if (rows.length === 0) {
        page.drawRectangle({
            x: tableX,
            y: cursorY - 54,
            width: tableWidth,
            height: 54,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });
        page.drawText('No movement logs found for the selected range.', {
            x: tableX + 14,
            y: cursorY - 32,
            size: 10,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });
    } else {
        rows.forEach((row) => {
            const locationDetail = row.movementStatus === 'flagged'
                ? (row.investigationLabel || row.locationLabel || '--')
                : (row.locationLabel || '--');
            const detailsText = `${row.departmentName || '--'} • ${row.eventLabel || 'Movement'} • ${locationDetail}`;
            const validatedByText = row.validatedByName || '--';
            const timestampLines = wrapTextByWidth(fonts.regular, row.occurredDateTimeLabel || row.occurredTimeLabel || '--', bodyFontSize, columns[0].width - 18);
            const facultyLines = wrapTextByWidth(fonts.regular, row.facultyName || 'Unknown faculty', bodyFontSize, columns[1].width - 18);
            const detailLines = wrapTextByWidth(fonts.regular, detailsText, bodyFontSize, columns[2].width - 18);
            const validatedByLines = wrapTextByWidth(fonts.regular, validatedByText, bodyFontSize, columns[4].width - 18);
            const maxLines = Math.max(timestampLines.length, facultyLines.length, detailLines.length, validatedByLines.length, 1);
            const rowHeight = Math.max(34, 12 + maxLines * (bodyFontSize + bodyLineGap));

            if (cursorY - rowHeight < PAGE.marginBottom) {
                page = pdfDoc.addPage([PAGE.width, PAGE.height]);
                cursorY = drawCssuReportHeader({ page, fonts, logoImage, reportMeta, filters, colorize });
                cursorY = drawTableHeader({
                    page,
                    fonts,
                    columns,
                    y: cursorY - 18,
                    colorize,
                    x: tableX,
                });
            }

            page.drawRectangle({
                x: tableX,
                y: cursorY - rowHeight,
                width: tableWidth,
                height: rowHeight,
                color: colorize(COLORS.white),
                borderColor: colorize(COLORS.border),
                borderWidth: 1,
            });

            let cellX = tableX;
            const cellTopY = cursorY - 16;
            const rowCells = [timestampLines, facultyLines, detailLines, null, validatedByLines];

            columns.forEach((column, index) => {
                if (index > 0) {
                    page.drawLine({
                        start: { x: cellX, y: cursorY },
                        end: { x: cellX, y: cursorY - rowHeight },
                        thickness: 1,
                        color: colorize(COLORS.border),
                    });
                }

                if (column.key === 'movementStatusLabel') {
                    const tone = row.movementStatus === 'flagged'
                        ? { fill: COLORS.redSoft, text: COLORS.redText }
                        : { fill: COLORS.greenSoft, text: COLORS.greenText };
                    const pillWidth = 58;
                    const pillHeight = 18;
                    const pillX = cellX + 10;
                    const pillY = cursorY - 9 - pillHeight;

                    page.drawRectangle({
                        x: pillX,
                        y: pillY,
                        width: pillWidth,
                        height: pillHeight,
                        color: colorize(tone.fill),
                    });
                    page.drawText(String(row.movementStatusLabel || '--').toUpperCase(), {
                        x: pillX + 8,
                        y: pillY + 6,
                        size: 7.2,
                        font: fonts.bold,
                        color: colorize(tone.text),
                    });
                } else {
                    const lines = rowCells[index];
                    lines.forEach((line, lineIndex) => {
                        page.drawText(line, {
                            x: cellX + 10,
                            y: cellTopY - lineIndex * (bodyFontSize + bodyLineGap),
                            size: bodyFontSize,
                            font: fonts.regular,
                            color: colorize(COLORS.ink),
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
    buildHrmuAnalyticsReportPdf,
    buildCssuMovementReportPdf,
    buildHrmuNotificationLogReportPdf,
};
