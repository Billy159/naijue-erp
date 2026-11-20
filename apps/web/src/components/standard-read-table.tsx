import { Table, type TableProps } from '@arco-design/web-react';
import { forwardRef, useMemo, type HTMLAttributes, type ReactNode } from 'react';
import './standard-read-table.css';
export type StandardReadColumn<Row> = NonNullable<TableProps<Row>['columns']>[number];
// Supported Arco value renderer for explicitly bounded read-only detail tables.
// It removes only the default inline span. Arco still owns td/div, row, title,
// events and headers. This is not a cell editor or an onHandleSave adapter.
function PlainReadCellContent({ children }: { readonly children?: ReactNode }) { return <>{children}</>; }
/** Server owners supply one already-validated page. Arco owns table structure;
 * this adapter never slices, sorts, totals or converts domain values. */
export function StandardReadTable<Row extends { readonly id: string }>(props: {
  readonly label: string; readonly rows: readonly Row[]; readonly columns: readonly StandardReadColumn<Row>[];
  readonly tableClassName?: string; readonly onRow?: TableProps<Row>['onRow'];
  readonly plainCellContent?: boolean;
}) {
  // Use Arco's supported table renderer to retain the existing table-level
  // accessible name and layout classes; all headers/rows/cells remain Arco's.
  const NamedTable = useMemo(() => forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function NamedTable(attributes, ref) {
    return <table {...attributes} ref={ref} className={`${attributes.className ?? ''} ${props.tableClassName ?? ''}`} aria-label={props.label} />;
  }), [props.label, props.tableClassName]);
  // Arco deep-merges this map. Recreating it would clone forwardRef's object
  // identity and remount the table, disconnecting a captured row trigger.
  const components = useMemo(() => ({ table: NamedTable, ...(props.plainCellContent ? { body: { cell: PlainReadCellContent } } : {}) }), [NamedTable, props.plainCellContent]);
  return <div className="erp-read-table"><Table<Row> rowKey="id" size="small" border={false}
    columns={[...props.columns]} data={[...props.rows]} pagination={false} noDataElement={<></>}
    components={components} {...(props.onRow ? { onRow: props.onRow } : {})} /></div>;
}
