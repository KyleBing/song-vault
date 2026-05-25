<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NIcon,
  NPopconfirm,
  NStatistic,
  NTabs,
  NTabPane,
  NTag,
  NTooltip,
  useMessage,
  type DataTableColumns
} from 'naive-ui'
import { Trash } from '@vicons/ionicons5'
import { computed, h, ref, watch } from 'vue'
import SourceLrcSelect from './SourceLrcSelect.vue'
import type {
  AudioJobItem,
  AudioItemStatus,
  JobResult,
  OrphanLrcItem
} from '@shared/lrcJob'
import {
  allSourcesInSameDir,
  countPendingSourcePick,
  countReadyToCopy,
  pickSourceLrc,
  type SourceSelection
} from '@shared/sourcePick'
import { dirnameOf } from '@shared/pathLite'
import { joinPath, relativeToRoots } from '@renderer/utils/displayPath'

const props = defineProps<{
  result: JobResult
  searchRoots: string[]
  lrcDirs: string[]
}>()

/** 用户对「多个源歌词」的选择（歌名指定 + 优先源子文件夹） */
const sourceSelection = defineModel<SourceSelection>('sourceSelection', {
  required: true
})

const emit = defineEmits<{
  refresh: []
  executeCopy: []
}>()

const message = useMessage()
const activeTab = ref('all')
const selectedOrphanKeys = ref<string[]>([])
const deleting = ref(false)
const copyingAudioPath = ref<string | null>(null)
/** 源歌词选择变更后递增，强制表格重绘 */
const pickRevision = ref(0)

const audioStatusMeta: Record<
  AudioItemStatus,
  { label: string; type: 'default' | 'info' | 'success' | 'warning' | 'error' }
> = {
  matched: { label: '已匹配', type: 'success' },
  can_copy: { label: '可复制', type: 'info' },
  no_lrc_source: { label: '无源歌词', type: 'default' },
  source_ambiguous: { label: '待选源', type: 'warning' },
  copied: { label: '已复制', type: 'success' },
  copy_error: { label: '复制失败', type: 'error' }
}

const stats = computed(() => props.result.stats)
const isPreview = computed(() => !props.result.execute)

const readyToCopyCount = computed(() =>
  countReadyToCopy(props.result.audioItems, sourceSelection.value)
)

const pendingPickCount = computed(() =>
  countPendingSourcePick(props.result.audioItems, sourceSelection.value)
)

const needCopy = computed(
  () => isPreview.value && readyToCopyCount.value > 0
)
const noCopyNeeded = computed(
  () =>
    isPreview.value &&
    readyToCopyCount.value === 0 &&
    pendingPickCount.value === 0
)
const needPickFirst = computed(
  () => isPreview.value && pendingPickCount.value > 0
)

function resolveSourcePath(row: AudioJobItem): string | undefined {
  return (
    row.selectedSourceLrcPath ??
    (row.sourceLrcPaths?.length
      ? pickSourceLrc(row.songKey, row.sourceLrcPaths, sourceSelection.value) ??
        undefined
      : undefined)
  )
}

function displayStatus(row: AudioJobItem): AudioItemStatus {
  if (row.status === 'source_ambiguous' && resolveSourcePath(row)) {
    return 'can_copy'
  }
  return row.status
}

function onPickSource(row: AudioJobItem, lrcPath: string): void {
  const prev = sourceSelection.value ?? {}
  sourceSelection.value = {
    sourceOverrides: {
      ...(prev.sourceOverrides ?? {}),
      [row.songKey]: lrcPath
    },
    preferredSourceDir: dirnameOf(lrcPath)
  }
  pickRevision.value++

  if (allSourcesInSameDir(row.sourceLrcPaths ?? [])) {
    message.success('已记住该源文件夹，将自动应用于其它同文件夹下的待选歌曲')
  } else {
    message.success('已记住该源子文件夹，将优先用于其它待选歌曲')
  }
}

watch(
  () => props.result,
  () => {
    pickRevision.value++
  }
)

