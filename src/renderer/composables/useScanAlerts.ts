import { computed, type Ref } from 'vue'
import type { JobResult } from '@shared/lrcJob'
import {
  countPendingSourcePick,
  countReadyToCopy,
  type SourceSelection
} from '@shared/sourcePick'

/**
 * 根据预览/执行结果推导侧边栏扫描提示的展示状态。
 * @param result 当前任务结果（可为 null）
 * @param sourceSelection 用户对多源歌词的选择状态
 */
export function useScanAlerts(
  result: Ref<JobResult | null>,
  sourceSelection: Ref<SourceSelection>
) {
  const stats = computed(() => result.value?.stats)
  const isPreview = computed(() => result.value != null && !result.value.execute)

  const readyToCopyCount = computed(() => {
    if (!result.value) return 0
    return countReadyToCopy(result.value.audioItems, sourceSelection.value)
  })

  const pendingPickCount = computed(() => {
    if (!result.value) return 0
    return countPendingSourcePick(
      result.value.audioItems,
      sourceSelection.value
    )
  })

  const hasResult = computed(
    () => result.value !== null && !result.value.empty
  )

  const needPickFirst = computed(
    () => isPreview.value && pendingPickCount.value > 0
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

  const copyDone = computed(
    () =>
      !isPreview.value && (stats.value?.copied ?? 0) > 0
  )

  const showPickHint = computed(
    () =>
      hasResult.value &&
      (result.value?.audioItems.some((r) => r.status === 'source_ambiguous') ??
        false)
  )

  const showOrphanHint = computed(
    () =>
      hasResult.value &&
      ((stats.value?.orphanLrc ?? 0) > 0 || (stats.value?.orphanAudio ?? 0) > 0)
  )

  const showOrphanLrcHint = computed(
    () => hasResult.value && (stats.value?.orphanLrc ?? 0) > 0
  )

  const showOrphanAudioHint = computed(
    () => hasResult.value && (stats.value?.orphanAudio ?? 0) > 0
  )

  return {
    stats,
    isPreview,
    hasResult,
    readyToCopyCount,
    pendingPickCount,
    needPickFirst,
    needCopy,
    noCopyNeeded,
    copyDone,
    showPickHint,
    showOrphanHint,
    showOrphanLrcHint,
    showOrphanAudioHint
  }
}
