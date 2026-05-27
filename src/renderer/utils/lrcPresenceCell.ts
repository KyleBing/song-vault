import { NTag, NTooltip } from 'naive-ui'
import { h, type VNode } from 'vue'

export interface LrcPresenceCellOptions {
  hasLrc: boolean
  /** 悬停「有」时展示的完整路径或说明 */
  tooltipText?: string
  noLabel?: string
  yesLabel?: string
}

/** 本目录歌词有无：与文件管理列表一致的圆角标签样式 */
export function lrcPresenceCell(options: LrcPresenceCellOptions): VNode {
  const noLabel = options.noLabel ?? '没有'
  const yesLabel = options.yesLabel ?? '有'

  if (!options.hasLrc) {
    return h(NTag, { size: 'small', round: true }, () => noLabel)
  }

  const tip = options.tooltipText?.trim()
  if (!tip) {
    return h(NTag, { type: 'success', size: 'small', round: true }, () => yesLabel)
  }

  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () =>
        h(NTag, { type: 'success', size: 'small', round: true }, () => yesLabel),
      default: () => tip
    }
  )
}
