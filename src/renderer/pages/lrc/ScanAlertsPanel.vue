<script setup lang="ts">
import { NAlert, NButton, NIcon, NPopconfirm, useMessage } from 'naive-ui'
import { Trash } from '@vicons/ionicons5'
import { computed, ref, unref } from 'vue'
import type { JobResult } from '@shared/lrcJob'
import type { SourceSelection } from '@shared/sourcePick'
import { useScanAlerts } from '@renderer/composables/useScanAlerts'
import {
  formatElapsedMs,
  formatElapsedMsShort
} from '@renderer/utils/formatDuration'
import { plainStringList } from '@renderer/utils/ipcPayload'

const props = defineProps<{
  result: JobResult | null
  sourceSelection: SourceSelection
  selectedOrphanKeys?: string[]
  selectedOrphanAudioKeys?: string[]
}>()

const emit = defineEmits<{
  deleted: []
}>()

const message = useMessage()
const deletingLrc = ref(false)
const deletingAudio = ref(false)

/** 删除右侧「多余」页中已勾选的无对应音频歌词文件 */
async function deleteOrphans(): Promise<void> {
  const lrcPaths = plainStringList(unref(props.selectedOrphanKeys))
  if (lrcPaths.length === 0) {
    message.warning('请先在右侧「多余」页勾选要删除的歌词')
    return
  }
  deletingLrc.value = true
  try {
    const res = await window.electronAPI.deleteOrphanLrc({ lrcPaths })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个歌词文件`)
    }
    if (res.errors.length > 0) {
      message.error(`${res.errors.length} 个歌词文件删除失败`)
    }
    emit('deleted')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deletingLrc.value = false
  }
}

/** 删除右侧「多余」页中已勾选的重复音频文件 */
async function deleteOrphanAudio(): Promise<void> {
  const audioPaths = plainStringList(unref(props.selectedOrphanAudioKeys))
  if (audioPaths.length === 0) {
    message.warning('请先在右侧「多余」页勾选要删除的音频')
    return
  }
  deletingAudio.value = true
  try {
    const res = await window.electronAPI.deleteOrphanAudio({ audioPaths })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个音频文件`)
    }
    if (res.errors.length > 0) {
      message.error(`${res.errors.length} 个音频文件删除失败`)
    }
    emit('deleted')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deletingAudio.value = false
  }
}

const resultRef = computed(() => props.result)

const {
  stats,
  readyToCopyCount,
  pendingPickCount,
  needPickFirst,
  needCopy,
  noCopyNeeded,
  copyDone,
  showPickHint,
  showOrphanHint,
  showOrphanLrcHint,
  showOrphanAudioHint,
  hasResult
} = useScanAlerts(resultRef, computed(() => props.sourceSelection))

const showPanel = computed(() => hasResult.value)

const runSummaryText = computed(() => {
  const result = props.result
  const meta = result?.meta
  const s = stats.value
  if (!result || !meta || !s) return null

  const timingParts = [
    `扫描 ${formatElapsedMsShort(meta.scanElapsedMs)}`,
    `匹配 ${formatElapsedMsShort(meta.matchElapsedMs)}`
  ]
  if (meta.usedScanCache) {
    timingParts.push('目录缓存')
  }

  const orphanTotal = s.orphanLrc + s.orphanAudio
  const matchParts = [
    `已匹配 ${s.matched}`,
    `待复制 ${s.canCopy}`,
    `缺源 ${s.noLrcSource}`,
    `待选源 ${s.sourceAmbiguous}`
  ]
  if (orphanTotal > 0) {
    matchParts.push(`多余 ${orphanTotal}`)
  }
  if (result.execute && s.copied > 0) {
    matchParts.push(`已复制 ${s.copied}`)
  }

  return {
    timing: `用时 ${formatElapsedMs(meta.elapsedMs)}（${timingParts.join(' · ')}）`,
    scale: `目标 ${meta.targetAudioCount} 首 · ${meta.targetLrcCount} 歌词 · LRC 源 ${meta.lrcSourceCount} 歌词`,
    match: matchParts.join(' · ')
  }
})
</script>

