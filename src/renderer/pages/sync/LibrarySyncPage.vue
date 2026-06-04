<script setup lang="ts">
import {
    NButton,
    NCheckbox,
    NIcon,
    NPopconfirm,
    NSpin,
    NTooltip,
    useMessage
} from 'naive-ui'
import {
    ArrowBack,
    ArrowForward,
    Close,
    ContractOutline,
    Folder,
    Refresh,
    Trash
} from '@vicons/ionicons5'
import { computed, nextTick, onActivated, onMounted, ref, shallowRef, watch } from 'vue'
import type { PathFilterRule } from '@shared/appConfig'
import type {
    CompareLibrarySyncResult,
    SyncDiffItem,
    ValidateSyncRootsResult
} from '@shared/librarySyncJob'
import { normalizePathKey } from '@shared/pathKeys'
import { joinUnderRoot } from '@shared/pathLite'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import {
    buildSyncDiffTree,
    collectSyncDiffFileKeysUnderFolder,
    collectSyncDiffFolderKeys,
    flattenSyncDiffFileKeys,
    resolveSyncDiffItemsByKeys,
    type SyncDiffTreeRow
} from '@renderer/utils/syncDiffTree'
import { formatElapsedMs } from '@renderer/utils/formatDuration'
import { useLibrarySyncSessionStore } from '@renderer/stores/librarySyncSession'
import AudioMetaPanel from '@renderer/components/AudioMetaPanel.vue'
import SidebarBatchProgressPanel from '@renderer/components/SidebarBatchProgressPanel.vue'
import { metaPanelPathFromSelection } from '@renderer/composables/metaPanelPathFromSelection'
import SelectionPathFooter from '@renderer/components/SelectionPathFooter.vue'
import SyncDiffTreeNode from './SyncDiffTreeNode.vue'

const syncLeftDir = defineModel<string>('syncLeftDir', { required: true })
const syncLeftAlias = defineModel<string>('syncLeftAlias', { default: '' })
const syncRightDir = defineModel<string>('syncRightDir', { required: true })
const syncRightAlias = defineModel<string>('syncRightAlias', { default: '' })

const props = defineProps<{
    pathFilterRules: PathFilterRule[]
}>()

const emit = defineEmits<{
    openSettings: []
}>()

const message = useMessage()
const syncSession = useLibrarySyncSessionStore()
const loading = ref(false)
const validatingDirs = ref(false)
const syncDirsValidation = ref<ValidateSyncRootsResult | null>(null)
const scanButtonLoading = ref(false)
const batchCopyActiveDirection = ref<'toRight' | 'toLeft' | null>(null)
const deletingSelected = ref(false)
const batchCopying = computed(() => batchCopyActiveDirection.value !== null)
const syncTreeBusy = computed(
    () => batchCopying.value || deletingSelected.value
)

const metaPanelHidden = computed(
    () => copyingKeys.value.size > 0
)

const sidebarBatchProgressActive = computed(
    () => batchCopying.value || deletingSelected.value
)

const batchCopyProgressTitle = computed(() => {
    if (deletingSelected.value) return '正在删除选中项'
    if (batchCopyActiveDirection.value === 'toRight') {
        return '正在复制到右侧'
    }
    if (batchCopyActiveDirection.value === 'toLeft') {
        return '正在复制到左侧'
    }
    return '正在处理'
})
const batchCopyProgress = ref({ done: 0, total: 0 })

interface SyncToolbarResult {
    kind: 'copy' | 'delete'
    ok: number
    fail: number
    total: number
    elapsedMs: number
    direction?: 'toRight' | 'toLeft'
    compareError?: string
}

const batchCopyResult = ref<SyncToolbarResult | null>(null)
const batchCopyTiming = ref({ elapsedMs: 0 })
const compareResult = ref<CompareLibrarySyncResult | null>(null)

const SYNC_COPY_ETA_MIN_SAMPLES = 5

function estimateBatchCopyRemainingMs(
    done: number,
    total: number,
    elapsedMs: number
): number | null {
    if (done < SYNC_COPY_ETA_MIN_SAMPLES || done >= total || total <= 0) {
        return null
    }
    const remaining = total - done
    return (elapsedMs / done) * remaining
}
const copyingKeys = ref<Set<string>>(new Set())
const expandedRowKeys = ref<string[]>([])

const {
    selectedKeys: selectedRowKeys,
    clearSelection,
    onUpdateCheckedRowKeys,
    onTableMouseDown,
    onRowClick
} = useShiftRowSelection((row) => (row as SyncDiffTreeRow).key)

const canCompare = computed(
    () => !!syncLeftDir.value.trim() && !!syncRightDir.value.trim()
)

const syncDirsReady = computed(() => {
    const validation = syncDirsValidation.value
    return !!validation && validation.left.ok && validation.right.ok
})

const syncDirIssues = computed(() => {
    const validation = syncDirsValidation.value
    if (!validation) return []
    const issues: Array<{ label: string; message: string; path: string }> = []
    if (!validation.left.ok) {
        issues.push({
            label: syncLeftLabel.value,
            message: validation.left.error ?? '目录无效',
            path: validation.left.path || syncLeftDir.value.trim()
        })
    }
    if (!validation.right.ok) {
        issues.push({
            label: syncRightLabel.value,
            message: validation.right.error ?? '目录无效',
            path: validation.right.path || syncRightDir.value.trim()
        })
    }
    return issues
})

const syncLeftLabel = computed(
    () => (syncLeftAlias.value ?? '').trim() || '左侧'
)

const syncRightLabel = computed(
    () => (syncRightAlias.value ?? '').trim() || '右侧'
)

const pathFilterRulesKey = computed(() =>
    JSON.stringify(pathFilterRulesForSave(props.pathFilterRules))
)

const treeData = shallowRef<SyncDiffTreeRow[]>([])

function applyCompareSnapshot(
    result: CompareLibrarySyncResult,
    validation: ValidateSyncRootsResult | null,
    tree?: SyncDiffTreeRow[],
    expanded?: string[]
): void {
    compareResult.value = result
    const builtTree =
        tree ??
        (result.items.length > 0 ? buildSyncDiffTree(result.items) : [])
    treeData.value = builtTree
    expandedRowKeys.value =
        expanded ??
        (builtTree.length > 0 ? collectSyncDiffFolderKeys(builtTree) : [])
    clearSelection()
    syncSession.setCompareSnapshot(
        result,
        pathFilterRulesKey.value,
        syncLeftDir.value.trim(),
        syncRightDir.value.trim(),
        validation,
        builtTree,
        expandedRowKeys.value
    )
}

