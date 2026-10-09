import { strToU8, zipSync } from 'fflate'

export type Cell = string | number | boolean | null | undefined
export type Table = { name: string; columns: string[]; rows: Cell[][] }

// ---------------------------------------------------------------------------
// CSV compatible con Excel en configuración regional de español (separador ";", UTF-8 con BOM)
// ---------------------------------------------------------------------------
const csvCell = (v: Cell): string => {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'VERDADERO' : 'FALSO') : String(v)
  // Neutraliza inyección de fórmulas en Excel (=, +, -, @ al inicio de texto)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
export function toCSV(t: Table): string {
  return '﻿' + [t.columns.map(csvCell).join(';'), ...t.rows.map((r) => r.map(csvCell).join(';'))].join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// XLSX mínimo (OOXML SpreadsheetML) sin dependencias pesadas
// ---------------------------------------------------------------------------
const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
const sheetName = (n: string) => n.replace(/[\\/?*[\]:]/g, '_').slice(0, 31)

function sheetXml(t: Table): string {
  const row = (cells: Cell[], r: number) => `<row r="${r}">${cells.map((v, c) => {
    const ref = `${colName(c)}${r}`
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`
  }).join('')}</row>`
  const header = `<row r="1">${t.columns.map((v, c) => `<c r="${colName(c)}1" t="inlineStr" s="1"><is><t>${xmlEsc(v)}</t></is></c>`).join('')}</row>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${header}${t.rows.map((r, i) => row(r, i + 2)).join('')}</sheetData></worksheet>`
}

export function toXLSX(tables: Table[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((t, i) => `<sheet name="${xmlEsc(sheetName(t.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
  }
  tables.forEach((t, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(t)) })
  return zipSync(files, { level: 6 })
}

export function toZip(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])), { level: 6 })
}

export function download(name: string, data: string | Uint8Array | Blob, mime: string) {
  const blob = new Blob([data as BlobPart], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
