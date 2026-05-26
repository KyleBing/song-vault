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

const props = defineProps<{
  result: MusicScanResult
  decodeSourceDirs: string[]
}>()

const activeTab = ref('encrypted')

const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 110)

const stats = computed(() => props.result.stats)

/** 相对解码源根目录的显示路径 */
function shortPath(p: string): string {
  return relativeToRoots(p, props.decodeSourceDirs)
}

/** 表格单元格：短路径展示，悬停显示完整路径 */
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

/** 同级 LRC 列：有/无标签，有则悬停显示路径 */
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

const encryptedColumns = computed<DataTableColumns<EncryptedMusicItem>>(() => [
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
          { type: platformTagType[row.platform], size: 'small', round: true },
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
])

const plainMp3Columns = computed<DataTableColumns<PlainMp3Item>>(() => [
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
])

const encryptedRows = computed(() => props.result.encrypted)
const plainMp3Rows = computed(() => props.result.plainMp3)
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