const orderedFileKeys = computed(() => flattenSyncDiffFileKeys(treeData.value))

const expandedKeySet = computed(() => new Set(expandedRowKeys.value))

const selectedKeySet = computed(() => new Set(selectedRowKeys.value))

const selectedItems = computed(() => {
    if (!compareResult.value) return []
    return resolveSyncDiffItemsByKeys(
        compareResult.value.items,
        selectedRowKeys.value
    )
})

function syncDiffItemMetaFilePath(
    item: SyncDiffItem,
    result: CompareLibrarySyncResult
): string | null {
    if (item.left) {
        return joinUnderRoot(result.leftRoot, item.left.relativePath)
    }
    if (item.right) {
        return joinUnderRoot(result.rightRoot, item.right.relativePath)
    }
    return null
}

const metaPanelFilePath = computed((): string | null => {
    const result = compareResult.value
    const key = metaPanelPathFromSelection(selectedRowKeys.value)
    if (!result || !key) return null
    const item = resolveSyncDiffItemsByKeys(result.items, [key])[0]
    if (!item) return null
    return syncDiffItemMetaFilePath(item, result)
})

const batchCopyRightCount = computed(
    () => selectedItems.value.filter((item) => item.left).length
)

const batchCopyLeftCount = computed(
    () => selectedItems.value.filter((item) => item.right).length
)

const allFilesSelected = computed(() => {
    const keys = orderedFileKeys.value
    if (!keys.length) return false
    const selected = selectedKeySet.value
    return keys.every((key) => selected.has(key))
})

const someFilesSelected = computed(() => {
    const keys = orderedFileKeys.value
    if (!keys.length) return false
    const selected = selectedKeySet.value
    const count = keys.filter((key) => selected.has(key)).length
    return count > 0 && count < keys.length
})

function toggleSelectAllFiles(checked: boolean): void {
    onUpdateCheckedRowKeys(
        checked ? [...orderedFileKeys.value] : [],
        orderedFileKeys,
        {
            row: undefined,
            action: checked ? 'checkAll' : 'uncheckAll'
        }
    )
}

const batchCopyProgressPercent = computed(() => {
    const { done, total } = batchCopyProgress.value
    if (!total) return 0
    return Math.round((done / total) * 100)
})

const batchCopyProgressDetailText = computed(() => {
    const { done, total } = batchCopyProgress.value
    if (!batchCopying.value || total === 0) return ''
    const parts: string[] = [`${done} / ${total}`]
    if (done > 0) {
        parts.push(`已用 ${formatElapsedMs(batchCopyTiming.value.elapsedMs)}`)
        const remainingMs = estimateBatchCopyRemainingMs(
            done,
            total,
            batchCopyTiming.value.elapsedMs
        )
        if (remainingMs != null) {
            parts.push(`剩余 ${formatElapsedMs(remainingMs)}`)
        }
    }
    return parts.join(' · ')
})

const batchCopyResultTitle = computed(() => {
    const result = batchCopyResult.value
    if (!result) return ''
    return result.kind === 'delete' ? '删除结果' : '同步结果'
})

const batchCopyResultText = computed(() => {
    const result = batchCopyResult.value
    if (!result) return ''
    const lines: string[] = []
    if (result.kind === 'delete') {
        if (result.fail > 0) {
            lines.push(
                `已处理 ${result.total} 项：删除 ${result.ok} 个文件，失败 ${result.fail}`
            )
        } else {
            lines.push(`已删除 ${result.ok} 个文件`)
        }
    } else {
        const target =
            result.direction === 'toRight'
                ? syncRightLabel.value
                : syncLeftLabel.value
        if (result.fail > 0) {
            lines.push(
                `已向${target}处理 ${result.total} 项：成功 ${result.ok}，失败 ${result.fail}`
            )
        } else {
            lines.push(`已向${target}同步 ${result.ok} 项`)
        }
    }
    if (result.compareError) {
        lines.push(`刷新对比失败：${result.compareError}`)
    }
    lines.push(`用时 ${formatElapsedMs(result.elapsedMs)}`)
    return lines.join('\n')
})

const batchCopyResultTone = computed(() => {
    const result = batchCopyResult.value
    if (!result) return 'success' as const
    if (result.compareError || result.fail > 0) return 'warning' as const
    return 'success' as const
})

function dismissBatchCopyResult(): void {
    batchCopyResult.value = null
}

interface SyncSideStats {
    total: number
    same: number
    extra: number
    missing: number
    modified: number
    moved: number
}

const syncStats = computed(() => {
    const result = compareResult.value
    if (!result) return null

    let leftOnly = 0
    let rightOnly = 0
    let modified = 0
    let moved = 0
    for (const item of result.items) {
        if (item.kind === 'left_only') leftOnly += 1
        else if (item.kind === 'right_only') rightOnly += 1
        else if (item.kind === 'moved') moved += 1
        else modified += 1
    }

    const left: SyncSideStats = {
        total: result.leftFileCount,
        same: result.sameCount,
        extra: leftOnly,
        missing: rightOnly,
        modified,
        moved
    }
    const right: SyncSideStats = {
        total: result.rightFileCount,
        same: result.sameCount,
        extra: rightOnly,
        missing: leftOnly,
        modified,
        moved
    }

    return {
        left,
        right,
        maxTotal: Math.max(left.total, right.total, 1),
        diffCount: result.diffCount
    }
})

function statBarPct(value: number, max: number): string {
    if (max <= 0 || value <= 0) return '0%'
    return `${Math.round((value / max) * 100)}%`
}

function stackFlex(value: number): string {
    return value > 0 ? String(value) : '0'
}

function rowCopyKey(item: SyncDiffItem, direction: 'left' | 'right'): string {
    return `${item.relativePath}:${direction}`
}

function isCopying(item: SyncDiffItem, direction: 'left' | 'right'): boolean {
    return copyingKeys.value.has(rowCopyKey(item, direction))
}

