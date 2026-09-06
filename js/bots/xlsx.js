/* ASTRA Terminal — a small Excel writer.

   Produces a real .xlsx workbook with several sheets, frozen headers, filters,
   column widths and number formats — with no library and no upload. The file is
   built in the browser and saved straight to the machine.

   An .xlsx is a ZIP of XML files, so this carries a minimal ZIP writer that
   stores entries uncompressed. Excel, LibreOffice and Numbers all open it. */
const XLSX = {

  /* ---------- CRC32, needed by the ZIP format ---------- */
  _table: null,
  crcTable(){
    if (this._table) return this._table;
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++){
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return (this._table = t);
  },
  crc32(buf){
    const t = this.crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },

  /* ---------- ZIP (stored, no compression) ---------- */
  zip(files){
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;

    const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

    /* one fixed timestamp keeps the file byte-stable between exports */
    const d = new Date();
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

    for (const f of files){
      const name = enc.encode(f.name);
      const data = enc.encode(f.data);
      const crc = this.crc32(data);
      const head = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),        // sig, version, UTF-8 flag, stored
        u16(time), u16(date), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += head.length + name.length + data.length;
    }

    const cdir = [];
    for (const c of central){
      const h = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(time), u16(date), u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      cdir.push(new Uint8Array(h), c.name);
    }
    const cdirLen = cdir.reduce((a, x) => a + x.length, 0);
    const end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdirLen), u32(offset), u16(0)));

    const all = parts.concat(cdir, [end]);
    const total = all.reduce((a, x) => a + x.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const chunk of all){ out.set(chunk, p); p += chunk.length; }
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },

  /* ---------- XML helpers ---------- */
  esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');       // Excel rejects control characters
  },

  colName(i){
    let s = '';
    i++;
    while (i > 0){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - r - 1) / 26; }
    return s;
  },

  /* style ids: 0 plain · 1 header · 2 money (2 decimals) · 3 whole number · 4 bold */
  styles(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
      '<fonts count="3">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF16233F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  },

  /* a cell is a primitive, or {v, s} to pick a style */
  cell(ref, val){
    const o = (val && typeof val === 'object' && !(val instanceof Date)) ? val : { v: val };
    const v = o.v;
    const s = o.s != null ? ' s="' + o.s + '"' : '';
    if (v == null || v === '') return '<c r="' + ref + '"' + s + '/>';
    if (typeof v === 'number' && isFinite(v))
      return '<c r="' + ref + '"' + (o.s != null ? s : ' s="2"') + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"' + s + '><is><t xml:space="preserve">' + this.esc(v) + '</t></is></c>';
  },

  sheetXml(sheet){
    const rows = sheet.rows || [];
    const width = rows.reduce((a, r) => Math.max(a, r.length), 0);
    const cols = (sheet.cols || []).map((w, i) =>
      '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('');

    const body = rows.map((r, ri) => {
      const cells = r.map((c, ci) => this.cell(this.colName(ci) + (ri + 1), c)).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');

    const lastCol = this.colName(Math.max(0, width - 1));
    const filter = (sheet.filter !== false && rows.length > 1)
      ? '<autoFilter ref="A1:' + lastCol + rows.length + '"/>' : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView' + (sheet.first ? ' tabSelected="1"' : '') + ' workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols ? '<cols>' + cols + '</cols>' : '') +
      '<sheetData>' + body + '</sheetData>' + filter + '</worksheet>';
  },

  safeName(n, i){
    const s = String(n || ('Sheet' + (i + 1))).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
    return s || ('Sheet' + (i + 1));
  },

  build(sheets){
    const names = [];
    sheets.forEach((s, i) => {
      let n = this.safeName(s.name, i), k = 2;
      while (names.includes(n)) n = this.safeName(s.name, i).slice(0, 28) + ' ' + (k++);
      names.push(n);
    });

    const files = [
      { name: '[Content_Types].xml', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
        '</Types>' },
      { name: '_rels/.rels', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { name: 'xl/workbook.xml', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => '<sheet name="' + this.esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
        '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
          (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { name: 'xl/styles.xml', data: this.styles() },
    ];
    sheets.forEach((s, i) => files.push({
      name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
      data: this.sheetXml(Object.assign({ first: i === 0 }, s)),
    }));
    return this.zip(files);
  },

  save(filename, sheets){
    const blob = this.build(sheets);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return blob.size;
  },

  /* headers get the header style automatically */
  head(labels){ return labels.map(l => ({ v: l, s: 1 })); },
};
