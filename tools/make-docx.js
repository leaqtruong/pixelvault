/* Build a .docx (Office Open XML) with no dependencies.
 *
 * Word files are a ZIP of XML parts, and Node ships zlib, so the whole thing
 * is written by hand here: the zip container, CRC-32, and the
 * WordprocessingML for styles, numbering, paragraphs and tables.
 *
 * Word COM would also produce a file, but driving it through several hundred
 * paragraphs and tables is slow and breaks on every stray character.
 *
 *   node tools/make-docx.js input.txt output.docx
 *
 * Input is a small markup:
 *   # Title            ## Heading 2      ### Heading 3
 *   - bullet           1. numbered item
 *   | table | cells |  (a leading and trailing | are optional)
 *   ``` fenced code ```
 *   > quote
 *   ---                 page break
 *   **bold**  `inline code`  everything else is a normal paragraph
 */
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

// ------------------------------------------------------------------ zip

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* DOS date/time, so Word shows a sane modified date instead of 1980. */
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function zip(files, when) {
  const { time, date } = dosTime(when || new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    locals.push(local, body);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 30);        // extra + comment len
    central.writeUInt16LE(0, 34);        // disk number
    central.writeUInt16LE(0, 36);        // internal attrs
    central.writeUInt32LE(0, 38);        // external attrs
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

// --------------------------------------------------------------- xml bits

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* **bold** and `code` inside a paragraph; boldAll forces the whole cell bold. */
function runs(text, boldAll = false) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let m;

  const emitPlain = (s) => {
    if (!s) return;
    // a newline inside a paragraph becomes a line break
    const parts = s.split('\n');
    parts.forEach((p, i) => {
      if (i) out.push('<w:r><w:br/></w:r>');
      if (p) out.push(boldAll
        ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(p)}</w:t></w:r>`
        : `<w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r>`);
    });
  };

  while ((m = re.exec(text)) !== null) {
    emitPlain(text.slice(cursor, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(tok.slice(2, -2))}</w:t></w:r>`);
    } else {
      out.push(`<w:r><w:rPr><w:rStyle w:val="CodeChar"/></w:rPr><w:t xml:space="preserve">${esc(tok.slice(1, -1))}</w:t></w:r>`);
    }
    cursor = m.index + tok.length;
  }
  emitPlain(text.slice(cursor));
  return out.join('');
}

function cellRuns(text, bold) {
  return runs(text, bold);
}

const para = (text, style, extra = '') =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${runs(text)}</w:p>`;

const bullet = (text, level) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr></w:pPr>${runs(text)}</w:p>`;

const codeBlock = (lines) => {
  const inner = lines
    .map((l, i) => `<w:r>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l) || ' '}</w:t></w:r>`)
    .join('');
  return `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>${inner}</w:p>`;
};

const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function table(rows, widths) {
  if (!rows.length) return '';
  const ncol = Math.max(...rows.map((r) => r.length));
  const cols = (widths && widths.length === ncol) ? widths : guessWidths(rows);
  const total = cols.reduce((a, b) => a + b, 0);
  const grid = cols.map((c) => `<w:gridCol w:w="${Math.round((c / total) * 9360)}"/>`).join('');

  const body = rows.map((cells, r) => {
    const isHead = r === 0;
    const tcs = [];
    for (let i = 0; i < ncol; i++) {
      const w = Math.round((cols[i] / total) * 9360);
      const text = cells[i] === undefined ? '' : cells[i];
      const pStyle = isHead ? 'TableText' : 'TableText';
      const shd = isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="E8E4DC"/>' : '';
      tcs.push(
        `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}<w:vAlign w:val="center"/></w:tcPr>` +
        `<w:p><w:pPr><w:pStyle w:val="${pStyle}"/></w:pPr>${cellRuns(text, isHead)}</w:p></w:tc>`,
      );
    }
    return `<w:tr><w:trPr>${isHead ? '<w:tblHeader/>' : ''}</w:trPr>${tcs.join('')}</w:tr>`;
  }).join('');

  // tblPr order: tblStyle, tblW, tblBorders, tblLayout, tblCellMar
  return '<w:tbl><w:tblPr><w:tblStyle w:val="PixelGrid"/>' +
    '<w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="B0AAA0"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>` +
    '<w:p><w:pPr><w:pStyle w:val="AfterTable"/></w:pPr></w:p>';
}