function toggleExpand(key: string): void {
    const idx = expandedRowKeys.value.indexOf(key)
    if (idx >= 0) {
        expandedRowKeys.value = expandedRowKeys.value.filter((k) => k !== key)
        return
    }
    expandedRowKeys.value = [...expandedRowKeys.value, key]
}

function collapseAllFolders(): void {
    expandedRowKeys.value = []
}

const canCollapseAllFolders = computed(() => expandedRowKeys.value.length > 0)

function toggleSelect(key: string, checked: boolean, shiftKey = false): void {
    const nextKeys = checked
        ? [...new Set([...selectedRowKeys.value, key])]
        : selectedRowKeys.value.filter((k) => k !== key)
    onUpdateCheckedRowKeys(nextKeys, orderedFileKeys, {
        row: { key } as SyncDiffTreeRow,
        action: checked ? 'check' : 'uncheck',
        shiftKey
    })
}

function toggleFolderSelect(folder: SyncDiffTreeRow, checked: boolean): void {
    const fileKeys = collectSyncDiffFileKeysUnderFolder(folder)
    if (!fileKeys.length) return
    const fileKeySet = new Set(fileKeys)
    selectedRowKeys.value = checked
        ? [...new Set([...selectedRowKeys.value, ...fileKeys])]
        : selectedRowKeys.value.filter((k) => !fileKeySet.has(k))
}

function onFileRowClick(key: string, event: MouseEvent): void {
    onRowClick({ key }, event, orderedFileKeys)
}

/** 让 loading 状态先绘制，避免长时间 IPC/建树阻塞前界面无反馈 */
async function flushLoadingPaint(): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
}

async function validateSyncDirs(options?: { background?: boolean }): Promise<ValidateSyncRootsResult> {
    if (!options?.background) {
        validatingDirs.value = true
    }
    try {
        const result = await window.electronAPI.validateSyncRoots(
            syncLeftDir.value.trim(),
            syncRightDir.value.trim()
        )
        syncDirsValidation.value = result
        if (
            syncSession.matchesSession(
                syncLeftDir.value.trim(),
                syncRightDir.value.trim(),
                pathFilterRulesKey.value
            )
        ) {
            syncSession.setDirsValidation(result)
        }
        return result
    } finally {
        if (!options?.background) {
            validatingDirs.value = false
        }
    }
}

async function runCompare(options?: {
    silent?: boolean
    scanLoading?: boolean
}): Promise<void> {
    if (!canCompare.value) return

    const showScanLoading = !!options?.scanLoading
    if (showScanLoading) scanButtonLoading.value = true
    loading.value = true
    await flushLoadingPaint()

    try {
        const validation = await validateSyncDirs({ background: true })
        if (!validation.left.ok || !validation.right.ok) {
            return
        }

        const result = await window.electronAPI.compareLibrarySync({
            leftRoot: syncLeftDir.value.trim(),
            rightRoot: syncRightDir.value.trim(),
            pathFilterRules: pathFilterRulesForSave(props.pathFilterRules)
        })
        await flushLoadingPaint()
        applyCompareSnapshot(result, validation)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!options?.silent) {
            message.error(msg)
        }
        throw err
    } finally {
        loading.value = false
        if (showScanLoading) scanButtonLoading.value = false
    }
}

function tryRestoreCachedCompare(): boolean {
    const left = syncLeftDir.value.trim()
    const right = syncRightDir.value.trim()
    if (!left || !right) return false
    if (
        syncSession.matchesSession(left, right, pathFilterRulesKey.value)
    ) {
        const cached = syncSession.compareResult
        if (!cached) return false
        compareResult.value = cached
        if (syncSession.dirsValidation) {
            syncDirsValidation.value = syncSession.dirsValidation
        }
        if (syncSession.cachedTree.length > 0) {
            treeData.value = syncSession.cachedTree
            expandedRowKeys.value = [...syncSession.expandedFolderKeys]
        } else if (cached.items.length > 0) {
            const builtTree = buildSyncDiffTree(cached.items)
            treeData.value = builtTree
            expandedRowKeys.value = collectSyncDiffFolderKeys(builtTree)
        } else {
            treeData.value = []
            expandedRowKeys.value = []
        }
        return true
    }
    return false
}

/** 首屏渲染前同步恢复缓存，避免先闪「正在检查目录」 */
if (canCompare.value) {
    tryRestoreCachedCompare()
}

async function tryAutoCompareIfNeeded(): Promise<void> {
    if (
        !canCompare.value ||
        loading.value ||
        batchCopying.value ||
        deletingSelected.value ||
        compareResult.value
    ) {
        return
    }
    const validation = syncDirsValidation.value ?? (await validateSyncDirs())
    if (!validation.left.ok || !validation.right.ok) {
        return
    }
    await runCompare()
}

/** 进入页面：有结果则直接展示，无结果也不自动重新扫描 */
function onSyncPageActivated(): void {
    if (!canCompare.value) {
        syncDirsValidation.value = null
        compareResult.value = null
        treeData.value = []
        expandedRowKeys.value = []
        return
    }
    if (compareResult.value || tryRestoreCachedCompare()) {
        void validateSyncDirs({ background: true })
        return
    }
    void validateSyncDirs({ background: true })
}

/** 首次挂载且从未对比过：自动扫描一次 */
async function bootstrapFirstVisitCompare(): Promise<void> {
    if (!canCompare.value) return
    if (compareResult.value || tryRestoreCachedCompare()) {
        void validateSyncDirs({ background: true })
        return
    }
    if (syncSession.compareResult) {
        void validateSyncDirs({ background: true })
        return
    }
    await validateSyncDirs()
    await tryAutoCompareIfNeeded()
}

onMounted(() => {
    void bootstrapFirstVisitCompare()
})

onActivated(() => {
    onSyncPageActivated()
})

watch([syncLeftDir, syncRightDir], (newDirs, oldDirs) => {
    if (
        oldDirs &&
        normalizePathKey(newDirs[0] ?? '') === normalizePathKey(oldDirs[0] ?? '') &&
        normalizePathKey(newDirs[1] ?? '') === normalizePathKey(oldDirs[1] ?? '')
    ) {
        return
    }
    void (async () => {
        if (!canCompare.value) {
            syncDirsValidation.value = null
            syncSession.clearCompareResult()
            compareResult.value = null
            treeData.value = []
            expandedRowKeys.value = []
            return
        }
        if (tryRestoreCachedCompare()) {
            void validateSyncDirs({ background: true })
            return
        }
        syncSession.clearCompareResult()
        compareResult.value = null
        treeData.value = []
        expandedRowKeys.value = []
        await validateSyncDirs()
        await tryAutoCompareIfNeeded()
    })()
})

