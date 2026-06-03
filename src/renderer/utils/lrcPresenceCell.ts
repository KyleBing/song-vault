import { NTooltip } from 'naive-ui'
import { h, type VNode } from 'vue'
import { tableStatusPill } from '@renderer/utils/tableStatusPill'

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
    return tableStatusPill(noLabel, 'default')
  }

  const tip = options.tooltipText?.trim()
  if (!tip) {
    return tableStatusPill(yesLabel, 'success')
  }

  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () => tableStatusPill(yesLabel, 'success'),
      default: () => tip
    }
  )
}
