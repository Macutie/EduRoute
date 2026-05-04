const sharp = require('sharp');
const AppError = require('../utils/appError');

const CARD_WIDTH = 1400;
const CARD_HEIGHT = 1180;

const escapeXml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const formatDisplayDateTime = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'long',
        timeStyle: 'short'
    }).format(date);
};

const wrapText = (text, maxCharsPerLine = 30, maxLines = 3) => {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return ['-'];

    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (nextLine.length <= maxCharsPerLine || currentLine.length === 0) {
            currentLine = nextLine;
            return;
        }

        lines.push(currentLine);
        currentLine = word;
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    if (lines.length <= maxLines) {
        return lines;
    }

    const visible = lines.slice(0, maxLines);
    const lastLine = visible[maxLines - 1];
    visible[maxLines - 1] = `${lastLine.slice(0, Math.max(lastLine.length - 1, 1))}...`;
    return visible;
};

const renderTextBlock = ({ label, value, x, y, maxChars, maxLines = 2, valueFontSize = 32, labelFontSize = 18, lineGap = 10 }) => {
    const lines = wrapText(value, maxChars, maxLines);
    const labelSvg = `
        <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${labelFontSize}" font-weight="700" fill="#6f7782" letter-spacing="0">
            ${escapeXml(label)}
        </text>
    `;

    const tspans = lines.map((line, index) => (
        `<tspan x="${x}" dy="${index === 0 ? valueFontSize + 18 : valueFontSize + lineGap}">${escapeXml(line)}</tspan>`
    )).join('');

    const valueSvg = `
        <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${valueFontSize}" font-weight="700" fill="#1f2937" letter-spacing="0">
            ${tspans}
        </text>
    `;

    return {
        svg: `${labelSvg}${valueSvg}`,
        height: 18 + (lines.length * (valueFontSize + lineGap))
    };
};

const createSectionLine = (y) => `
    <line x1="80" y1="${y}" x2="${CARD_WIDTH - 80}" y2="${y}" stroke="#d6dde7" stroke-width="2" />
`;

const ensurePngBuffer = async (inputBuffer, resizeOptions) => sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize(resizeOptions)
    .png()
    .toBuffer();

const generateProofComplianceImage = async ({
    facultyName,
    locatorSlipCode,
    destination,
    purpose,
    focalPersonName,
    focalPersonPosition,
    submittedAt,
    signatureBuffer,
    arrivalPhotoBuffer
}) => {
    if (!signatureBuffer) {
        throw new AppError('Signature image is required to generate the proof of compliance.', 422);
    }

    const signatureCardBuffer = await ensurePngBuffer(signatureBuffer, {
        width: 1180,
        height: 260,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
    });

    const arrivalThumbBuffer = arrivalPhotoBuffer
        ? await ensurePngBuffer(arrivalPhotoBuffer, {
            width: 280,
            height: 200,
            fit: 'cover'
        })
        : null;

    const base = sharp({
        create: {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            channels: 4,
            background: '#f8fbf8'
        }
    });

    const titleBlock = renderTextBlock({
        label: 'ARRIVAL VERIFICATION',
        value: 'Proof of Compliance',
        x: 80,
        y: 110,
        maxChars: 22,
        maxLines: 2,
        valueFontSize: 46,
        labelFontSize: 19,
        lineGap: 6
    });

    const facultyBlock = renderTextBlock({
        label: 'FACULTY NAME',
        value: facultyName,
        x: 80,
        y: 640,
        maxChars: 26,
        maxLines: 2
    });
    const slipBlock = renderTextBlock({
        label: 'LOCATOR SLIP CODE',
        value: locatorSlipCode,
        x: 760,
        y: 640,
        maxChars: 18,
        maxLines: 2
    });
    const destinationBlock = renderTextBlock({
        label: 'DESTINATION',
        value: destination,
        x: 80,
        y: 815,
        maxChars: 38,
        maxLines: 2
    });
    const purposeBlock = renderTextBlock({
        label: 'PURPOSE',
        value: purpose,
        x: 760,
        y: 815,
        maxChars: 38,
        maxLines: 2
    });
    const focalNameBlock = renderTextBlock({
        label: 'CONFIRMED BY',
        value: focalPersonName,
        x: 80,
        y: 990,
        maxChars: 24,
        maxLines: 2
    });
    const focalPositionBlock = renderTextBlock({
        label: 'POSITION',
        value: focalPersonPosition,
        x: 760,
        y: 990,
        maxChars: 22,
        maxLines: 2
    });
    const submittedBlock = renderTextBlock({
        label: 'SUBMITTED AT',
        value: formatDisplayDateTime(submittedAt),
        x: 760,
        y: 990,
        maxChars: 24,
        maxLines: 2,
        valueFontSize: 30
    });

    const photoCardLabel = arrivalThumbBuffer
        ? `
            <text x="990" y="192" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#6f7782" letter-spacing="0">
                ARRIVAL PHOTO
            </text>
          `
        : '';

    const photoCardRect = arrivalThumbBuffer
        ? `
            <rect x="990" y="210" width="280" height="200" rx="18" ry="18" fill="#ffffff" stroke="#d6dde7" stroke-width="2" />
          `
        : '';

    const svg = `
        <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="28" y="28" width="${CARD_WIDTH - 56}" height="${CARD_HEIGHT - 56}" rx="28" ry="28" fill="#ffffff" stroke="#dbe5dd" stroke-width="3" />
            <circle cx="62" cy="76" r="8" fill="#0b9617" />
            ${titleBlock.svg}
            <text x="80" y="190" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#6f7782" letter-spacing="0">
                FOCAL PERSON SIGNATURE
            </text>
            <rect x="80" y="210" width="860" height="320" rx="28" ry="28" fill="#fbfcfd" stroke="#d6dde7" stroke-width="2" />
            ${facultyBlock.svg}
            ${slipBlock.svg}
            ${createSectionLine(780)}
            ${destinationBlock.svg}
            ${createSectionLine(955)}
            ${purposeBlock.svg}
            ${focalNameBlock.svg}
            ${focalPositionBlock.svg}
            ${submittedBlock.svg}
            ${photoCardLabel}
            ${photoCardRect}
        </svg>
    `;

    const composites = [
        {
            input: Buffer.from(svg),
            top: 0,
            left: 0
        },
        {
            input: signatureCardBuffer,
            top: 240,
            left: 120
        }
    ];

    if (arrivalThumbBuffer) {
        composites.push({
            input: arrivalThumbBuffer,
            top: 211,
            left: 991
        });
    }

    return base
        .composite(composites)
        .png()
        .toBuffer();
};

module.exports = {
    formatDisplayDateTime,
    generateProofComplianceImage
};
