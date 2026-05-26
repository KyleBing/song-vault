import { defineStore } from 'pinia'

/** 窗口可视区域尺寸，供表格 maxHeight 等布局计算 */
export interface WindowInsets {
  windowHeight: number
  windowWidth: number
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    insets: {
      windowHeight:
        typeof window !== 'undefined' ? window.innerHeight : 800,
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1200
    } satisfies WindowInsets
  }),
  actions: {
    /** 读取 window.innerHeight/innerWidth 更新布局尺寸 */
    updateInsets(): void {
      this.insets.windowHeight = window.innerHeight
      this.insets.windowWidth = window.innerWidth
    }
  }
})
