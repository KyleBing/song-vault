import { defineStore } from 'pinia'
import type {
    CompareLibrarySyncResult,
    ValidateSyncRootsResult
} from '@shared/librarySyncJob'
import { normalizePathKey } from '@shared/pathKeys'
import type { SyncDiffTreeRow } from '@renderer/utils/syncDiffTree'

/** 乐库同步页会话状态：切换导航后保留对比结果，避免每次进入重新扫描 */
export const useLibrarySyncSessionStore = defineStore('librarySyncSession', {
    state: () => ({
        compareResult: null as CompareLibrarySyncResult | null,
        /** 对比时使用的路径过滤规则快照（JSON） */
        pathFilterRulesKey: '',
        /** 对比时设置里的左右目录（用于恢复缓存，与校验后的绝对路径解耦） */
        leftInput: '',
        rightInput: '',
        /** 上次对比时的目录校验结果，进入页面时可立即展示 */
        dirsValidation: null as ValidateSyncRootsResult | null,
        /** 已构建的差异树，避免再次进入时重复 buildSyncDiffTree */
        cachedTree: [] as SyncDiffTreeRow[],
        expandedFolderKeys: [] as string[]
    }),
    actions: {
        matchesSession(
            left: string,
            right: string,
            pathFilterRulesKey: string
        ): boolean {
            const cached = this.compareResult
            if (!cached) return false
            if (
                this.pathFilterRulesKey !== pathFilterRulesKey &&
                this.pathFilterRulesKey !== ''
            ) {
                return false
            }
            const leftKey = normalizePathKey(left)
            const rightKey = normalizePathKey(right)
            if (this.leftInput && this.rightInput) {
                return (
                    normalizePathKey(this.leftInput) === leftKey &&
                    normalizePathKey(this.rightInput) === rightKey
                )
            }
            return (
                normalizePathKey(cached.leftRoot) === leftKey &&
                normalizePathKey(cached.rightRoot) === rightKey
            )
        },
        setCompareSnapshot(
            result: CompareLibrarySyncResult,
            pathFilterRulesKey: string,
            leftInput: string,
            rightInput: string,
            dirsValidation: ValidateSyncRootsResult | null,
            cachedTree: SyncDiffTreeRow[],
            expandedFolderKeys: string[]
        ): void {
            this.compareResult = result
            this.pathFilterRulesKey = pathFilterRulesKey
            this.leftInput = leftInput.trim()
            this.rightInput = rightInput.trim()
            if (dirsValidation) {
                this.dirsValidation = dirsValidation
            }
            this.cachedTree = cachedTree
            this.expandedFolderKeys = expandedFolderKeys
        },
        setDirsValidation(dirsValidation: ValidateSyncRootsResult | null): void {
            this.dirsValidation = dirsValidation
        },
        clearCompareResult(): void {
            this.compareResult = null
            this.pathFilterRulesKey = ''
            this.leftInput = ''
            this.rightInput = ''
            this.dirsValidation = null
            this.cachedTree = []
            this.expandedFolderKeys = []
        }
    }
})
