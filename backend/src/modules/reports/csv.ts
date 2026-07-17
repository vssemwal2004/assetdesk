function replaceUnsafeControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
}

function safeCell(value: unknown): string {
  let text = replaceUnsafeControlCharacters(String(value ?? '')).replaceAll('"', '""');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text}"`;
}

export function createCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(safeCell), ...rows.map((row) => row.map(safeCell))];
  return `\uFEFF${lines.map((row) => row.join(',')).join('\r\n')}\r\n`;
}
