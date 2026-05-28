import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export type CheckedRowAction = 'check' | 'uncheck' | 'checkAll' | 'uncheckAll'

export interface CheckedRowKeysMeta<TRow> {
  row: TRow | undefined
  action: CheckedRowAction
  shiftKey?: boolean
}

/** 表格多选：Shift 连选范围，Ctrl/Cmd 追加/切换 */
export function useShiftRowSelection(getRowKey: (row: unknown) => string) {
  const selectedKeys = ref<string[]>([])
  const anchorKey = ref<string | null>(null)
  const shiftKeyDown = ref(false)

  function trackShift(e: KeyboardEvent): void {
    shiftKeyDown.value = e.shiftKey
  }

  onMounted(() => {
    window.addEventListener('keydown', trackShift)
    window.addEventListener('keyup', trackShift)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', trackShift)
    window.removeEventListener('keyup', trackShift)
  })

  function rangeBetween(orderedKeys: string[], a: string, b: string): string[] {
    const ai = orderedKeys.indexOf(a)
    const bi = orderedKeys.indexOf(b)
    if (ai < 0 || bi < 0) return []
    const lo = Math.min(ai, bi)
    const hi = Math.max(ai, bi)
    return orderedKeys.slice(lo, hi + 1)
  }

  function clearTextSelection(): void {
    window.getSelection()?.removeAllRanges()
  }

  function onTableMouseDown(e: MouseEvent): void {
    if (e.shiftKey) {
      e.preventDefault()
    }
  }

  function clearSelection(): void {
    selectedKeys.value = []
    anchorKey.value = null
  }

  function onUpdateCheckedRowKeys(
    keys: string[],
    orderedKeys: Ref<string[]> | string[],
    meta: CheckedRowKeysMeta<unknown>
  ): void {
    const ordered = Array.isArray(orderedKeys) ? orderedKeys : orderedKeys.value

    if (meta.action === 'checkAll') {
      selectedKeys.value = [...ordered]
      return
    }
    if (meta.action === 'uncheckAll') {
      clearSelection()
      return
    }

    const row = meta.row
    if (!row) {
      selectedKeys.value = keys
      return
    }

    const key = getRowKey(row)
    const shift = meta.shiftKey ?? shiftKeyDown.value

    if (shift && anchorKey.value != null) {
      const range = rangeBetween(ordered, anchorKey.value, key)
      if (range.length) {
        if (meta.action === 'uncheck') {
          const remove = new Set(range)
          selectedKeys.value = selectedKeys.value.filter((k) => !remove.has(k))
        } else {
          selectedKeys.value = [...new Set([...selectedKeys.value, ...range])]
        }
        clearTextSelection()
        return
      }
    }

    anchorKey.value = key
    selectedKeys.value = keys
  }

  function onRowClick(
    row: unknown,
    e: MouseEvent,
    orderedKeys: Ref<string[]> | string[]
  ): void {
    if ((e.target as HTMLElement).closest('.n-checkbox')) return
    e.preventDefault()
    e.stopPropagation()

    const ordered = Array.isArray(orderedKeys) ? orderedKeys : orderedKeys.value
    const key = getRowKey(row)

    if (e.shiftKey && anchorKey.value != null) {
      const range = rangeBetween(ordered, anchorKey.value, key)
      if (!range.length) return
      if (e.ctrlKey || e.metaKey) {
        selectedKeys.value = [...new Set([...selectedKeys.value, ...range])]
      } else {
        selectedKeys.value = range
      }
      clearTextSelection()
      return
    }

    anchorKey.value = key
    if (e.ctrlKey || e.metaKey) {
      const set = new Set(selectedKeys.value)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      selectedKeys.value = [...set]
      return
    }

    selectedKeys.value = [key]
  }

  function rowProps(row: unknown, orderedKeys: Ref<string[]> | string[]) {
    return {
      style: 'cursor: pointer',
      onMousedown: onTableMouseDown,
      onClick: (e: MouseEvent) => onRowClick(row, e, orderedKeys)
    }
  }

  return {
    selectedKeys,
    clearSelection,
    onUpdateCheckedRowKeys,
    onTableMouseDown,
    onRowClick,
    rowProps
  }
}
