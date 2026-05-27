<script setup lang="ts">
import {
  NDataTable,
  NTabPane,
  NTabs,
  NTag,
  NTooltip,
  type DataTableColumns
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, h, ref } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import { PLATFORM_LABELS } from '@shared/musicFormats'
import type {
  EncryptedMusicItem,
  MusicScanResult,
  PlainMp3Item
} from '@shared/musicScanJob'
import { relativeToRoots } from '@renderer/utils/displayPath'
import {
  applySortableHeaders,
  handleTableSorterUpdate,
  sortRows,
  type TableSortOrder
} from '@renderer/composables/useTableHeaderSort'

const props = defineProps<{
  result: MusicScanResult
  decodeSourceDirs: string[]
}>()

const activeTab = ref('encrypted')
const encryptedSortKey = ref('filePath')
const encryptedSortOrder = ref<TableSortOrder>('asc')
const plainSortKey = ref('filePath')
const plainSortOrder = ref<TableSortOrder>('asc')

const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 110)

const stats = computed(() => props.result.stats)

function shortPath(p: string): string {
  return relativeToRoots(p, props.decodeSourceDirs)
}

function pathCell(full: string, short: string) {
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () => h('span', { class: 'path-cell' }, short),
      default: () => full
    }
  )
}

function lrcCell(row: { hasLrc: boolean; lrcPath?: string }) {
  if (!row.hasLrc) {
    return h(NTag, { size: 'small', round: true }, () => '无')
  }
  const path = row.lrcPath
  if (!path) {
    return h(NTag, { type: 'success', size: 'small', round: true }, () => '有')
  }
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () =>
        h(NTag, { type: 'success', size: 'small', round: true }, () => '有'),
      default: () => path
    }
  )
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
            h(
              NTag,
              {
                type: platformTagType[row.platform],
                size: 'small',
                round: true
              },
              () => PLATFORM_LABELS[row.platform]
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
</script>

<template>
  <div class="decode-results">
    <NTabs v-model:value="activeTab" type="line" class="result-tabs">
      <NTabPane
        name="encrypted"
        :tab="`待解码 (${stats.encryptedTotal})`"
      >
        <div class="tab-pane-body">
          <p v-if="stats.encryptedTotal" class="tab-hint">
            网易云 {{ stats.neteaseCount }} · QQ音乐 {{ stats.qqCount }}
          </p>
          <NDataTable
            :columns="encryptedColumns"
            :data="encryptedRows"
            :max-height="maxHeightForTable"
            size="small"
            striped
            @update:sorter="onEncryptedSorterUpdate"
          />
        </div>
      </NTabPane>

      <NTabPane name="plainMp3" :tab="`明文 MP3 (${stats.plainMp3Total})`">
        <div class="tab-pane-body">
          <p class="tab-hint">无需解码的 MP3 文件</p>
          <NDataTable
            :columns="plainMp3Columns"
            :data="plainMp3Rows"
            :max-height="maxHeightForTable"
            size="small"
            striped
            @update:sorter="onPlainSorterUpdate"
          />
        </div>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.decode-results {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
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

.tab-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.5;
}

.path-cell {
  font-family: $font-mono;
  font-size: 12px;
}
</style>
