import { h, type VNode } from 'vue'

/** 路径单元格：仅展示短路径，无悬停提示 */
export function audioAwarePathCell(_full: string, short: string): VNode {
  return h('span', { class: 'path-cell' }, short)
}