watch(
    () => pathFilterRulesKey.value,
    (next, prev) => {
        if (prev === undefined || next === prev) return
        if (!compareResult.value && !syncSession.compareResult) return
        syncSession.clearCompareResult()
        compareResult.value = null
        treeData.value = []
        expandedRowKeys.value = []
    }
)

async function copyOne(
    item: SyncDiffItem,
    direction: 'toRight' | 'toLeft'
): Promise<void> {
    const leftRoot = compareResult.value?.leftRoot ?? syncLeftDir.value.trim()
    const rightRoot = compareResult.value?.rightRoot ?? syncRightDir.value.trim()
    const copyDir = direction === 'toRight' ? 'left' : 'right'
    const key = rowCopyKey(item, copyDir)

    if (copyingKeys.value.has(key)) return
    const trackRowLoading = batchCopyActiveDirection.value === null
    if (trackRowLoading) {
        copyingKeys.value = new Set([...copyingKeys.value, key])
    }

    try {
        if (item.kind === 'moved') {
            if (!item.left?.relativePath || !item.right?.relativePath) {
                throw new Error('路径信息不完整')
            }
            if (direction === 'toRight') {
                await window.electronAPI.moveSyncFile({
                    root: rightRoot,
                    fromRelativePath: item.right.relativePath,
                    toRelativePath: item.left.relativePath
                })
            } else {
                await window.electronAPI.moveSyncFile({
                    root: leftRoot,
                    fromRelativePath: item.left.relativePath,
                    toRelativePath: item.right.relativePath
                })
            }
        } else {
            const sourceRoot = direction === 'toRight' ? leftRoot : rightRoot
            const destRoot = direction === 'toRight' ? rightRoot : leftRoot
            const relativePath =
                direction === 'toRight'
                    ? (item.left?.relativePath ?? item.relativePath)
                    : (item.right?.relativePath ?? item.relativePath)
            await window.electronAPI.copySyncFile({
                sourceRoot,
                destRoot,
                relativePath
            })
        }
    } finally {
        if (trackRowLoading) {
            const next = new Set(copyingKeys.value)
            next.delete(key)
            copyingKeys.value = next
        }
    }
}

async function copyItem(
    item: SyncDiffItem,
    direction: 'toRight' | 'toLeft'
): Promise<void> {
    if (batchCopying.value || deletingSelected.value || loading.value) return

    batchCopyResult.value = null
    const operationStartedAt = performance.now()
    let compareError: string | undefined

    try {
        await copyOne(item, direction)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg)
        return
    }

    try {
        await runCompare({ silent: true })
    } catch (err) {
        compareError = err instanceof Error ? err.message : String(err)
    }

    batchCopyResult.value = {
        kind: 'copy',
        ok: 1,
        fail: 0,
        total: 1,
        elapsedMs: performance.now() - operationStartedAt,
        direction,
        compareError
    }
}

async function batchCopy(direction: 'toRight' | 'toLeft'): Promise<void> {
    const items = selectedItems.value.filter((item) =>
        direction === 'toRight' ? item.left : item.right
    )
    if (!items.length || batchCopying.value) return

    batchCopyResult.value = null
    batchCopyActiveDirection.value = direction
    const total = items.length
    batchCopyProgress.value = { done: 0, total }
    batchCopyTiming.value = { elapsedMs: 0 }
    const operationStartedAt = performance.now()
    let ok = 0
    let fail = 0

    try {
        for (const item of items) {
            try {
                await copyOne(item, direction)
                ok += 1
            } catch {
                fail += 1
            }
            batchCopyTiming.value = {
                elapsedMs: performance.now() - operationStartedAt
            }
            batchCopyProgress.value = { done: ok + fail, total }
        }
    } finally {
        batchCopyActiveDirection.value = null
        batchCopyProgress.value = { done: 0, total: 0 }
    }

    let compareError: string | undefined
    try {
        await runCompare({ silent: true })
    } catch (err) {
        compareError = err instanceof Error ? err.message : String(err)
    }

    batchCopyResult.value = {
        kind: 'copy',
        ok,
        fail,
        total,
        elapsedMs: performance.now() - operationStartedAt,
        direction,
        compareError
    }
}

function syncDeleteEntries(items: SyncDiffItem[]) {
    return items.map((item) => ({
        leftRelativePath: item.left?.relativePath,
        rightRelativePath: item.right?.relativePath
    }))
}

async function deleteSelectedSyncFiles(): Promise<void> {
    const items = selectedItems.value
    if (!items.length || deletingSelected.value || batchCopying.value) return

    const leftRoot = compareResult.value?.leftRoot ?? syncLeftDir.value.trim()
    const rightRoot = compareResult.value?.rightRoot ?? syncRightDir.value.trim()

    deletingSelected.value = true
    batchCopyResult.value = null
    const operationStartedAt = performance.now()
    let deleted = 0
    let fail = 0

    try {
        const res = await window.electronAPI.deleteSyncFiles({
            leftRoot,
            rightRoot,
            entries: syncDeleteEntries(items)
        })
        deleted = res.deleted
        fail = res.errors.length
        clearSelection()
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg)
        return
    } finally {
        deletingSelected.value = false
    }

    let compareError: string | undefined
    try {
        await runCompare({ silent: true })
    } catch (err) {
        compareError = err instanceof Error ? err.message : String(err)
    }

    batchCopyResult.value = {
        kind: 'delete',
        ok: deleted,
        fail,
        total: items.length,
        elapsedMs: performance.now() - operationStartedAt,
        compareError
    }
}
</script>

