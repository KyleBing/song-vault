<script setup lang="ts">
import {
  NTabPane,
  NTabs,
  type DataTableColumns
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, h, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import { PLATFORM_LABELS } from '@shared/musicFormats'
import type {
  EncryptedMusicItem,
  MusicScanResult,
  PlainMp3Item
} from '@shared/musicScanJob'
import { relativeToRoots } from '@renderer/utils/displayPath'
import { lrcPresenceCell } from '@renderer/utils/lrcPresenceCell'
import {
  applySortableHeaders,
  handleTableSorterUpdate,
  sortRows,
  type TableSortOrder
} from '@renderer/composables/useTableHeaderSort'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import { useAudioPlayRowProps } from '@renderer/composables/useAudioPlayRowProps'
import { audioAwarePathCell } from '@renderer/utils/audioMetaPathCell'
import AudioMetaPanelSection from '@renderer/components/AudioMetaPanelSection.vue'
import VirtualDataTable from '@renderer/components/VirtualDataTable.vue'
import { tableStatusPill } from '@renderer/utils/tableStatusPill'

const props = defineProps<{
  result: MusicScanResult
  decodeSourceDirs: string[]
}>()

const activeTab = ref('encrypted')
const encryptedSortKey = ref('filePath')
const encryptedSortOrder = ref<TableSortOrder>('asc')
const plainSortKey = ref('filePath')
const plainSortOrder = ref<TableSortOrder>('asc')

const {
  selectedKeys: encryptedSelectedKeys,
  clearSelection: clearEncryptedSelection,
  onUpdateCheckedRowKeys: onEncryptedCheckedRowKeysUpdate,
  onTableMouseDown: onEncryptedTableMouseDown,
  rowProps: encryptedRowPropsFn
} = useShiftRowSelection((row) => (row as EncryptedMusicItem).filePath)

const {
  selectedKeys: plainSelectedKeys,
  clearSelection: clearPlainSelection,
  onUpdateCheckedRowKeys: onPlainCheckedRowKeysUpdate,
  onTableMouseDown: onPlainTableMouseDown,
  rowProps: plainRowPropsFn
} = useShiftRowSelection((row) => (row as PlainMp3Item).filePath)

const encryptedTableRowPropsWithPlay = useAudioPlayRowProps(
  encryptedRowPropsFn,
  (row) => (row as EncryptedMusicItem).filePath
)

const plainTableRowPropsWithPlay = useAudioPlayRowProps(
  plainRowPropsFn,
  (row) => (row as PlainMp3Item).filePath
)

watch(activeTab, () => {
  clearEncryptedSelection()
  clearPlainSelection()
})

const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 426)

const metaPanelFilePath = computed(() => {
  if (activeTab.value === 'encrypted') {
    return encryptedSelectedKeys.value[0] ?? null
  }
  if (activeTab.value === 'plainMp3') {
    return plainSelectedKeys.value[0] ?? null
  }
  return null
})

const stats = computed(() => props.result.stats)

function shortPath(p: string): string {
  return relativeToRoots(p, props.decodeSourceDirs)
}

function pathCell(full: string, short: string) {
  return audioAwarePathCell(full, short)
}

function lrcCell(row: { hasLrc: boolean; lrcPath?: string }) {
  return lrcPresenceCell({
    hasLrc: row.hasLrc,
    tooltipText: row.lrcPath,
    noLabel: '无'
  })
}

const platformTagType: Record<
  EncryptedMusicItem['platform'],
  'info' | 'warning'
> = {
  netease: 'warning',
  qq: 'info'
}

function compareEncrypted(
  a: EncryptedMusicItem,
  b: EncryptedMusicItem,
  key: string
): number {
  switch (key) {
    case 'platform':
      return a.platform.localeCompare(b.platform)
    case 'ext':
      return a.ext.localeCompare(b.ext, undefined, { sensitivity: 'base' })
    case 'hasLrc':
      return Number(a.hasLrc) - Number(b.hasLrc)
    default: {
      const aName = a.filePath.split(/[/\\]/).pop() ?? a.filePath
      const bName = b.filePath.split(/[/\\]/).pop() ?? b.filePath
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
    }
  }
}

function comparePlainMp3(a: PlainMp3Item, b: PlainMp3Item, key: string): number {
  if (key === 'hasLrc') {
    return Number(a.hasLrc) - Number(b.hasLrc)
  }
  const aName = a.filePath.split(/[/\\]/).pop() ?? a.filePath
  const bName = b.filePath.split(/[/\\]/).pop() ?? b.filePath
  return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
}

function onEncryptedSorterUpdate(
  sorter: Parameters<typeof handleTableSorterUpdate>[0]
): void {
  handleTableSorterUpdate(
    sorter,
    encryptedSortKey,
    encryptedSortOrder,
    'filePath'
  )
}

function onPlainSorterUpdate(
  sorter: Parameters<typeof handleTableSorterUpdate>[0]
): void {
  handleTableSorterUpdate(sorter, plainSortKey, plainSortOrder, 'filePath')
}