// ------------------------------------------------------------- conversion

function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { cur += s[++i]; continue; }
    if (s[i] === '`') {
      // keep inline code spanning pipes out of the split
      const close = s.indexOf('`', i + 1);
      if (close > -1) { cur += s.slice(i, close + 1); i = close; continue; }
    }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/* Column widths from a `::: 2 3 5` directive above a table, else the widest
   cell in each column capped so one long column cannot eat the page. */
function guessWidths(rows) {
  const n = Math.max(...rows.map((r) => r.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    let max = 4;
    for (const r of rows) if (r[i]) max = Math.max(max, r[i].length);
    out.push(Math.min(max, 46));
  }
  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((w) => w / sum);
}

function convert(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let pendingWidths = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i++; continue; }

    if (/^:::(\s+[\d.]+)+$/.test(t)) {
      pendingWidths = t.slice(3).trim().split(/\s+/).map(Number);
      i++; continue;
    }

    if (t === '---') { out.push(PAGE_BREAK); i++; continue; }

    if (t.startsWith('```')) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i]), i++;
      i++;
      out.push(codeBlock(body));
      continue;
    }

    if (t.startsWith('# ')) { out.push(para(t.slice(2), 'Title')); i++; continue; }
    if (t.startsWith('## ')) { out.push(para(t.slice(3), 'Heading1')); i++; continue; }
    if (t.startsWith('### ')) { out.push(para(t.slice(4), 'Heading2')); i++; continue; }
    if (t.startsWith('#### ')) { out.push(para(t.slice(5), 'Heading3')); i++; continue; }

    if (t.startsWith('> ')) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) q.push(lines[i].trim().slice(2)), i++;
      out.push(`<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${runs(q.join(' '))}</w:p>`);
      continue;
    }

    // table: a pipe row followed by a separator row
    if (t.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const rows = [parseTableRow(line)];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      out.push(table(rows, pendingWidths || guessWidths(rows)));
      pendingWidths = null;
      continue;
    }

    if (/^[-*] /.test(t)) {
      const items = [];
      let level = 0;
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)[0].length;
        level = indent >= 2 ? 1 : 0;
        items.push(bullet(lines[i].trim().slice(2), level));
        i++;
      }
      out.push(items.join(''));
      continue;
    }

    if (/^\d+[.)] /.test(t)) {
      out.push(para(t.replace(/^\d+[.)]\s*/, ''), 'ListNumber'));
      i++;
      continue;
    }

    // plain paragraph, joining consecutive lines
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() &&
           !/^\s*(#{1,4}\s|[-*]\s|\d+[.)]\s|>|\||```|---)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(para(buf.join(' '), 'BodyText'));
  }
  return out.join('');
}

// ----------------------------------------------------------------- parts

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="360" w:hanging="220"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="720" w:hanging="220"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

/* WordprocessingML requires its child elements in a fixed order or the file is
   rejected outright. The orders that matter here:
     w:pPr   pStyle, keepNext, numPr, pBdr, shd, spacing, ind, jc, outlineLvl
     w:rPr   rStyle, rFonts, b, i, color, sz, szCs, shd
     w:tblPr tblStyle, tblW, tblBorders, tblLayout, tblCellMar
     w:tcPr  tcW, shd, vAlign
     w:style name, basedOn, next, pPr, rPr, tblPr                      */

const FONT_BODY = 'Calibri';
const FONT_HEAD = 'Calibri Light';

