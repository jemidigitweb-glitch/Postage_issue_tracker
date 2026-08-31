import "server-only";

import { deflateRawSync } from "node:zlib";

// Minimal, dependency-free XLSX (SpreadsheetML) writer.
//
// WHY hand-rolled rather than `exceljs`/`xlsx`: this project has exactly one
// export surface (Super Admin -> Issues -> Download Issues) writing a single
// sheet of plain text cells. Both popular libraries are multi-megabyte and
// pull in their own parsers, styling engines and CSV/HTML readers — none of
// which is used here. Everything needed is ~150 lines against Node's built-in
// zlib, so package.json is left untouched.
//
// Scope is deliberately narrow and should stay that way:
//   - one worksheet
//   - every cell is a TEXT cell (t="inlineStr") — no numbers, dates, formulas
//   - one bold header row, frozen, with fixed column widths
//
// Text-only is a correctness decision, not laziness: Issue IDs like "ND-007"
// and dates like "2026-08-31" must survive the round trip exactly as stored.
// Handing them to Excel as anything but a string invites silent reformatting
// (leading zeros dropped, dates re-localized), which would make an exported
// row stop matching the row on screen.

/** A1-style column name for a 0-based index (0 -> "A", 26 -> "AA"). */
function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** Everything below 0x20 except tab (09), LF (0A) and CR (0D), plus the
 *  0x7F–0x9F block. Written with \u escapes rather than literal bytes so the
 *  source file itself stays plain ASCII. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** XML text escaping, plus removal of the control characters the OOXML spec
 *  forbids in a shared/inline string. Excel refuses to open a file that
 *  contains them, so a stray control byte pasted into a description would
 *  otherwise corrupt the whole export. */
function escapeXml(value: string): string {
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Cell values may be null/undefined — those become a genuinely EMPTY cell
 *  (no <c> element at all), never the string "null" or a placeholder dash. */
export type XlsxCell = string | null | undefined;

export interface XlsxSheetInput {
  /** Sheet tab name. Excel forbids : \ / ? * [ ] and caps it at 31 chars. */
  sheetName: string;
  /** Header labels — rendered bold in row 1, which is then frozen. */
  headers: string[];
  /** Data rows. A row shorter than `headers` simply ends early. */
  rows: XlsxCell[][];
  /** Optional per-column widths in Excel "characters". Falls back to a
   *  readable default when absent or short. */
  columnWidths?: number[];
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Excel's own sheet-name rules. Applied here so a caller cannot produce a
 *  file that Excel rejects at open time. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

function buildSheetXml(input: XlsxSheetInput): string {
  const columnCount = Math.max(
    input.headers.length,
    ...input.rows.map((row) => row.length),
    1
  );

  const cols = Array.from({ length: columnCount }, (_, index) => {
    const width = input.columnWidths?.[index] ?? 22;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");

  // styleId 1 = bold (header), 2 = top-aligned wrapped text (body). See
  // buildStylesXml below for the matching cellXfs entries.
  const cell = (rowNumber: number, columnIndex: number, value: XlsxCell, styleId: number) => {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const ref = `${columnName(columnIndex)}${rowNumber}`;
    return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  };

  const headerRow = `<row r="1">${input.headers
    .map((label, index) => cell(1, index, label, 1))
    .join("")}</row>`;

  const bodyRows = input.rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = row.map((value, index) => cell(rowNumber, index, value, 2)).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  const lastRow = input.rows.length + 1;
  const dimension = `A1:${columnName(columnCount - 1)}${lastRow}`;

  return (
    `${XML_DECLARATION}<worksheet xmlns="${MAIN_NS}">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${headerRow}${bodyRows}</sheetData>` +
    // Header row gets Excel's dropdown filters, so the recipient can slice the
    // export further without re-running it.
    `<autoFilter ref="A1:${columnName(columnCount - 1)}${lastRow}"/>` +
    `</worksheet>`
  );
}

function buildStylesXml(): string {
  return (
    `${XML_DECLARATION}<styleSheet xmlns="${MAIN_NS}">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">` +
    `<alignment vertical="top" wrapText="1"/></xf>` +
    `</cellXfs>` +
    `</styleSheet>`
  );
}

/**
 * Builds a complete .xlsx file in memory and returns its bytes.
 * Single sheet, text cells only — see the module header for why.
 */
export function buildXlsx(input: XlsxSheetInput): Buffer {
  const sheetName = sanitizeSheetName(input.sheetName);

  const files: Array<{ path: string; content: string }> = [
    {
      path: "[Content_Types].xml",
      content:
        `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    },
    {
      path: "_rels/.rels",
      content:
        `${XML_DECLARATION}<Relationships xmlns="${PKG_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content:
        `${XML_DECLARATION}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content:
        `${XML_DECLARATION}<Relationships xmlns="${PKG_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { path: "xl/styles.xml", content: buildStylesXml() },
    { path: "xl/worksheets/sheet1.xml", content: buildSheetXml(input) },
  ];

  return buildZip(files);
}

// ---------------------------------------------------------------------------
// ZIP container
//
// An .xlsx IS a ZIP archive. Only the classic (non-ZIP64) format is emitted:
// entry count, per-entry size and total size all stay far below the 4 GB /
// 65535-entry limits for a six-part spreadsheet, so ZIP64 headers would be
// dead weight.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed 1980-01-01 00:00 DOS timestamp on every entry. Deliberate: the file's
// bytes then depend only on its contents, so two exports of the same filtered
// result are byte-identical and trivially comparable. The real "when was this
// exported" lives in the filename, which carries the date.
const DOS_TIME = 0;
const DOS_DATE = 33; // ((1980-1980) << 9) | (1 << 5) | 1

function buildZip(files: Array<{ path: string; content: string }>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.path, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // general purpose flags
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const central = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  endRecord.writeUInt16LE(0, 4); // number of this disk
  endRecord.writeUInt16LE(0, 6); // disk with start of central directory
  endRecord.writeUInt16LE(files.length, 8); // entries on this disk
  endRecord.writeUInt16LE(files.length, 10); // total entries
  endRecord.writeUInt32LE(central.length, 12);
  endRecord.writeUInt32LE(offset, 16); // central directory offset
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, central, endRecord]);
}
