<script setup lang="ts">
import { NAlert, NButton, NIcon, NPopconfirm, useMessage } from 'naive-ui'
import { Trash } from '@vicons/ionicons5'
import { computed, ref } from 'vue'
import type { JobResult } from '@shared/lrcJob'
import type { SourceSelection } from '@shared/sourcePick'
import { useScanAlerts } from '@renderer/composables/useScanAlerts'

const props = defineProps<{
  result: JobResult | null
  sourceSelection: SourceSelection
  selectedOrphanKeys?: string[]
}>()

const emit = defineEmits<{
  deleted: []
}>()

const message = useMessage()
const deleting = ref(false)

async function deleteOrphans(): Promise<void> {
  const keys = props.selectedOrphanKeys ?? []
  if (keys.length === 0) {
    message.warning('请先在右侧「多余」页勾选要删除的歌词')
    return
  }
  deleting.value = true
  try {
    const res = await window.electronAPI.deleteOrphanLrc({ lrcPaths: keys })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个文件`)
    }
    if (res.errors.length > 0) {
      message.error(`${res.errors.length} 个文件删除失败`)
    }
    emit('deleted')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deleting.value = false
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
  hasResult
} = useScanAlerts(resultRef, computed(() => props.sourceSelection))

const showPanel = computed(() => hasResult.value)
</script>

<template>
  <section v-if="showPanel" class="scan-alerts">
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
      点击上方 <strong>执行复制</strong> 批量处理，或在列表中逐首「复制歌词」。
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
      <NPopconfirm @positive-click="deleteOrphans">
        <template #trigger>
          <NButton
            block
            type="error"
            size="small"
            :disabled="(selectedOrphanKeys?.length ?? 0) === 0"
            :loading="deleting"
          >
            <template #icon>
              <NIcon><Trash /></NIcon>
            </template>
            删除选中多余歌词 ({{ selectedOrphanKeys?.length ?? 0 }})
          </NButton>
        </template>
        确定删除选中的 {{ selectedOrphanKeys?.length ?? 0 }} 个文件？不可恢复。
      </NPopconfirm>
      <p class="orphan-tip">在右侧「多余」页勾选要删除的 .lrc</p>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

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
