import { NTooltip } from 'naive-ui'
import { h, type VNode } from 'vue'
import { openLyricsViewModal } from '@renderer/composables/useLyricsViewModal'
import { tableStatusPill, type TableStatusPillOptions } from '@renderer/utils/tableStatusPill'

export interface LrcPresenceCellOptions {
  hasLrc: boolean
  /** 同级歌词完整路径；有则「有」标签可点击查看 */
  lrcPath?: string
  /** 悬停「有」时展示的完整路径或说明 */
  tooltipText?: string
  noLabel?: string
  yesLabel?: string
}

function onViewLyricsClick(event: MouseEvent, lrcPath: string): void {
  event.preventDefault()
  event.stopPropagation()
  openLyricsViewModal(lrcPath)
}

/** 本目录歌词有无：与文件管理列表一致的圆角标签样式 */
export function lrcPresenceCell(options: LrcPresenceCellOptions): VNode {
  const noLabel = options.noLabel ?? '没有'
  const yesLabel = options.yesLabel ?? '有'

  if (!options.hasLrc) {
    return tableStatusPill(noLabel, 'default')
  }

  const lrcPath = options.lrcPath?.trim()
  const tip = (options.tooltipText ?? lrcPath)?.trim()
  const pillOptions: TableStatusPillOptions = {}
  if (lrcPath) {
    pillOptions.class = 'sv-pill--clickable'
    pillOptions.onClick = (event) => onViewLyricsClick(event, lrcPath)
  }

  const pill = tableStatusPill(yesLabel, 'success', pillOptions)

  if (!tip) {
    return pill
  }

  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () => pill,
      default: () => (lrcPath ? `点击查看歌词\n${tip}` : tip)
    }
  )
}
