import type TableCellContent from '../../block/content/tableCell';
import type Table from '../../block/gfm/table';
import type { Muya } from '../../index';

export async function resizeTableWithConfirmation(
    muya: Muya,
    table: Table,
    targetRows: number,
    targetColumns: number,
    focusRow: number,
    focusColumn: number,
): Promise<TableCellContent | null> {
    const currentRows = table.rowCount;
    const currentColumns = table.columnCount;
    const impact = table.getResizeImpact(targetRows, targetColumns);

    if (impact.nonEmptyCount > 0) {
        const confirmResize = muya.options.confirmTableResize;
        if (!confirmResize)
            return null;

        const accepted = await confirmResize({
            fromRows: currentRows,
            fromColumns: currentColumns,
            toRows: targetRows,
            toColumns: targetColumns,
            ...impact,
        });
        if (!accepted)
            return null;
    }

    return table.resize(targetRows, targetColumns, focusRow, focusColumn);
}
