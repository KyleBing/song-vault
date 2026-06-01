import { defineStore } from 'pinia'
import type { AppNavigateTarget } from '@shared/appNavigate'
import { verifyTimeUnlockPin } from '@shared/advancedUnlock'
import { persistAdvancedUnlocked } from '@renderer/lib/appConfigClient'

export const useAdvancedUnlockStore = defineStore('advancedUnlock', {
    state: () => ({
        /** 已解锁高级功能（含音乐解码相关界面），写入应用配置后重启仍有效 */
        unlocked: false,
        pendingView: null as AppNavigateTarget | null
    }),
    actions: {
        hydrateFromConfig(unlocked: boolean): void {
            this.unlocked = unlocked
        },
        setPendingView(view: AppNavigateTarget | null): void {
            this.pendingView = view
        },
        /** 校验通过则解锁；返回是否成功 */
        submitPin(pin: string): boolean {
            if (!verifyTimeUnlockPin(pin)) return false
            this.unlocked = true
            void persistAdvancedUnlocked().catch((err) => {
                console.error('保存高级功能解锁状态失败', err)
            })
            return true
        },
        consumePendingView(): AppNavigateTarget | null {
            const view = this.pendingView
            this.pendingView = null
            return view
        }
    }
})
