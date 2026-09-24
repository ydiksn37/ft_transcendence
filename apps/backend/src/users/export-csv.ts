/** Long-form CSV supports heterogeneous account datasets without losing fields. */
export function accountExportCsv(data: Record<string, unknown>): string {
  const rows: unknown[][] = [['dataset', 'record', 'field', 'value']];
  for (const [dataset, value] of Object.entries(data)) {
    const records = Array.isArray(value) ? value : [value];
    records.forEach((record, index) => {
      if (record && typeof record === 'object' && !(record instanceof Date)) {
        for (const [field, item] of Object.entries(record))
          rows.push([dataset, index, field, item]);
      } else rows.push([dataset, index, '', record]);
    });
  }
  const cell = (value: unknown) => {
    let text: string;
    if (value == null) text = '';
    else if (value instanceof Date) text = value.toISOString();
    else if (typeof value === 'string') text = value;
    else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    )
      text = String(value);
    else if (typeof value === 'object') text = JSON.stringify(value);
    else throw new TypeError('Unsupported CSV value');
    if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return (
    '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
  );
}
