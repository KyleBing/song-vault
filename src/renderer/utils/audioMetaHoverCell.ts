import { NTooltip } from 'naive-ui'
import { getActivePinia } from 'pinia'
import { h, type VNode, type VNodeChild } from 'vue'
import AudioMetaHover from '@renderer/components/AudioMetaHover.vue'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'
import {
  createDefaultAudioMetaHoverSettings,
  type AudioMetaHoverSettings
} from '@shared/audioMetaHoverSettings'
import { useAudioMetaHoverSettingsStore } from '@renderer/stores/audioMetaHoverSettings'

function currentHoverSettings(): AudioMetaHoverSettings {
  const pinia = getActivePinia()
  if (!pinia) return createDefaultAudioMetaHoverSettings()
  return useAudioMetaHoverSettingsStore(pinia).settings
}

/** 表格等 render 函数：为音乐文件包裹元数据悬停 */
export function wrapAudioMetaHover(
  filePath: string,
  content: () => VNodeChild,
  options?: { showPath?: boolean }
): VNode {
  return h(
    AudioMetaHover,
    { filePath, showPath: options?.showPath ?? true },
    { default: content }
  )
}

/**
 * 路径单元格：音频文件悬停显示标签；其它文件仅显示完整路径 tooltip。
 */
export function audioAwarePathCell(
  full: string,
  short: string,
  tooltipStyle: Record<string, string> = { maxWidth: '560px' }
): VNode {
  const trigger = () => h('span', { class: 'path-cell' }, short)

  const hover = currentHoverSettings()
  if (hover.enabled && isMusicFilePathForMetaHover(full)) {
    return wrapAudioMetaHover(full, trigger)
  }

  return h(
    NTooltip,
    { placement: 'top-start', style: tooltipStyle },
    {
      trigger,
      default: () => full
    }
  )
}
