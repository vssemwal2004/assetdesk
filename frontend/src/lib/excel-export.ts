import writeExcelFile, { type Cell, type Sheet, type SheetData } from 'write-excel-file/browser';

export type SheetValue = string | number | Date | null | undefined;

export interface SheetColumn {
  label: string;
  width?: number;
}

export interface WorkbookInput {
  fileName: string;
  sheetName: string;
  columns: SheetColumn[];
  rows: SheetValue[][];
  /** Written to a second "Filters" sheet so the file records how it was produced. */
  filterSummary?: Array<{ label: string; value: string }>;
}

const headerCell = (value: string): Cell => ({
  value,
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: '#1F4E78',
  align: 'center',
  wrap: true,
  height: 30,
});

function bodyCell(value: SheetValue, rowIndex: number): Cell {
  const base = {
    backgroundColor: rowIndex % 2 === 0 ? '#F4F8FC' : '#FFFFFF',
    textColor: '#172033',
    wrap: true,
    alignVertical: 'center' as const,
    borderColor: '#D9E2F0',
    height: 24,
  };
  if (value instanceof Date) return { ...base, value, type: Date, format: 'dd mmm yyyy, hh:mm' };
  if (typeof value === 'number') return { ...base, value, type: Number, align: 'right' };
  return { ...base, value: value ?? '' };
}

export function safeFileName(value: string, extension = 'xlsx'): string {
  const base = value
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return `${base || 'assetdesk-export'}.${extension}`;
}

export async function saveWorkbook(input: WorkbookInput): Promise<void> {
  const data: SheetData = [
    input.columns.map((column) => headerCell(column.label)),
    ...input.rows.map((row, rowIndex) => row.map((value) => bodyCell(value, rowIndex))),
  ];
  const sheets: Sheet<Blob>[] = [
    {
      data,
      sheet: input.sheetName.slice(0, 31),
      columns: input.columns.map((column) => ({ width: column.width ?? 20 })),
      stickyRowsCount: 1,
      showGridLines: false,
    },
  ];
  if (input.filterSummary) {
    const generated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    sheets.push({
      data: [
        [headerCell('Filter'), headerCell('Value')],
        ...[
          { label: 'Generated (IST)', value: generated },
          { label: 'Rows', value: String(input.rows.length) },
          ...(input.filterSummary.length
            ? input.filterSummary
            : [{ label: 'Filters', value: 'None (all data)' }]),
        ].map((entry, rowIndex) => [
          bodyCell(entry.label, rowIndex),
          bodyCell(entry.value, rowIndex),
        ]),
      ],
      sheet: 'Filters',
      columns: [{ width: 28 }, { width: 70 }],
      showGridLines: false,
    });
  }
  await writeExcelFile(sheets).toFile(safeFileName(input.fileName));
}