<template>
    <div class="library-sync-page">
        <section v-if="!canCompare" class="library-sync-hint">
            <p>请先在「设置 → 同步设置」中指定左右两个乐库目录。</p>
            <NButton size="small" @click="emit('openSettings')">
                <template #icon>
                    <NIcon><Folder /></NIcon>
                </template>
                打开同步设置
            </NButton>
        </section>

        <section
            v-else-if="validatingDirs && !syncDirsValidation && !compareResult"
            class="library-sync-hint"
        >
            <p>正在检查乐库目录…</p>
        </section>

        <section
            v-else-if="!syncDirsReady && !compareResult"
            class="library-sync-hint library-sync-hint--warning"
        >
            <p>以下乐库目录无法访问，请检查路径或在设置中重新指定：</p>
            <ul class="library-sync-hint__issues">
                <li v-for="issue in syncDirIssues" :key="issue.label">
                    <strong>{{ issue.label }}</strong>：{{ issue.message }}
                    <span class="library-sync-hint__path">{{ issue.path }}</span>
                </li>
            </ul>
            <NButton size="small" @click="emit('openSettings')">打开同步设置</NButton>
        </section>

        <div v-else class="workspace">
            <aside class="sidebar">
                <div
                    v-if="batchCopyResult"
                    class="sync-result-bubble-wrap"
                    role="status"
                >
                    <div
                        class="sync-result-bubble"
                        :class="`sync-result-bubble--${batchCopyResultTone}`"
                    >
                        <div class="sync-result-bubble__head">
                            <span class="sync-result-bubble__title">
                                {{ batchCopyResultTitle }}
                            </span>
                            <NButton
                                quaternary
                                circle
                                size="tiny"
                                class="sync-result-bubble__close"
                                aria-label="关闭"
                                @click="dismissBatchCopyResult"
                            >
                                <template #icon>
                                    <NIcon :size="14"><Close /></NIcon>
                                </template>
                            </NButton>
                        </div>
                        <p class="sync-result-bubble__text">
                            {{ batchCopyResultText }}
                        </p>
                    </div>
                </div>

                <div class="sidebar-scroll">
                    <section v-if="compareResult && syncStats" class="sync-stats-panel">
                        <div class="sync-stats-compare">
                            <div class="sync-stats-compare__head">
                                <div class="sync-stats-compare__side sync-stats-compare__side--left">
                                    <span class="sync-stats-compare__side-label">
                                        {{ syncLeftLabel }}
                                    </span>
                                    <span class="sync-stats-compare__path">
                                        {{ compareResult.leftRoot }}
                                    </span>
                                </div>
                                <span class="sync-stats-compare__vs">⇄</span>
                                <div class="sync-stats-compare__side sync-stats-compare__side--right">
                                    <span class="sync-stats-compare__side-label">
                                        {{ syncRightLabel }}
                                    </span>
                                    <span class="sync-stats-compare__path">
                                        {{ compareResult.rightRoot }}
                                    </span>
                                </div>
                            </div>

                            <div class="sync-stats-total">
                                <div class="sync-stats-total__col sync-stats-total__col--left">
                                    <span class="sync-stats-total__value">
                                        {{ syncStats.left.total }}
                                    </span>
                                    <div class="sync-stats-bar sync-stats-bar--left">
                                        <div
                                            class="sync-stats-bar__fill sync-stats-bar__fill--total"
                                            :style="{
                                                width: statBarPct(
                                                    syncStats.left.total,
                                                    syncStats.maxTotal
                                                )
                                            }"
                                        />
                                    </div>
                                </div>
                                <div class="sync-stats-total__col sync-stats-total__col--right">
                                    <span class="sync-stats-total__value">
                                        {{ syncStats.right.total }}
                                    </span>
                                    <div class="sync-stats-bar sync-stats-bar--right">
                                        <div
                                            class="sync-stats-bar__fill sync-stats-bar__fill--total"
                                            :style="{
                                                width: statBarPct(
                                                    syncStats.right.total,
                                                    syncStats.maxTotal
                                                )
                                            }"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div class="sync-stats-stack-row">
                                <div class="sync-stats-stack sync-stats-stack--left">
                                    <div
                                        v-if="syncStats.left.same > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--same"
                                        :style="{ flex: stackFlex(syncStats.left.same) }"
                                    />
                                    <div
                                        v-if="syncStats.left.extra > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--extra"
                                        :style="{ flex: stackFlex(syncStats.left.extra) }"
                                    />
                                    <div
                                        v-if="syncStats.left.modified > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--diff"
                                        :style="{ flex: stackFlex(syncStats.left.modified) }"
                                    />
                                    <div
                                        v-if="syncStats.left.moved > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--moved"
                                        :style="{ flex: stackFlex(syncStats.left.moved) }"
                                    />
                                </div>
                                <div class="sync-stats-stack sync-stats-stack--right">
                                    <div
                                        v-if="syncStats.right.same > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--same"
                                        :style="{ flex: stackFlex(syncStats.right.same) }"
                                    />
                                    <div
                                        v-if="syncStats.right.extra > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--extra"
                                        :style="{ flex: stackFlex(syncStats.right.extra) }"
                                    />
                                    <div
                                        v-if="syncStats.right.modified > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--diff"
                                        :style="{ flex: stackFlex(syncStats.right.modified) }"
                                    />
                                    <div
                                        v-if="syncStats.right.moved > 0"
                                        class="sync-stats-stack__seg sync-stats-stack__seg--moved"
                                        :style="{ flex: stackFlex(syncStats.right.moved) }"
                                    />
                                </div>
                            </div>

                            <div class="sync-stats-detail">
                                <div class="sync-stats-detail__row">
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--left">
                                        <span class="sync-stats-detail__num">
                                            {{ syncStats.left.same }}
                                        </span>
                                        <div class="sync-stats-bar sync-stats-bar--left sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--same"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.left.same,
                                                        Math.max(
                                                            syncStats.left.same,
                                                            syncStats.right.same,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                    </div>
                                    <span class="sync-stats-detail__label">相同</span>
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--right">
                                        <div class="sync-stats-bar sync-stats-bar--right sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--same"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.right.same,
                                                        Math.max(
                                                            syncStats.left.same,
                                                            syncStats.right.same,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                        <span class="sync-stats-detail__num">
                                            {{ syncStats.right.same }}
                                        </span>
                                    </div>
                                </div>

                                <div class="sync-stats-detail__row">
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--left">
                                        <span class="sync-stats-detail__num sync-stats-detail__num--extra">
                                            {{ syncStats.left.extra }}
                                        </span>
                                        <div class="sync-stats-bar sync-stats-bar--left sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--extra"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.left.extra,
                                                        Math.max(
                                                            syncStats.left.extra,
                                                            syncStats.right.extra,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                    </div>
                                    <span class="sync-stats-detail__label sync-stats-detail__label--extra">
                                        多出
                                    </span>
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--right">
                                        <div class="sync-stats-bar sync-stats-bar--right sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--extra"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.right.extra,
                                                        Math.max(
                                                            syncStats.left.extra,
                                                            syncStats.right.extra,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                        <span class="sync-stats-detail__num sync-stats-detail__num--extra">
                                            {{ syncStats.right.extra }}
                                        </span>
                                    </div>
                                </div>

                                <div class="sync-stats-detail__row">
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--left">
                                        <span class="sync-stats-detail__num sync-stats-detail__num--missing">
                                            {{ syncStats.left.missing }}
                                        </span>
                                        <div class="sync-stats-bar sync-stats-bar--left sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--missing"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.left.missing,
                                                        Math.max(
                                                            syncStats.left.missing,
                                                            syncStats.right.missing,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                    </div>
                                    <span class="sync-stats-detail__label sync-stats-detail__label--missing">
                                        缺失
                                    </span>
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--right">
                                        <div class="sync-stats-bar sync-stats-bar--right sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--missing"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.right.missing,
                                                        Math.max(
                                                            syncStats.left.missing,
                                                            syncStats.right.missing,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                        <span class="sync-stats-detail__num sync-stats-detail__num--missing">
                                            {{ syncStats.right.missing }}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    v-if="syncStats.left.moved > 0 || syncStats.right.moved > 0"
                                    class="sync-stats-detail__row"
                                >
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--left">
                                        <span class="sync-stats-detail__num sync-stats-detail__num--moved">
                                            {{ syncStats.left.moved }}
                                        </span>
                                        <div class="sync-stats-bar sync-stats-bar--left sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--moved"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.left.moved,
                                                        Math.max(
                                                            syncStats.left.moved,
                                                            syncStats.right.moved,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                    </div>
                                    <span class="sync-stats-detail__label sync-stats-detail__label--moved">
                                        已移动
                                    </span>
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--right">
                                        <div class="sync-stats-bar sync-stats-bar--right sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--moved"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.right.moved,
                                                        Math.max(
                                                            syncStats.left.moved,
                                                            syncStats.right.moved,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                        <span class="sync-stats-detail__num sync-stats-detail__num--moved">
                                            {{ syncStats.right.moved }}
                                        </span>
                                    </div>
                                </div>

                                <div class="sync-stats-detail__row">
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--left">
                                        <span class="sync-stats-detail__num sync-stats-detail__num--diff">
                                            {{ syncStats.left.modified }}
                                        </span>
                                        <div class="sync-stats-bar sync-stats-bar--left sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--diff"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.left.modified,
                                                        Math.max(
                                                            syncStats.left.modified,
                                                            syncStats.right.modified,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                    </div>
                                    <span class="sync-stats-detail__label sync-stats-detail__label--diff">
                                        大小不同
                                    </span>
                                    <div class="sync-stats-detail__cell sync-stats-detail__cell--right">
                                        <div class="sync-stats-bar sync-stats-bar--right sync-stats-bar--thin">
                                            <div
                                                class="sync-stats-bar__fill sync-stats-bar__fill--diff"
                                                :style="{
                                                    width: statBarPct(
                                                        syncStats.right.modified,
                                                        Math.max(
                                                            syncStats.left.modified,
                                                            syncStats.right.modified,
                                                            1
                                                        )
                                                    )
                                                }"
                                            />
                                        </div>
                                        <span class="sync-stats-detail__num sync-stats-detail__num--diff">
                                            {{ syncStats.right.modified }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p class="sync-stats-summary">
                                共 {{ syncStats.diffCount }} 处差异待同步
                            </p>
                        </div>
                    </section>

                    <section class="toolbar">
                        <NButton
                            block
                            type="primary"
                            :disabled="batchCopying || deletingSelected || loading || scanButtonLoading"
                            :loading="scanButtonLoading"
                            @click="runCompare({ scanLoading: true })"
                        >
                            <template #icon>
                                <NIcon><Refresh /></NIcon>
                            </template>
                            扫描对比
                        </NButton>
                        <p
                            v-if="compareResult"
                            class="sync-selected-count"
                        >
                            已选 {{ selectedItems.length }} 项
                        </p>
                        <div
                            v-if="compareResult && compareResult.items.length > 0"
                            class="sync-copy-actions"
                        >
                            <NButton
                                v-memo="[batchCopyActiveDirection, batchCopyLeftCount]"
                                secondary
                                :disabled="
                                    batchCopyLeftCount === 0
                                        || batchCopying
                                        || deletingSelected
                                        || loading
                                "
                                :loading="batchCopyActiveDirection === 'toLeft'"
                                @click="batchCopy('toLeft')"
                            >
                                <template #icon>
                                    <NIcon><ArrowBack /></NIcon>
                                </template>
                                {{ syncLeftLabel }}
                                <span v-if="batchCopyLeftCount > 0">({{ batchCopyLeftCount }})</span>
                            </NButton>
                            <NButton
                                v-memo="[batchCopyActiveDirection, batchCopyRightCount]"
                                secondary
                                type="primary"
                                :disabled="
                                    batchCopyRightCount === 0
                                        || batchCopying
                                        || deletingSelected
                                        || loading
                                "
                                :loading="batchCopyActiveDirection === 'toRight'"
                                @click="batchCopy('toRight')"
                            >
                                <template #icon>
                                    <NIcon><ArrowForward /></NIcon>
                                </template>
                                {{ syncRightLabel }}
                                <span v-if="batchCopyRightCount > 0">({{ batchCopyRightCount }})</span>
                            </NButton>
                        </div>
                        <NPopconfirm
                            v-if="compareResult && compareResult.items.length > 0"
                            :disabled="
                                selectedItems.length === 0
                                    || batchCopying
                                    || deletingSelected
                                    || loading
                            "
                            @positive-click="deleteSelectedSyncFiles"
                        >
                            <template #trigger>
                                <NButton
                                    block
                                    type="error"
                                    secondary
                                    :disabled="
                                        selectedItems.length === 0
                                            || batchCopying
                                            || deletingSelected
                                            || loading
                                    "
                                    :loading="deletingSelected"
                                >
                                    <template #icon>
                                        <NIcon><Trash /></NIcon>
                                    </template>
                                    删除选中
                                    <span v-if="selectedItems.length > 0">
                                        ({{ selectedItems.length }})
                                    </span>
                                </NButton>
                            </template>
                            确定删除选中的 {{ selectedItems.length }} 项？
                            将删除左右乐库中对应的音频与同名歌词，不可恢复。
                        </NPopconfirm>
                    </section>
                </div>

                <SidebarBatchProgressPanel
                    v-if="sidebarBatchProgressActive"
                    :title="batchCopyProgressTitle"
                    :percentage="batchCopyProgressPercent"
                    :detail="batchCopying ? batchCopyProgressDetailText : undefined"
                    :indeterminate="deletingSelected"
                />
                <AudioMetaPanel
                    v-else-if="!metaPanelHidden"
                    :file-path="metaPanelFilePath"
                />
            </aside>

            <section class="sync-main-pane">
                <NSpin
                    :show="loading"
                    description="正在扫描对比…"
                    class="sync-main-spin"
                >
                    <div
                        v-if="compareResult && compareResult.items.length === 0"
                        class="library-sync-empty"
                    >
                        <p class="library-sync-empty__title">两侧文件一致</p>
                        <p class="library-sync-empty__desc">文件名与大小均相同，无需同步</p>
                    </div>

                    <div
                        v-else-if="compareResult && compareResult.items.length > 0"
                        class="sync-tree-list"
                    >
                        <div class="sync-tree-list__head">
                            <div class="sync-tree-list__head-actions" @click.stop>
                                <NCheckbox
                                    :checked="allFilesSelected"
                                    :indeterminate="someFilesSelected"
                                    :disabled="
                                        loading
                                            || syncTreeBusy
                                            || orderedFileKeys.length === 0
                                    "
                                    size="small"
                                    @update:checked="toggleSelectAllFiles"
                                />
                                <NTooltip>
                                    <template #trigger>
                                        <NButton
                                            quaternary
                                            circle
                                            size="tiny"
                                            class="sync-tree-list__collapse-btn"
                                            :disabled="
                                                !canCollapseAllFolders
                                                    || loading
                                                    || syncTreeBusy
                                            "
                                            @click="collapseAllFolders"
                                        >
                                            <template #icon>
                                                <NIcon :size="14">
                                                    <ContractOutline />
                                                </NIcon>
                                            </template>
                                        </NButton>
                                    </template>
                                    全折叠
                                </NTooltip>
                            </div>
                            <div class="sync-tree-head">
                                <div class="sync-tree-head__side sync-tree-head__side--left">
                                    <span class="sync-tree-head__label">{{ syncLeftLabel }}</span>
                                    <span class="sync-tree-head__path">{{ syncLeftDir }}</span>
                                </div>
                                <span class="sync-tree-head__center" />
                                <div class="sync-tree-head__side sync-tree-head__side--right">
                                    <span class="sync-tree-head__label">{{ syncRightLabel }}</span>
                                    <span class="sync-tree-head__path">{{ syncRightDir }}</span>
                                </div>
                            </div>
                        </div>
                        <div
                            class="sync-tree-list__body"
                            @mousedown.capture="onTableMouseDown"
                        >
                            <SyncDiffTreeNode
                                :nodes="treeData"
                                :depth="0"
                                :expanded-keys="expandedKeySet"
                                :selected-keys="selectedKeySet"
                                :left-root="compareResult?.leftRoot ?? ''"
                                :right-root="compareResult?.rightRoot ?? ''"
                                :loading="loading"
                                :batch-copying="syncTreeBusy"
                                :is-copying="isCopying"
                                @toggle-expand="toggleExpand"
                                @toggle-select="toggleSelect"
                                @toggle-folder-select="toggleFolderSelect"
                                @row-click="onFileRowClick"
                                @copy-to-right="(item) => copyItem(item, 'toRight')"
                                @copy-to-left="(item) => copyItem(item, 'toLeft')"
                            />
                        </div>
                    </div>

                    <div v-else-if="!loading" class="library-sync-empty">
                        <p class="library-sync-empty__title">等待扫描</p>
                        <p class="library-sync-empty__desc">正在加载或请点击「扫描对比」</p>
                    </div>
                </NSpin>
                <SelectionPathFooter :path="metaPanelFilePath" />
            </section>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.library-sync-page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: $color-bg;
    box-sizing: border-box;
}

.library-sync-hint {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin: 20px 24px;
    padding: 14px 16px;
    border-radius: $radius-panel;
    border: 1px dashed $border-subtle;
    background: $surface-panel;
    font-size: 13px;
    opacity: 0.75;
}

.library-sync-hint--warning {
    border-color: rgba(234, 179, 8, 0.45);
    background: rgba(234, 179, 8, 0.08);
    opacity: 1;
}

.library-sync-hint__issues {
    margin: 0;
    padding-left: 1.2em;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.library-sync-hint__path {
    display: block;
    margin-top: 2px;
    font-family: $font-mono;
    font-size: 11px;
    opacity: 0.65;
    word-break: break-all;
}

.workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
}

.sidebar {
    width: $sidebar-width;
    height: 100%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid $border-sidebar;
    background: $surface-sidebar;
}

.sidebar-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.sync-stats-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.sync-stats-compare {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sync-stats-compare__head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    gap: 6px;
}

.sync-stats-compare__side {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.sync-stats-compare__side--left {
    align-items: flex-end;
    text-align: right;
}

.sync-stats-compare__side--right {
    align-items: flex-start;
    text-align: left;
}

.sync-stats-compare__side-label {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.75;
}

.sync-stats-compare__path {
    font-size: 9px;
    font-family: $font-mono;
    line-height: 1.35;
    opacity: 0.5;
    word-break: break-all;
}

.sync-stats-compare__vs {
    align-self: center;
    font-size: 12px;
    opacity: 0.45;
    line-height: 1;
}

.sync-stats-total {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.sync-stats-total__col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.sync-stats-total__col--left {
    align-items: flex-end;
    text-align: right;
}

.sync-stats-total__col--right {
    align-items: flex-start;
    text-align: left;
}

.sync-stats-total__value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.sync-stats-bar {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--app-surface-raised);
    overflow: hidden;
}

.sync-stats-bar--thin {
    height: 4px;
}

.sync-stats-bar--left {
    display: flex;
    justify-content: flex-end;
}

.sync-stats-bar--right {
    display: flex;
    justify-content: flex-start;
}

.sync-stats-bar__fill {
    height: 100%;
    border-radius: 3px;
    min-width: 2px;
    transition: width 0.25s ease;
}

.sync-stats-bar__fill--total {
    background: linear-gradient(
        90deg,
        rgba(148, 163, 184, 0.35),
        rgba(148, 163, 184, 0.65)
    );
}

.sync-stats-bar__fill--same {
    background: rgba(148, 163, 184, 0.55);
}

.sync-stats-bar__fill--extra {
    background: rgba(34, 197, 94, 0.65);
}

.sync-stats-bar__fill--missing {
    background: rgba(239, 68, 68, 0.65);
}

.sync-stats-bar__fill--diff {
    background: rgba(59, 130, 246, 0.65);
}

.sync-stats-bar__fill--moved {
    background: rgba(168, 85, 247, 0.65);
}

.sync-stats-stack-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.sync-stats-stack {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--app-surface-raised);
}

.sync-stats-stack--left {
    flex-direction: row-reverse;
}

.sync-stats-stack__seg {
    min-width: 2px;
}

.sync-stats-stack__seg--same {
    background: rgba(148, 163, 184, 0.55);
}

.sync-stats-stack__seg--extra {
    background: rgba(34, 197, 94, 0.65);
}

.sync-stats-stack__seg--diff {
    background: rgba(59, 130, 246, 0.65);
}

.sync-stats-stack__seg--moved {
    background: rgba(168, 85, 247, 0.65);
}

.sync-stats-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
    border-top: 1px solid $border-subtle;
}

.sync-stats-detail__row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
}

.sync-stats-detail__cell {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.sync-stats-detail__cell--left {
    justify-content: flex-end;
}

.sync-stats-detail__cell--right {
    justify-content: flex-start;
}

.sync-stats-detail__num {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    min-width: 1.5em;
    flex-shrink: 0;
}

.sync-stats-detail__cell--left .sync-stats-detail__num {
    text-align: right;
}

.sync-stats-detail__cell--right .sync-stats-detail__num {
    text-align: left;
}

.sync-stats-detail__num--extra {
    color: rgb(34, 197, 94);
}

.sync-stats-detail__num--missing {
    color: rgb(239, 68, 68);
}

.sync-stats-detail__num--diff {
    color: rgb(59, 130, 246);
}

.sync-stats-detail__num--moved {
    color: rgb(168, 85, 247);
}

.sync-stats-detail__label {
    font-size: 10px;
    opacity: 0.55;
    white-space: nowrap;
}

.sync-stats-detail__label--extra {
    color: rgb(34, 197, 94);
    opacity: 0.85;
}

.sync-stats-detail__label--missing {
    color: rgb(239, 68, 68);
    opacity: 0.85;
}

.sync-stats-detail__label--diff {
    color: rgb(59, 130, 246);
    opacity: 0.85;
}

.sync-stats-detail__label--moved {
    color: rgb(168, 85, 247);
    opacity: 0.85;
}

.sync-stats-detail__cell .sync-stats-bar {
    flex: 1;
    max-width: 72px;
}

.sync-stats-summary {
    margin: 0;
    font-size: 11px;
    text-align: center;
    opacity: 0.55;
    padding-top: 2px;
}

.toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sync-copy-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;

    :deep(.n-button) {
        width: 100%;
        padding-left: 8px;
        padding-right: 8px;
    }
}

.sync-selected-count {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.55;
}

.sync-result-bubble-wrap {
    flex-shrink: 0;
    padding: 12px 16px;
}

.sync-result-bubble {
    padding: 10px 12px 11px;
    border-radius: 14px;
    border: 1px solid $border-subtle;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.sync-result-bubble--success {
    background: rgba(34, 197, 94, 0.12);
}

.sync-result-bubble--warning {
    background: rgba(234, 179, 8, 0.14);
}

.sync-result-bubble__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
}

.sync-result-bubble__title {
    font-size: 12px;
    font-weight: 600;
}

.sync-result-bubble__close {
    flex-shrink: 0;
    margin: -2px -4px -2px 0;
}

.sync-result-bubble__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-line;
    opacity: 0.88;
}

.sync-main-pane {
    flex: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
}

.sync-main-spin {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;

    :deep(.n-spin-container),
    :deep(.n-spin-content) {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
}

.library-sync-empty {
    flex: 1;
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--app-placeholder-bg);
    border-radius: $radius-panel;
}

.library-sync-empty__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.7;
}

.library-sync-empty__desc {
    margin: 0;
    font-size: 13px;
    opacity: 0.45;
}

.sync-tree-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 12px;
    border: 1px solid $border-subtle;
    border-radius: $radius-panel;
    overflow: hidden;
    background: $surface-panel;
}

.sync-tree-list__head {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    min-height: 36px;
    padding: 4px 0;
    border-bottom: 1px solid $border-subtle;
    background: var(--app-surface-raised);
}

.sync-tree-list__head-actions {
    width: 56px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;

    :deep(.n-checkbox) {
        --n-size: 14px;
    }
}

.sync-tree-list__collapse-btn {
    width: 22px;
    height: 22px;
    min-width: 22px;
    padding: 0;
}

.sync-tree-list__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.sync-tree-head {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
    align-items: center;
    padding: 0 8px;
    box-sizing: border-box;
    font-size: 11px;
}

.sync-tree-head__side {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.sync-tree-head__label {
    font-weight: 600;
    opacity: 0.8;
    line-height: 1.2;
}

.sync-tree-head__path {
    font-weight: 400;
    font-family: $font-mono;
    font-size: 10px;
    line-height: 1.2;
    opacity: 0.55;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sync-tree-head__side--left {
    align-items: flex-end;
    text-align: right;
    padding-right: 8px;
}

.sync-tree-head__side--right {
    align-items: flex-start;
    text-align: left;
    padding-left: 8px;
}
</style>