function shortAudio(p: string): string {
  return relativeToRoots(p, props.searchRoots)
}

function shortLrcSource(p: string): string {
  return relativeToRoots(p, props.lrcDirs)
}

function pathCell(full: string, short: string) {
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () =>
        h('span', { class: 'path-cell' }, short),
      default: () => full
    }
  )
}

function plannedDestFor(row: AudioJobItem): string | undefined {
  if (row.plannedDestLrcPath) return row.plannedDestLrcPath
  const src = resolveSourcePath(row)
  if (!src) return undefined
  const base = src.replace(/^.*[/\\]/, '')
  return joinPath(row.destDir, base)
}

function canCopyRow(row: AudioJobItem): boolean {
  const src = resolveSourcePath(row)
  const dest = plannedDestFor(row)
  return (
    (displayStatus(row) === 'can_copy' || row.status === 'copy_error') &&
    !!src &&
    !!dest
  )
}

async function copyOne(row: AudioJobItem): Promise<void> {
  const source = resolveSourcePath(row)
  const dest = plannedDestFor(row)
  if (!source || !dest) return

  copyingAudioPath.value = row.audioPath
  try {
    const res = await window.electronAPI.copyLrcToAudio({
      sourceLrcPath: source,
      destLrcPath: dest
    })
    if (res.ok) {
      message.success(`已复制：${row.audioName}`)
      emit('refresh')
    } else {
      message.error(res.message ?? '复制失败')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    copyingAudioPath.value = null
  }
}

const audioColumns = computed<DataTableColumns<AudioJobItem>>(() => {
  void pickRevision.value
  void sourceSelection.value

  return [
  {
    title: '音频',
    key: 'audioPath',
    ellipsis: { tooltip: false },
    render(row) {
      return pathCell(row.audioPath, shortAudio(row.audioPath))
    }
  },
  {
    title: '本目录歌词',
    key: 'localLrcPath',
    width: 230,
    ellipsis: { tooltip: false },
    render(row) {
      if (!row.hasLocalLrc || !row.localLrcPath) return '无'
      return pathCell(
        row.localLrcPath,
        shortAudio(row.localLrcPath)
      )
    }
  },
  {
    title: '选择源歌词',
    key: 'sourcePick',
    width: 220,
    render(row) {
      const paths = row.sourceLrcPaths
      if (!paths?.length) return '—'

      if (paths.length === 1) {
        return pathCell(paths[0], shortLrcSource(paths[0]))
      }

      return h(SourceLrcSelect, {
        row,
        lrcDirs: props.lrcDirs,
        value: resolveSourcePath(row) ?? null,
        onPick: (v: string) => onPickSource(row, v)
      })
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 88,
    render(row) {
      const meta = audioStatusMeta[displayStatus(row)]
      return h(NTag, { type: meta.type, size: 'small', round: true }, () => meta.label)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 108,
    render(row) {
      if (!canCopyRow(row)) return '—'
      const loading = copyingAudioPath.value === row.audioPath
      const src = resolveSourcePath(row)!
      const dest = plannedDestFor(row)!
      return h(
        NPopconfirm,
        { onPositiveClick: () => copyOne(row) },
        {
          trigger: () =>
            h(
              NButton,
              {
                size: 'tiny',
                type: 'primary',
                loading,
                secondary: true
              },
              { default: () => '复制歌词' }
            ),
          default: () =>
            `将「${shortLrcSource(src)}」复制到「${shortAudio(dest)}」？`
        }
      )
    }
  }
  ]
})

const orphanColumns: DataTableColumns<OrphanLrcItem> = [
  { type: 'selection' },
  {
    title: '歌词文件',
    key: 'lrcPath',
    ellipsis: { tooltip: false },
    render(row) {
      return pathCell(row.lrcPath, shortAudio(row.lrcPath))
    }
  },
  {
    title: '说明',
    key: 'message',
    width: 140
  }
]

const plainAudio = computed(() =>
  props.result.audioItems.map((r) => ({ ...r }))
)

const matchedAudio = computed(() =>
  plainAudio.value.filter((r) => r.status === 'matched' || r.status === 'copied')
)

const canCopyAudio = computed(() =>
  plainAudio.value.filter((r) => displayStatus(r) === 'can_copy')
)

const needLrcAudio = computed(() =>
  plainAudio.value.filter(
    (r) =>
      r.status === 'no_lrc_source' ||
      (r.status === 'source_ambiguous' && !resolveSourcePath(r))
  )
)

const pickSourceAudio = computed(() =>
  plainAudio.value.filter((r) => r.status === 'source_ambiguous')
)

const plainOrphan = computed(() =>
  props.result.orphanLrcItems.map((r) => ({ ...r, key: r.lrcPath }))
)

async function deleteSelectedOrphans(): Promise<void> {
  if (selectedOrphanKeys.value.length === 0) {
    message.warning('请先勾选要删除的多余歌词')
    return
  }
  deleting.value = true
  try {
    const res = await window.electronAPI.deleteOrphanLrc({
      lrcPaths: selectedOrphanKeys.value
    })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个文件`)
    }
    if (res.errors.length > 0) {
      message.error(`${res.errors.length} 个文件删除失败`)
    }
    selectedOrphanKeys.value = []
    emit('refresh')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <NCard class="results-panel" :bordered="false" size="small">
    <template #header>
      <div class="results-header">
        <span>扫描结果</span>
        <span class="scan-meta">
          共 {{ stats.audioTotal }} 首音频 · {{ stats.orphanLrc }} 个多余歌词
        </span>
      </div>
    </template>

    <NAlert
      v-if="needPickFirst"
      type="warning"
      :bordered="false"
      class="copy-alert"
      title="部分歌曲有多个源歌词，请先选择"
    >
      「待选源」表示 LRC 源里有多条同名歌词。请在列表 <strong>选择源歌词</strong> 下拉框中指定使用哪一个；
      选定某个源子文件夹后，会自动应用到其它待选歌曲（优先使用该文件夹下的歌词）。
      仍有 <strong>{{ pendingPickCount }}</strong> 首待选择。
    </NAlert>

    <NAlert
      v-if="needCopy"
      type="info"
      :bordered="false"
      class="copy-alert"
      title="需要将匹配的歌词复制到目标文件夹"
    >
      有 <strong>{{ readyToCopyCount }}</strong> 首音频可从 LRC 源复制歌词到目标文件夹（目标目录中尚未有）。
      请点击上方 <strong>执行复制</strong> 批量处理，或在列表中逐首点击「复制歌词」。
      <template #footer>
        <NButton type="primary" size="small" @click="emit('executeCopy')">
          执行复制
        </NButton>
      </template>
    </NAlert>

    <NAlert
      v-else-if="noCopyNeeded"
      type="success"
      :bordered="false"
      class="copy-alert"
      title="无需复制歌词到目标文件夹"
    >
      <template v-if="stats.matched > 0">
        共 {{ stats.matched }} 首音频在目标文件夹中已有同级同名歌词，无需再从 LRC 源复制。
      </template>
      <template v-else-if="stats.noLrcSource > 0">
        没有可从 LRC 源复制的匹配项；{{ stats.noLrcSource }} 首音频在源中找不到同名歌词。
      </template>
      <template v-else>
        当前扫描结果中没有待复制的匹配项。
      </template>
    </NAlert>

    <NAlert
      v-else-if="!isPreview && stats.copied > 0"
      type="success"
      :bordered="false"
      class="copy-alert"
      title="复制已完成"
    >
      已将 {{ stats.copied }} 个歌词文件复制到对应音频所在目录。
    </NAlert>

    <div class="stats-row">
      <NStatistic
        v-if="isPreview"
        label="可复制"
        :value="stats.canCopy"
        class="stat stat-primary"
      />
      <NStatistic
        v-else
        label="已复制"
        :value="stats.copied"
        class="stat stat-primary"
      />
      <NStatistic label="已匹配" :value="stats.matched" class="stat stat-ok" />
      <NStatistic label="无源歌词" :value="stats.noLrcSource" class="stat" />
      <NStatistic
        v-if="pendingPickCount"
        label="待选源"
        :value="pendingPickCount"
        class="stat"
      />
      <NStatistic
        v-if="stats.copyErrors"
        label="复制失败"
        :value="stats.copyErrors"
        class="stat"
      />
    </div>

    <NTabs v-model:value="activeTab" type="line" animated class="result-tabs">
      <NTabPane name="all" :tab="`全部音频 (${stats.audioTotal})`">
        <NDataTable
          :key="`all-${pickRevision}`"
          :columns="audioColumns"
          :data="plainAudio"
          size="small"
          striped
        />
      </NTabPane>

      <NTabPane name="matched" :tab="`已匹配 (${matchedAudio.length})`">
        <NDataTable
          :key="`matched-${pickRevision}`"
          :columns="audioColumns"
          :data="matchedAudio"
          size="small"
          striped
        />
      </NTabPane>

      <NTabPane name="copy" :tab="`待复制 (${canCopyAudio.length})`">
        <NDataTable
          :key="`copy-${pickRevision}`"
          :columns="audioColumns"
          :data="canCopyAudio"
          size="small"
          striped
        />
      </NTabPane>

      <NTabPane name="pick" :tab="`待选源 (${pickSourceAudio.length})`">
        <p class="tab-hint">
          这些歌曲在 LRC 源中有多个同名歌词，请在下拉框中选择；选定文件夹后会影响其它待选歌曲。
        </p>
        <NDataTable
          :key="`pick-${pickRevision}`"
          :columns="audioColumns"
          :data="pickSourceAudio"
          size="small"
          striped
        />
      </NTabPane>

      <NTabPane name="missing" :tab="`缺歌词 (${needLrcAudio.length})`">
        <NDataTable
          :key="`missing-${pickRevision}`"
          :columns="audioColumns"
          :data="needLrcAudio"
          size="small"
          striped
        />
      </NTabPane>

      <NTabPane name="orphan" :tab="`多余歌词 (${stats.orphanLrc})`">
        <div class="orphan-toolbar">
          <NPopconfirm @positive-click="deleteSelectedOrphans">
            <template #trigger>
              <NButton
                type="error"
                size="small"
                :disabled="selectedOrphanKeys.length === 0"
                :loading="deleting"
              >
                <template #icon>
                  <NIcon><Trash /></NIcon>
                </template>
                删除选中 ({{ selectedOrphanKeys.length }})
              </NButton>
            </template>
            确定删除选中的 {{ selectedOrphanKeys.length }} 个多余歌词文件？此操作不可恢复。
          </NPopconfirm>
          <span class="orphan-hint">同级目录无同名音频</span>
        </div>
        <NDataTable
          v-model:checked-row-keys="selectedOrphanKeys"
          :columns="orphanColumns"
          :data="plainOrphan"
          :row-key="(row: { key: string }) => row.key"
          :max-height="280"
          size="small"
          striped
        />
      </NTabPane>
    </NTabs>
  </NCard>
</template>

<style scoped>
.results-panel {
  margin-top: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
}

.results-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-weight: 600;
}

.scan-meta {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.55;
}

.copy-alert {
  margin-bottom: 14px;
}

.copy-alert strong {
  color: #8bb9ff;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px 28px;
  margin-bottom: 12px;
}

.stat :deep(.n-statistic-value) {
  font-size: 22px;
}

.stat-primary :deep(.n-statistic-value) {
  color: #6ea8fe;
}

.stat-ok :deep(.n-statistic-value) {
  color: #63e6be;
}

.result-tabs {
  margin-top: 4px;
}

.orphan-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.orphan-hint {
  font-size: 12px;
  opacity: 0.5;
}

.path-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, 'Cascadia Code', monospace;
  font-size: 12px;
}
</style>
