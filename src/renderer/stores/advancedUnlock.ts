import { defineStore } from 'pinia'
import type { AppNavigateTarget } from '@shared/appNavigate'
import { verifyTimeUnlockPin } from '@shared/advancedUnlock'
import { persistAdvancedUnlocked } from '@renderer/lib/appConfigClient'

export const useAdvancedUnlockStore = defineStore('advancedUnlock', {
    state: () => ({
        /** 已解锁高级功能（含音乐解码相关界面），写入应用配置后重启仍有效 */
        unlocked: false,
        modalVisible: false,
        pendingView: null as AppNavigateTarget | null
    }),
    actions: {
        /** 从磁盘配置恢复解锁状态（启动时调用） */
        hydrateFromConfig(unlocked: boolean): void {
            this.unlocked = unlocked
        },
        openModal(pendingView: AppNavigateTarget | null = 'decode'): void {
            this.pendingView = pendingView
            this.modalVisible = true
        },
        closeModal(): void {
            this.modalVisible = false
            this.pendingView = null
        },
        /** 校验通过则解锁并关闭弹窗；返回是否成功 */
        submitPin(pin: string): boolean {
            if (!verifyTimeUnlockPin(pin)) return false
            this.unlocked = true
            this.modalVisible = false
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
