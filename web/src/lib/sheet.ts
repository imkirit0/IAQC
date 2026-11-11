// Reference Data spreadsheets: reads an upload into per-ASO rows, and writes a viewer's own rows back to a file. Server only (imported by actions).
import * as XLSX from "xlsx";
import { asoKey } from "./support";

export type SheetRow = { n: number; cells: string[] };
export type SheetPart = { aso_key: string; aso: string; rows: SheetRow[] };
export type ParsedSheet = { columns: string[]; parts: SheetPart[] };

// ponytail: the whole sheet is sent to the browser for instant search, so its text stays under the 4.5 MB hosting response limit;
// page and search on the server if larger sheets are needed.
export const REF_MAX_SHEET_BYTES = 3.5 * 1024 * 1024;

const NO_ASO_COLUMN = 'The first column of the spreadsheet must be named "ASO Name". The file was not uploaded.';
const some = (xs: (string | number)[]) => xs.slice(0, 5).join(", ") + (xs.length > 5 ? ` and ${xs.length - 5} more` : "");

/** Reads the first sheet. `asos` are the ASO names the system knows; a row naming any other could never be shown to its Area Coordinator, so it is refused. */
export function parseSheet(data: ArrayBuffer, fileName: string, asos: string[]): ParsedSheet | { error: string } {
  let ws: XLSX.WorkSheet | undefined;
  try {
    const wb = XLSX.read(new Uint8Array(data), { type: "array", raw: /\.csv$/i.test(fileName), dateNF: "dd-mm-yyyy" }); // raw: a CSV keeps values like 00123 as written
    ws = wb.Sheets[wb.SheetNames[0]];
  } catch { return { error: "This spreadsheet could not be read. Save it again as .xlsx and retry." }; }
  if (!ws?.["!ref"]) return { error: NO_ASO_COLUMN };
  const start = XLSX.utils.decode_range(ws["!ref"]).s;
  const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true, dateNF: "dd-mm-yyyy" }) as unknown[][])
    .map(r => Array.from(r, c => String(c ?? "").trim()));

  const h = grid.findIndex(r => r.some(Boolean)); // the heading row: the first with anything in it
  if (h < 0 || start.c > 0 || !/^aso\s+name$/i.test(grid[h][0] ?? "")) return { error: NO_ASO_COLUMN };
  const rows = grid.map((cells, i): SheetRow => ({ n: i + start.r + 1, cells })).slice(h + 1).filter(r => r.cells.some(Boolean));
  if (!rows.length) return { error: "The spreadsheet has headings but no data rows." };

  const blank = rows.filter(r => !r.cells[0]).map(r => r.n);
  if (blank.length) return { error: `Every row needs an ASO name. Missing in row ${some(blank)}. The file was not uploaded.` };
  const known = new Set(asos.map(asoKey)), unknown = [...new Set(rows.filter(r => !known.has(asoKey(r.cells[0]))).map(r => r.cells[0]))];
  if (unknown.length) return { error: `Not a recognised ASO: ${some(unknown)}. Use the names in the Directory (${asos.join(", ")}). The file was not uploaded.` };

  // Drop empty columns on the right (spreadsheets often carry formatted but blank ones) and give every row the same width.
  const width = Math.max(...[grid[h], ...rows.map(r => r.cells)].map(c => c.findLastIndex(Boolean) + 1));
  const fit = (c: string[]) => Array.from({ length: width }, (_, i) => c[i] ?? "");
  const parts = new Map<string, SheetPart>();
  for (const r of rows) {
    const key = asoKey(r.cells[0]);
    if (!parts.has(key)) parts.set(key, { aso_key: key, aso: r.cells[0], rows: [] });
    parts.get(key)!.rows.push({ n: r.n, cells: fit(r.cells) });
  }
  const parsed = { columns: fit(grid[h]), parts: [...parts.values()] };
  return Buffer.byteLength(JSON.stringify(parsed)) > REF_MAX_SHEET_BYTES ? { error: "This spreadsheet holds too much data to display. Split it into smaller files." } : parsed;
}

/** A cell a spreadsheet program would run as a formula when it opens a CSV. Student answers are untrusted, so these are made plain text. */
export const safeCsvCell = (c: string | number) => (typeof c === "string" && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c);

/** A finished Excel or CSV file from a grid of cells. Excel stores text cells as text, so only CSV needs protecting. */
export function gridFile(grid: (string | number)[][], format: "xlsx" | "csv"): Buffer {
  if (format === "csv") return Buffer.from(`\uFEFF${XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(grid.map(r => r.map(safeCsvCell))))}`, "utf8"); // the mark tells Excel it is UTF-8
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), "Responses");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/** An .xlsx of just these rows, base64-encoded. */
export function sheetFile(columns: string[], rows: string[][]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows]), "Reference data");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}