const encryptedColumns = computed<DataTableColumns<EncryptedMusicItem>>(() =>
  applySortableHeaders(
    [
      { type: 'selection' },
      {
        title: '文件',
        key: 'filePath',
        minWidth: 200,
        ellipsis: { tooltip: false },
        render(row) {
          return pathCell(row.filePath, shortPath(row.filePath))
        }
      },
      {
        title: '平台',
        key: 'platform',
        width: 96,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [
            tableStatusPill(
              PLATFORM_LABELS[row.platform],
              platformTagType[row.platform]
            )
          ])
        }
      },
      {
        title: '格式',
        key: 'ext',
        width: 88,
        render(row) {
          return `.${row.ext}`
        }
      },
      {
        title: '同级 LRC',
        key: 'hasLrc',
        width: 88,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [lrcCell(row)])
        }
      }
    ],
    {
      sortKey: encryptedSortKey.value,
      sortOrder: encryptedSortOrder.value,
      isSortable: (key) =>
        key === 'filePath' ||
        key === 'platform' ||
        key === 'ext' ||
        key === 'hasLrc',
      compare: (key) => (a, b) => compareEncrypted(a, b, key)
    }
  )
)

const plainMp3Columns = computed<DataTableColumns<PlainMp3Item>>(() =>
  applySortableHeaders(
    [
      { type: 'selection' },
      {
        title: '文件',
        key: 'filePath',
        minWidth: 240,
        ellipsis: { tooltip: false },
        render(row) {
          return pathCell(row.filePath, shortPath(row.filePath))
        }
      },
      {
        title: '同级 LRC',
        key: 'hasLrc',
        width: 88,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [lrcCell(row)])
        }
      }
    ],
    {
      sortKey: plainSortKey.value,
      sortOrder: plainSortOrder.value,
      isSortable: (key) => key === 'filePath' || key === 'hasLrc',
      compare: (key) => (a, b) => comparePlainMp3(a, b, key)
    }
  )
)

const encryptedRows = computed(() =>
  sortRows(
    props.result.encrypted,
    encryptedSortKey.value,
    encryptedSortOrder.value,
    compareEncrypted
  )
)
const plainMp3Rows = computed(() =>
  sortRows(
    props.result.plainMp3,
    plainSortKey.value,
    plainSortOrder.value,
    comparePlainMp3
  )
)

const orderedEncryptedKeys = computed(() =>
  encryptedRows.value.map((row) => row.filePath)
)
const orderedPlainKeys = computed(() =>
  plainMp3Rows.value.map((row) => row.filePath)
)

function onEncryptedCheckedRowKeys(
  keys: Array<string | number>,
  _rows: object[],
  meta: {
    row: object | undefined
    action: 'check' | 'uncheck' | 'checkAll' | 'uncheckAll'
  }
): void {
  onEncryptedCheckedRowKeysUpdate(keys.map(String), orderedEncryptedKeys, meta)
}

function onPlainCheckedRowKeys(
  keys: Array<string | number>,
  _rows: object[],
  meta: {
    row: object | undefined
    action: 'check' | 'uncheck' | 'checkAll' | 'uncheckAll'
  }
): void {
  onPlainCheckedRowKeysUpdate(keys.map(String), orderedPlainKeys, meta)
}

function encryptedRowKey(row: EncryptedMusicItem): string {
  return row.filePath
}

function plainRowKey(row: PlainMp3Item): string {
  return row.filePath
}

function encryptedTableRowProps(row: EncryptedMusicItem) {
  return encryptedTableRowPropsWithPlay(row, orderedEncryptedKeys)
}

function plainTableRowProps(row: PlainMp3Item) {
  return plainTableRowPropsWithPlay(row, orderedPlainKeys)
}
</script>

<template>
  <div class="decode-results">
    <div class="decode-results-lists">
    <NTabs v-model:value="activeTab" type="line" class="result-tabs">
      <NTabPane
        name="encrypted"
        :tab="`待解码 (${stats.encryptedTotal})`"
      >
        <div class="tab-pane-body">
          <p v-if="stats.encryptedTotal" class="tab-hint">
            网易云 {{ stats.neteaseCount }} · QQ音乐 {{ stats.qqCount }}
          </p>
          <div
            class="tab-table-wrap"
            @mousedown.capture="onEncryptedTableMouseDown"
          >
            <VirtualDataTable
              :columns="encryptedColumns"
              :data="encryptedRows"
              :row-key="encryptedRowKey"
              :checked-row-keys="encryptedSelectedKeys"
              :row-props="encryptedTableRowProps"
              :max-height="maxHeightForTable"
              size="small"
              striped
              @update:checked-row-keys="onEncryptedCheckedRowKeys"
              @update:sorter="onEncryptedSorterUpdate"
            />
          </div>
        </div>
      </NTabPane>

      <NTabPane name="plainMp3" :tab="`明文 MP3 (${stats.plainMp3Total})`">
        <div class="tab-pane-body">
          <p class="tab-hint">无需解码的 MP3 文件</p>
          <div class="tab-table-wrap" @mousedown.capture="onPlainTableMouseDown">
            <VirtualDataTable
              :columns="plainMp3Columns"
              :data="plainMp3Rows"
              :row-key="plainRowKey"
              :checked-row-keys="plainSelectedKeys"
              :row-props="plainTableRowProps"
              :max-height="maxHeightForTable"
              size="small"
              striped
              @update:checked-row-keys="onPlainCheckedRowKeys"
              @update:sorter="onPlainSorterUpdate"
            />
          </div>
        </div>
      </NTabPane>
    </NTabs>
    </div>
    <AudioMetaPanelSection :file-path="metaPanelFilePath" />
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.decode-results {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 0;
  overflow: hidden;
}

.decode-results-lists {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.result-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-tabs-nav) {
    flex-shrink: 0;
  }

  :deep(.n-tab-pane) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.tab-pane-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.tab-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tab-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.5;
}

.path-cell {
  font-family: $font-mono;
}
</style>
