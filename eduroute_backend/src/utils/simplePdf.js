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

const drawTableHeader = ({ page, fonts, columns, y, colorize }) => {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);

    page.drawRectangle({
        x: PAGE.marginX,
        y: y - 34,
        width: totalWidth,
        height: 34,
        color: colorize(COLORS.headerFill),
        borderColor: colorize(COLORS.border),
        borderWidth: 1,
    });

    let cursorX = PAGE.marginX;
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
        { key: 'personnel', label: 'PERSONNEL', width: 126 },
        { key: 'status', label: 'STATUS', width: 92 },
        { key: 'action', label: 'ACTION', width: 78 },
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
                } else if (column.key === 'action') {
                    page.drawText('Details', {
                        x: cellX + 16,
                        y: cursorY - 22,
                        size: 8.4,
                        font: fonts.bold,
                        color: colorize(COLORS.green),
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

const buildCssuMovementReportPdf = async ({ filters, summary, movementLogs, reportMeta, sortOrder = 'desc' }) => {
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
        { key: 'occurredDateTimeLabel', label: 'VALIDATED AT', width: 120 },
        { key: 'facultyName', label: 'FACULTY MEMBER', width: 118 },
        { key: 'details', label: 'DETAILS', width: 176 },
        { key: 'movementStatusLabel', label: 'STATUS', width: 78 },
        { key: 'place', label: 'LOCATION', width: 90 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
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

    page.drawText(`Sort Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`, {
        x: PAGE.width - PAGE.marginX - 108,
        y: cursorY - 4,
        size: 8.8,
        font: fonts.bold,
        color: colorize(COLORS.greenText),
    });

    cursorY = drawCssuSummaryCards({
        page,
        fonts,
        summary,
        y: cursorY - 48,
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
    });

    if (rows.length === 0) {
        page.drawRectangle({
            x: PAGE.marginX,
            y: cursorY - 54,
            width: tableWidth,
            height: 54,
            color: colorize(COLORS.white),
            borderColor: colorize(COLORS.border),
            borderWidth: 1,
        });
        page.drawText('No movement logs found for the selected range.', {
            x: PAGE.marginX + 14,
            y: cursorY - 32,
            size: 10,
            font: fonts.regular,
            color: colorize(COLORS.muted),
        });
    } else {
        rows.forEach((row) => {
            const detailsText = `${row.departmentName || '--'} • ${row.eventLabel || 'Movement'}`;
            const placeText = row.movementStatus === 'flagged'
                ? (row.investigationLabel || row.locationLabel || '--')
                : (row.locationLabel || '--');
            const timestampLines = wrapTextByWidth(fonts.regular, row.occurredDateTimeLabel || row.occurredTimeLabel || '--', bodyFontSize, columns[0].width - 18);
            const facultyLines = wrapTextByWidth(fonts.regular, row.facultyName || 'Unknown faculty', bodyFontSize, columns[1].width - 18);
            const detailLines = wrapTextByWidth(fonts.regular, detailsText, bodyFontSize, columns[2].width - 18);
            const placeLines = wrapTextByWidth(fonts.regular, placeText, bodyFontSize, columns[4].width - 18);
            const maxLines = Math.max(timestampLines.length, facultyLines.length, detailLines.length, placeLines.length, 1);
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
                });
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
            const cellTopY = cursorY - 16;
            const rowCells = [timestampLines, facultyLines, detailLines, null, placeLines];

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
    buildCssuMovementReportPdf,
};
