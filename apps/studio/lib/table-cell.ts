// Which cell of a table on the paper was clicked (SPEC-studio.md v1.10): its row in the table and its column,
// counting the columns that cells before it span. The toolbar's table buttons work on that row and column.

export type CellPlace = { row: number; col: number };

/** The place of a <td>/<th> in its table, or null when it is not in one. */
export function cellPlace(td: Element): CellPlace | null {
  const tr = td.parentElement;
  const table = tr?.closest("table");
  if (!tr || !table || !(td instanceof HTMLTableCellElement) || !(tr instanceof HTMLTableRowElement)) return null;
  const row = [...table.rows].indexOf(tr);
  let col = 0;
  for (const c of tr.cells) {
    if (c === td) return { row, col };
    col += c.colSpan || 1;
  }
  return null;
}

/** The cell of a table element at a place (the one covering that column), for drawing it as selected. */
export function cellAtPlace(table: HTMLTableElement, place: CellPlace): HTMLTableCellElement | null {
  const tr = table.rows[place.row];
  if (!tr) return null;
  let col = 0;
  for (const c of tr.cells) {
    if (place.col >= col && place.col < col + (c.colSpan || 1)) return c;
    col += c.colSpan || 1;
  }
  return null;
}
