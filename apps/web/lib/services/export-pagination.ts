export type ExportPage = {
  offset: number;
  size: number;
  reportCount: (count: number | null) => void;
  start?: string;
  end?: string;
};

// Exact counts expose API caps and changing datasets instead of producing partial files.
export async function collectExportRows<T extends { id: string }>(
  fetchPage: (page: ExportPage) => Promise<T[]>,
  assertCurrent: () => void,
  maxRows = 5000,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  do {
    assertCurrent();
    let count: number | null = null;
    const page = await fetchPage({ offset: rows.length, size: 250, reportCount: value => { count = value; } });
    assertCurrent();
    if (count === null || (expected !== undefined && count !== expected)) {
      throw new Error("The dataset changed or its completeness could not be verified. Please retry.");
    }
    expected = count;
    if (expected > maxRows) throw new Error(`Export exceeds ${maxRows.toLocaleString("en-GB")} rows. Narrow the date range or branch.`);
    if (page.length !== Math.min(250, expected - rows.length)) {
      throw new Error("The export could not retrieve every matching record. Please retry with a smaller range.");
    }
    for (const row of page) {
      if (ids.has(row.id)) throw new Error("The dataset changed during export. Please retry.");
      ids.add(row.id);
      rows.push(row);
    }
  } while (rows.length < expected);
  return rows;
}