function pPr(parts) { return parts.filter(Boolean).join(''); }

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${FONT_BODY}" w:hAnsi="${FONT_BODY}" w:cs="${FONT_BODY}"/>
<w:color w:val="1F1B16"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="vi-VN"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>

<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>

<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:after="140"/><w:jc w:val="both"/></w:pPr></w:style>

<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="8A7F6A"/></w:pBdr>
<w:spacing w:before="0" w:after="280"/><w:jc w:val="center"/></w:pPr>
<w:rPr><w:rFonts w:ascii="${FONT_HEAD}" w:hAnsi="${FONT_HEAD}"/><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
<w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="B8AE9C"/></w:pBdr>
<w:spacing w:before="360" w:after="150"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:rFonts w:ascii="${FONT_HEAD}" w:hAnsi="${FONT_HEAD}"/><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="110"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:rFonts w:ascii="${FONT_HEAD}" w:hAnsi="${FONT_HEAD}"/><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="90"/><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:rFonts w:ascii="${FONT_HEAD}" w:hAnsi="${FONT_HEAD}"/><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>

<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:after="60"/><w:ind w:left="420" w:hanging="280"/></w:pPr></w:style>

<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="C8BFAE"/></w:pBdr>
<w:spacing w:before="140" w:after="180"/><w:ind w:left="400"/></w:pPr>
<w:rPr><w:i/><w:color w:val="4A443A"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C8BFAE"/></w:pBdr>
<w:shd w:val="clear" w:color="auto" w:fill="F5F2EC"/>
<w:spacing w:before="100" w:after="160" w:line="240" w:lineRule="auto"/>
<w:ind w:left="220" w:right="120"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="2B2721"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>

<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="8A3D2E"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="EFEADF"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>
<w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>

<w:style w:type="paragraph" w:styleId="AfterTable"><w:name w:val="After Table"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="auto"/></w:pPr>
<w:rPr><w:sz w:val="10"/></w:rPr></w:style>

<w:style w:type="table" w:styleId="PixelGrid"><w:name w:val="Pixel Grid"/>
<w:tblPr><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr></w:tblStylePr></w:style>
</w:styles>`;

const documentXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr></w:body></w:document>`;

const coreXml = (title) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:subject>Bai tap 2 - Phan tich he thong va thiet ke MongoDB</dc:subject>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:modified>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>PixelVault docx writer</Application></Properties>`;

// ------------------------------------------------------------------ main

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node tools/make-docx.js input.txt output.docx');
  process.exit(1);
}

const source = fs.readFileSync(inFile, 'utf8');
// a docx is a zip, so the bytes must be xml in utf-8 without a bom
const xml = (s) => Buffer.from(s.replace(/^﻿/, ''), 'utf8');

const titleMatch = source.match(/^#\s+(.+)$/m);
const docTitle = titleMatch ? titleMatch[1] : path.basename(inFile);

const body = convert(source);

const buf = zip([
  { name: '[Content_Types].xml', data: xml(CONTENT_TYPES) },
  { name: '_rels/.rels', data: xml(RELS) },
  { name: 'word/document.xml', data: xml(documentXml(body)) },
  { name: 'word/_rels/document.xml.rels', data: xml(DOC_RELS) },
  { name: 'word/styles.xml', data: xml(styles) },
  { name: 'word/numbering.xml', data: xml(NUMBERING) },
  { name: 'docProps/core.xml', data: xml(coreXml(docTitle)) },
  { name: 'docProps/app.xml', data: xml(APP_XML) },
], new Date());

fs.writeFileSync(outFile, buf);

const paras = (body.match(/<w:p>/g) || []).length;
const tbls = (body.match(/<w:tbl>/g) || []).length;
console.log(`wrote ${outFile}`);
console.log(`  ${(buf.length / 1024).toFixed(1)} KB, ${paras} paragraphs, ${tbls} tables`);