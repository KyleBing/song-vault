import { defineStore } from 'pinia'

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
    updateInsets(): void {
      this.insets.windowHeight = window.innerHeight
      this.insets.windowWidth = window.innerWidth
    }
  }
})
