import type { DataTableColumns } from 'naive-ui'
import type { Ref } from 'vue'

export type TableSortOrder = 'asc' | 'desc'
export type NaiveSortOrder = 'ascend' | 'descend' | false

export interface TableSortState {
  columnKey: string | number
  order: NaiveSortOrder
}

/** 表头排序仅在升序 / 降序间切换 */
export function toggleAscDescOnly(order: NaiveSortOrder): NaiveSortOrder {
  return order === 'ascend' ? 'descend' : 'ascend'
}

export function toNaiveSortOrder(order: TableSortOrder): 'ascend' | 'descend' {
  return order === 'asc' ? 'ascend' : 'descend'
}

export function fromNaiveSortOrder(order: NaiveSortOrder): TableSortOrder {
  return order === 'descend' ? 'desc' : 'asc'
}

export function applySortableHeaders<TRow>(
  columns: DataTableColumns<TRow>,
  options: {
    sortKey: string
    sortOrder: TableSortOrder
    isSortable: (key: string) => boolean
    compare?: (key: string) => (a: TRow, b: TRow) => number
  }
): DataTableColumns<TRow> {
  return columns.map((col) => {
    if (
      col.type === 'selection' ||
      col.type === 'expand' ||
      col.key === undefined ||
      !options.isSortable(String(col.key))
    ) {
      return col
    }

    const key = String(col.key)
    const compare = options.compare?.(key)
    return {
      ...col,
      sorter: compare ?? 'default',
      sortOrder:
        options.sortKey === key ? toNaiveSortOrder(options.sortOrder) : false,
      customNextSortOrder: toggleAscDescOnly
    }
  })
}

export function handleTableSorterUpdate(
  sorter: TableSortState | TableSortState[] | null,
  sortKey: Ref<string>,
  sortOrder: Ref<TableSortOrder>,
  fallbackKey: string
): void {
  const state = Array.isArray(sorter)
    ? sorter[sorter.length - 1]
    : sorter
  if (!state?.order) {
    sortKey.value = fallbackKey
    sortOrder.value = 'asc'
    return
  }
  sortKey.value = String(state.columnKey)
  sortOrder.value = fromNaiveSortOrder(state.order)
}

export function sortRows<TRow>(
  rows: TRow[],
  sortKey: string,
  sortOrder: TableSortOrder,
  compare: (a: TRow, b: TRow, key: string) => number
): TRow[] {
  const list = [...rows]
  const sign = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => compare(a, b, sortKey) * sign)
  return list
}