<template>
  <section v-if="showPanel" class="scan-alerts">
    <div v-if="runSummaryText" class="run-summary">
      <p class="run-summary__line run-summary__timing">
        {{ runSummaryText.timing }}
      </p>
      <p class="run-summary__line">
        {{ runSummaryText.scale }}
      </p>
      <p class="run-summary__line run-summary__match">
        {{ runSummaryText.match }}
      </p>
    </div>
    <NAlert
      v-if="needPickFirst"
      type="warning"
      :bordered="false"
      size="small"
      title="请先选择源歌词"
    >
      「待选源」在 LRC 源里有多条同名歌词，请在右侧列表
      <strong>选择源歌词</strong> 下拉框指定；选定源子文件夹后会自动套用其它待选。
      仍有 <strong>{{ pendingPickCount }}</strong> 首待选。
    </NAlert>

    <NAlert
      v-else-if="needCopy"
      type="info"
      :bordered="false"
      size="small"
      title="可复制歌词到目标"
    >
      有 <strong>{{ readyToCopyCount }}</strong> 首可从 LRC 源复制到目标目录。
    </NAlert>

    <NAlert
      v-else-if="noCopyNeeded"
      type="success"
      :bordered="false"
      size="small"
      title="无需复制"
    >
      <template v-if="stats && stats.matched > 0">
        {{ stats.matched }} 首目标目录已有同级歌词，无需再复制。
      </template>
      <template v-else-if="stats && stats.noLrcSource > 0">
        {{ stats.noLrcSource }} 首在 LRC 源中找不到同名歌词。
      </template>
      <template v-else>当前没有待复制的匹配项。</template>
    </NAlert>

    <NAlert
      v-else-if="copyDone"
      type="success"
      :bordered="false"
      size="small"
      title="复制已完成"
    >
      已将 {{ stats?.copied }} 个歌词文件复制到对应音频目录。
    </NAlert>

    <NAlert
      v-if="showPickHint && !needPickFirst"
      type="default"
      :bordered="false"
      size="small"
    >
      多个同名源歌词时，在右侧「待选源」页的下拉框中选择。
    </NAlert>

    <div v-if="showOrphanHint" class="orphan-actions">
      <NPopconfirm v-if="showOrphanLrcHint" @positive-click="deleteOrphans">
        <template #trigger>
          <NButton
            block
            type="error"
            size="small"
            :disabled="(selectedOrphanKeys?.length ?? 0) === 0"
            :loading="deletingLrc"
          >
            <template #icon>
              <NIcon><Trash /></NIcon>
            </template>
            删除选中多余歌词 ({{ selectedOrphanKeys?.length ?? 0 }})
          </NButton>
        </template>
        确定删除选中的 {{ selectedOrphanKeys?.length ?? 0 }} 个歌词文件？不可恢复。
      </NPopconfirm>

      <NPopconfirm v-if="showOrphanAudioHint" @positive-click="deleteOrphanAudio">
        <template #trigger>
          <NButton
            block
            type="error"
            size="small"
            :disabled="(selectedOrphanAudioKeys?.length ?? 0) === 0"
            :loading="deletingAudio"
          >
            <template #icon>
              <NIcon><Trash /></NIcon>
            </template>
            删除选中多余音频 ({{ selectedOrphanAudioKeys?.length ?? 0 }})
          </NButton>
        </template>
        确定删除选中的 {{ selectedOrphanAudioKeys?.length ?? 0 }} 个音频文件？不可恢复。
      </NPopconfirm>

      <p class="orphan-tip">
        在右侧「多余」页勾选要删除的文件。重复副本需在搜索范围内找到同名且大小一致的 abc.* 才会列出。
      </p>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.scan-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;

  :deep(.n-alert) {
    --n-padding: 10px 12px;
  }

  :deep(.n-alert-body__title) {
    font-size: 13px;
  }

  :deep(.n-alert-body__content) {
    font-size: 12px;
    line-height: 1.45;
    opacity: 0.88;
  }

  strong {
    color: $color-primary-light;
  }
}

.run-summary {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.run-summary__line {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.78;
}

.run-summary__timing {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.92;
}

.run-summary__match {
  font-size: 11px;
  opacity: 0.62;
}

.orphan-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.orphan-tip {
  margin: 0;
  font-size: 11px;
  opacity: 0.45;
  line-height: 1.35;
}
</style>
