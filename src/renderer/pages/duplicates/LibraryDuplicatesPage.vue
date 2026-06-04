<script setup lang="ts">
import {
    NButton,
    NIcon,
    NPopconfirm,
    NSelect,
    NSpin,
    useMessage
} from 'naive-ui'
import { Close, Folder, FolderOpen, Refresh, Trash } from '@vicons/ionicons5'
import { computed, onMounted, ref, watch } from 'vue'
import type { PathFilterRule } from '@shared/appConfig'
import type {
    DuplicateGroup,
    ScanLibraryDuplicatesResult
} from '@shared/libraryDuplicateTypes'
import { duplicateMemberKey } from '@shared/libraryDuplicateTypes'
import {
    buildDuplicateScanSourceGroups,
    hasDuplicateScanSourceOptions
} from '@shared/duplicateScanSources'
import type { SyncRootCheck } from '@shared/librarySyncJob'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import {
    buildDuplicateGroupTree,
    collectDuplicateGroupFolderKeys,
    collectDuplicateGroupKeysUnderFolder,
    flattenDuplicateGroupKeys,
    resolveDuplicateGroupsByKeys,
    type DuplicateGroupTreeRow
} from '@renderer/utils/duplicateGroupTree'
import { formatElapsedMs } from '@renderer/utils/formatDuration'
import DuplicateGroupTreeNode from './DuplicateGroupTreeNode.vue'
import DuplicateGroupCoverCompare from './DuplicateGroupCoverCompare.vue'
import BrowseDirPickerModal from '@renderer/pages/library/BrowseDirPickerModal.vue'
import { useBatchTask } from '@renderer/composables/useBatchTask'
import { syncGlobalBatchProgress } from '@renderer/composables/syncGlobalBatchProgress'

const duplicateScanDir = defineModel<string>('duplicateScanDir', { required: true })

const props = defineProps<{
    pathFilterRules: PathFilterRule[]
    searchRoots: string[]
}>()

const message = useMessage()
const batchTask = useBatchTask()
const loading = ref(false)
const validatingDir = ref(false)
const rootValidation = ref<SyncRootCheck | null>(null)
const scanButtonLoading = ref(false)
const deletingSelected = ref(false)
const scanResult = ref<ScanLibraryDuplicatesResult | null>(null)
const keepKeys = ref<Record<string, string>>({})
const expandedRowKeys = ref<string[]>([])

interface DeleteToolbarResult {
    ok: number
    fail: number
    total: number
    elapsedMs: number
    rescanError?: string
}

const deleteResult = ref<DeleteToolbarResult | null>(null)
const scanDirPickerVisible = ref(false)

const browseRoots = computed(() => [...props.searchRoots])

const {
    selectedKeys: selectedRowKeys,
    clearSelection,
    onUpdateCheckedRowKeys,
    onTableMouseDown,
    onRowClick
} = useShiftRowSelection((row) => (row as DuplicateGroupTreeRow).key)

const canScan = computed(() => !!(duplicateScanDir.value ?? '').trim())

const rootReady = computed(
    () => !!rootValidation.value && rootValidation.value.ok
)

const rootIssue = computed(() => {
    const validation = rootValidation.value
    if (!validation || validation.ok) return null
    return {
        message: validation.error ?? '目录无效',
        path: validation.path || (duplicateScanDir.value ?? '').trim()
    }
})

const sourceGroups = computed(() =>
    buildDuplicateScanSourceGroups({
        searchRoots: props.searchRoots,
        duplicateScanDir: duplicateScanDir.value,
        includeSyncSources: false,
        libraryGroupLabel: '音乐源文件夹'
    })
)

const hasConfiguredSources = computed(() =>
    hasDuplicateScanSourceOptions(sourceGroups.value)
)

const sourceSelectOptions = computed(() =>
    sourceGroups.value.map((group) => ({
        type: 'group' as const,
        label: group.label,
        key: group.key,
        children: group.options.map((option) => ({
            label: option.label,
            value: option.path
        }))
    }))
)

const treeData = computed(() => {
    if (!scanResult.value?.groups.length) return []
    return buildDuplicateGroupTree(scanResult.value.groups)
})

const orderedGroupKeys = computed(() => flattenDuplicateGroupKeys(treeData.value))

const expandedKeySet = computed(() => new Set(expandedRowKeys.value))

const selectedKeySet = computed(() => new Set(selectedRowKeys.value))

const selectedGroups = computed(() => {
    if (!scanResult.value) return []
    return resolveDuplicateGroupsByKeys(
        scanResult.value.groups,
        selectedRowKeys.value
    )
})

const totalGroupCount = computed(() => scanResult.value?.groups.length ?? 0)

const totalExtraCopies = computed(
    () => scanResult.value?.stats.extraCopyCount ?? 0
)

const scanRoot = computed(() =>
    (scanResult.value?.root ?? duplicateScanDir.value ?? '').trim()
)

const deleteCandidateCount = computed(() => {
    let count = 0
    for (const group of selectedGroups.value) {
        const keepKey = keepKeys.value[group.id] ?? group.suggestedKeepKey
        count += group.members.filter(
            (member) => duplicateMemberKey(member.relativePath) !== keepKey
        ).length
    }
    return count
})

const deleteResultTitle = computed(() => '删除结果')

const deleteResultText = computed(() => {
    const result = deleteResult.value
    if (!result) return ''
    const lines: string[] = []
    if (result.fail > 0) {
        lines.push(
            `已处理 ${result.total} 个副本：删除 ${result.ok} 个文件，失败 ${result.fail}`
        )
    } else {
        lines.push(`已删除 ${result.ok} 个重复副本`)
    }
    if (result.rescanError) {
        lines.push(`刷新扫描失败：${result.rescanError}`)
    }
    lines.push(`用时 ${formatElapsedMs(result.elapsedMs)}`)
    return lines.join('\n')
})

const deleteResultTone = computed(() => {
    const result = deleteResult.value
    if (!result) return 'success' as const
    if (result.rescanError || result.fail > 0) return 'warning' as const
    return 'success' as const
})

function dismissDeleteResult(): void {
    deleteResult.value = null
}

const batchProgressTitle = computed(() => {
    if (deletingSelected.value) return '正在删除副本'
    if (loading.value) return '正在扫描重复'
    return '正在处理'
})

syncGlobalBatchProgress(batchTask, {
    active: () => batchTask.active,
    title: () => batchProgressTitle.value,
    indeterminate: true
})

function initKeepKeys(groups: DuplicateGroup[]): void {
    const next: Record<string, string> = {}
    for (const group of groups) {
        next[group.id] = group.suggestedKeepKey
    }
    keepKeys.value = next
}

watch(
    () => scanResult.value?.groups,
    (groups) => {
        clearSelection()
        if (!groups?.length) {
            expandedRowKeys.value = []
            keepKeys.value = {}
            return
        }
        initKeepKeys(groups)
        expandedRowKeys.value = collectDuplicateGroupFolderKeys(
            buildDuplicateGroupTree(groups)
        )
    }
)

function toggleExpand(key: string): void {
    const idx = expandedRowKeys.value.indexOf(key)
    if (idx >= 0) {
        expandedRowKeys.value = expandedRowKeys.value.filter((k) => k !== key)
    } else {
        expandedRowKeys.value = [...expandedRowKeys.value, key]
    }
}

function toggleSelect(key: string, checked: boolean, shiftKey = false): void {
    const nextKeys = checked
        ? [...new Set([...selectedRowKeys.value, key])]
        : selectedRowKeys.value.filter((k) => k !== key)
    onUpdateCheckedRowKeys(nextKeys, orderedGroupKeys, {
        row: { key } as DuplicateGroupTreeRow,
        action: checked ? 'check' : 'uncheck',
        shiftKey
    })
}

function toggleFolderSelect(folder: DuplicateGroupTreeRow, checked: boolean): void {
    const groupKeys = collectDuplicateGroupKeysUnderFolder(folder)
    if (!groupKeys.length) return
    const groupKeySet = new Set(groupKeys)
    selectedRowKeys.value = checked
        ? [...new Set([...selectedRowKeys.value, ...groupKeys])]
        : selectedRowKeys.value.filter((k) => !groupKeySet.has(k))
}

function onGroupRowClick(key: string, event: MouseEvent): void {
    onRowClick({ key }, event, orderedGroupKeys)
}

function updateKeepKey(groupId: string, key: string): void {
    keepKeys.value = { ...keepKeys.value, [groupId]: key }
}

async function validateScanRoot(): Promise<SyncRootCheck> {
    validatingDir.value = true
    try {
        const root = (duplicateScanDir.value ?? '').trim()
        const result = await window.electronAPI.validateSyncRoots(root, root)
        rootValidation.value = result.left
        return result.left
    } finally {
        validatingDir.value = false
    }
}

async function pickScanDir(): Promise<void> {
    if (!props.searchRoots.length) {
        message.warning('请先在「设置 → 路径」中添加音乐源文件夹')
        return
    }
    scanDirPickerVisible.value = true
}

function onScanDirPicked(path: string): void {
    duplicateScanDir.value = path
}

async function runScan(options?: {
    silent?: boolean
    scanLoading?: boolean
}): Promise<void> {
    if (!canScan.value) return

    const validation = await validateScanRoot()
    if (!validation.ok) {
        return
    }

    if (options?.scanLoading) scanButtonLoading.value = true
    loading.value = true
    batchTask.begin()
    try {
        const root = (duplicateScanDir.value ?? '').trim()
        if (!root) {
            throw new Error('未指定扫描目录')
        }
        scanResult.value = await window.electronAPI.scanLibraryDuplicates({
            root,
            pathFilterRules: pathFilterRulesForSave(props.pathFilterRules),
            jobId: batchTask.jobId ?? undefined
        })
    } catch (err) {
        if (batchTask.notifyIfCancelled(err)) return
        const msg = err instanceof Error ? err.message : String(err)
        if (!options?.silent) {
            message.error(msg)
        }
        throw err
    } finally {
        batchTask.end()
        loading.value = false
        if (options?.scanLoading) scanButtonLoading.value = false
    }
}

async function tryAutoScan(): Promise<void> {
    if (!canScan.value || loading.value || deletingSelected.value) {
        return
    }
    const validation = rootValidation.value ?? await validateScanRoot()
    if (!validation.ok) {
        return
    }
    await runScan()
}

onMounted(() => {
    void (async () => {
        if (canScan.value) {
            await validateScanRoot()
        }
        await tryAutoScan()
    })()
})

watch(duplicateScanDir, () => {
    scanResult.value = null
    rootValidation.value = null
    void (async () => {
        if (!canScan.value) {
            return
        }
        await validateScanRoot()
        await tryAutoScan()
    })()
})

function membersToDelete(groups: DuplicateGroup[]): string[] {
    const paths: string[] = []
    for (const group of groups) {
        const keepKey = keepKeys.value[group.id] ?? group.suggestedKeepKey
        for (const member of group.members) {
            const key = duplicateMemberKey(member.relativePath)
            if (key !== keepKey) {
                paths.push(member.relativePath)
            }
        }
    }
    return paths
}

async function deleteSelectedDuplicates(): Promise<void> {
    const groups = selectedGroups.value
    if (!groups.length || deletingSelected.value || loading.value) return

    const relativePaths = membersToDelete(groups)
    if (!relativePaths.length) {
        message.warning('所选组中没有可删除的副本')
        return
    }

    const root = (scanResult.value?.root ?? duplicateScanDir.value ?? '').trim()
    if (!root) {
        message.warning('未指定扫描目录')
        return
    }

    deletingSelected.value = true
    deleteResult.value = null
    const operationStartedAt = performance.now()
    let deleted = 0
    let fail = 0

    batchTask.begin()
    try {
        const res = await window.electronAPI.deleteDuplicateFiles({
            root,
            relativePaths,
            jobId: batchTask.jobId ?? undefined
        })
        deleted = res.deleted
        fail = res.errors.length
        clearSelection()
    } catch (err) {
        if (batchTask.notifyIfCancelled(err)) return
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg)
        return
    } finally {
        batchTask.end()
        deletingSelected.value = false
    }

    let rescanError: string | undefined
    try {
        await runScan({ silent: true })
    } catch (err) {
        rescanError = err instanceof Error ? err.message : String(err)
    }

    deleteResult.value = {
        ok: deleted,
        fail,
        total: relativePaths.length,
        elapsedMs: performance.now() - operationStartedAt,
        rescanError
    }
}
</script>

<template>
    <div class="library-duplicates-page">
        <BrowseDirPickerModal
            v-model:show="scanDirPickerVisible"
            :browse-roots="browseRoots"
            :path-filter-rules="pathFilterRules"
            :initial-dir="duplicateScanDir || null"
            title="选择扫描文件夹"
            positive-text="确定"
            selected-hint-prefix="扫描目录："
            pending-hint="请在音乐源文件夹中选择要扫描的目录"
            empty-roots-description="请先在设置 → 路径 中添加音乐源文件夹"
            :show-create-subdir="false"
            @confirm="onScanDirPicked"
        />

        <section v-if="!canScan" class="library-duplicates-hint">
            <p>
                请从设置中的音乐源文件夹选择扫描目录，或在目录树中指定子文件夹。
            </p>
            <NSelect
                v-if="hasConfiguredSources"
                class="dup-source-select"
                :value="duplicateScanDir || null"
                :options="sourceSelectOptions"
                size="small"
                filterable
                :consistent-menu-width="false"
                placeholder="从音乐源文件夹选择"
                @update:value="
                    (value) => {
                        if (typeof value === 'string') {
                            duplicateScanDir = value
                        }
                    }
                "
            />
            <NButton size="small" @click="pickScanDir">
                <template #icon>
                    <NIcon><Folder /></NIcon>
                </template>
                从音乐源选择…
            </NButton>
        </section>

        <section
            v-else-if="validatingDir && !rootValidation"
            class="library-duplicates-hint"
        >
            <p>正在检查目录…</p>
        </section>

        <section
            v-else-if="!rootReady"
            class="library-duplicates-hint library-duplicates-hint--warning"
        >
            <p>当前目录无法访问，请检查路径或重新选择：</p>
            <p v-if="rootIssue" class="library-duplicates-hint__path">
                {{ rootIssue.message }}
                <span>{{ rootIssue.path }}</span>
            </p>
            <NButton size="small" @click="pickScanDir">重新选择</NButton>
        </section>

        <div v-else class="workspace">
            <aside class="sidebar">
                <div
                    v-if="deleteResult"
                    class="dup-result-bubble-wrap"
                    role="status"
                >
                    <div
                        class="dup-result-bubble"
                        :class="`dup-result-bubble--${deleteResultTone}`"
                    >
                        <div class="dup-result-bubble__head">
                            <span class="dup-result-bubble__title">
                                {{ deleteResultTitle }}
                            </span>
                            <NButton
                                quaternary
                                circle
                                size="tiny"
                                class="dup-result-bubble__close"
                                aria-label="关闭"
                                @click="dismissDeleteResult"
                            >
                                <template #icon>
                                    <NIcon :size="14"><Close /></NIcon>
                                </template>
                            </NButton>
                        </div>
                        <p class="dup-result-bubble__text">
                            {{ deleteResultText }}
                        </p>
                    </div>
                </div>

                <div class="sidebar-scroll">
                    <section class="dup-source-panel">
                        <span class="dup-source-panel__label">扫描源</span>
                        <NSelect
                            v-if="hasConfiguredSources"
                            class="dup-source-select"
                            :value="duplicateScanDir || null"
                            :options="sourceSelectOptions"
                            size="small"
                            filterable
                            :consistent-menu-width="false"
                            placeholder="从音乐源文件夹选择"
                            @update:value="
                                (value) => {
                                    if (typeof value === 'string') {
                                        duplicateScanDir = value
                                    }
                                }
                            "
                        />
                        <p
                            v-else
                            class="dup-source-panel__hint"
                        >
                            请先在设置 → 路径 中添加音乐源文件夹。
                        </p>
                        <NButton block size="small" secondary @click="pickScanDir">
                            <template #icon>
                                <NIcon><FolderOpen /></NIcon>
                            </template>
                            从音乐源选择…
                        </NButton>
                        <p v-if="duplicateScanDir" class="dup-source-panel__path">
                            {{ duplicateScanDir }}
                        </p>
                    </section>

                    <section v-if="scanResult" class="dup-stats-panel">
                        <p class="dup-stats-panel__path">{{ scanResult.root }}</p>
                        <div class="dup-stats-grid">
                            <div class="dup-stats-grid__item">
                                <span class="dup-stats-grid__value">
                                    {{ scanResult.stats.fileCount }}
                                </span>
                                <span class="dup-stats-grid__label">音频文件</span>
                            </div>
                            <div class="dup-stats-grid__item">
                                <span class="dup-stats-grid__value dup-stats-grid__value--dup">
                                    {{ scanResult.stats.groupCount }}
                                </span>
                                <span class="dup-stats-grid__label">重复组</span>
                            </div>
                            <div class="dup-stats-grid__item">
                                <span class="dup-stats-grid__value dup-stats-grid__value--extra">
                                    {{ scanResult.stats.extraCopyCount }}
                                </span>
                                <span class="dup-stats-grid__label">多余副本</span>
                            </div>
                        </div>
                        <p class="dup-stats-summary">
                            共 {{ totalGroupCount }} 组重复 · {{ totalExtraCopies }} 份多余副本
                        </p>
                    </section>

                    <section class="toolbar">
                        <NButton
                            block
                            type="primary"
                            :disabled="deletingSelected"
                            :loading="scanButtonLoading"
                            @click="runScan({ scanLoading: true })"
                        >
                            <template #icon>
                                <NIcon><Refresh /></NIcon>
                            </template>
                            扫描重复
                        </NButton>
                        <p v-if="scanResult" class="dup-selected-count">
                            已选 {{ selectedGroups.length }} 组
                            <template v-if="selectedGroups.length > 0">
                                · 将删 {{ deleteCandidateCount }} 份副本
                            </template>
                        </p>
                        <NButton
                            v-if="scanResult && scanResult.groups.length > 0"
                            block
                            quaternary
                            :disabled="
                                selectedGroups.length === 0
                                    || deletingSelected
                                    || loading
                            "
                            @click="clearSelection"
                        >
                            取消选择
                        </NButton>
                        <NPopconfirm
                            v-if="scanResult && scanResult.groups.length > 0"
                            :disabled="
                                selectedGroups.length === 0
                                    || deleteCandidateCount === 0
                                    || deletingSelected
                                    || loading
                            "
                            @positive-click="deleteSelectedDuplicates"
                        >
                            <template #trigger>
                                <NButton
                                    block
                                    type="error"
                                    secondary
                                    :disabled="
                                        selectedGroups.length === 0
                                            || deleteCandidateCount === 0
                                            || deletingSelected
                                            || loading
                                    "
                                    :loading="deletingSelected"
                                >
                                    <template #icon>
                                        <NIcon><Trash /></NIcon>
                                    </template>
                                    删除副本
                                    <span v-if="deleteCandidateCount > 0">
                                        ({{ deleteCandidateCount }})
                                    </span>
                                </NButton>
                            </template>
                            确定删除选中的 {{ deleteCandidateCount }} 份重复副本？
                            每组将保留你选中的那一份，同名歌词会一并删除，不可恢复。
                        </NPopconfirm>
                    </section>

                    <section class="dup-usage-guide" aria-label="使用说明">
                        <h3 class="dup-usage-guide__title">使用说明</h3>
                        <p class="dup-usage-guide__text">
                            扫描源来自设置 → 路径 中的「你的乐库目录」（音乐源文件夹）：可在下拉框选根目录，或点击「从音乐源选择…」在目录树中指定子文件夹。勾选重复组后，用单选指定要保留的那一份，再点击「删除副本」清理其余副本。
                        </p>
                    </section>
                </div>
            </aside>

            <section class="dup-main-pane">
                <NSpin :show="loading" class="dup-main-spin">
                    <div
                        v-if="scanResult && scanResult.groups.length === 0"
                        class="library-duplicates-empty"
                    >
                        <p class="library-duplicates-empty__title">未发现重复</p>
                        <p class="library-duplicates-empty__desc">
                            该目录内没有同名、编号副本（如 A 与 A(1)）且路径不同的重复音频
                        </p>
                    </div>

                    <div
                        v-else-if="scanResult && scanResult.groups.length > 0"
                        class="dup-tree-list"
                    >
                        <div class="dup-tree-list__head">
                            <div class="dup-tree-list__head-check" />
                            <div class="dup-tree-head">
                                <span class="dup-tree-head__title">重复文件</span>
                                <span class="dup-tree-head__hint">选择要保留的一份</span>
                            </div>
                        </div>
                        <div
                            class="dup-tree-list__body"
                            @mousedown.capture="onTableMouseDown"
                        >
                            <DuplicateGroupTreeNode
                                :nodes="treeData"
                                :depth="0"
                                :expanded-keys="expandedKeySet"
                                :selected-keys="selectedKeySet"
                                :keep-keys="keepKeys"
                                :scan-root="scanRoot"
                                :loading="loading"
                                :deleting="deletingSelected"
                                @toggle-expand="toggleExpand"
                                @toggle-select="toggleSelect"
                                @toggle-folder-select="toggleFolderSelect"
                                @row-click="onGroupRowClick"
                                @update:keep-key="updateKeepKey"
                            />
                        </div>
                    </div>

                    <div v-else-if="!loading" class="library-duplicates-empty">
                        <p class="library-duplicates-empty__title">等待扫描</p>
                        <p class="library-duplicates-empty__desc">
                            正在加载或请点击「扫描重复」
                        </p>
                    </div>
                </NSpin>
            </section>
        </div>
        <DuplicateGroupCoverCompare
            :keep-keys="keepKeys"
            @update:keep-key="updateKeepKey"
        />
    </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.library-duplicates-page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: $color-bg;
    box-sizing: border-box;
}

.library-duplicates-hint {
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

.library-duplicates-hint--warning {
    border-color: rgba(234, 179, 8, 0.45);
    background: rgba(234, 179, 8, 0.08);
    opacity: 1;
}

.library-duplicates-hint__path {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;

    span {
        display: block;
        margin-top: 4px;
        font-family: $font-mono;
        font-size: 11px;
        opacity: 0.65;
        word-break: break-all;
    }
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

.dup-source-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.dup-source-select {
    width: fit-content;
    max-width: 100%;
    min-width: 160px;

    :deep(.n-base-selection) {
        min-width: 0;
    }

    :deep(.n-base-selection-label) {
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.dup-source-panel .dup-source-select {
    width: 100%;
    min-width: 0;

    :deep(.n-base-selection) {
        width: 100%;
    }
}

.dup-source-panel__label {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.dup-source-panel__hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    opacity: 0.55;
}

.dup-source-panel__path {
    margin: 0;
    font-family: $font-mono;
    font-size: 10px;
    line-height: 1.4;
    opacity: 0.5;
    word-break: break-all;
}

.dup-usage-guide {
    flex-shrink: 0;
    padding: 12px 16px 14px;
    border-top: 1px solid $border-sidebar;
    background: $surface-sidebar;
}

.dup-usage-guide__title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.dup-usage-guide__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.5;
}

.dup-stats-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.dup-stats-panel__path {
    margin: 0;
    font-family: $font-mono;
    font-size: 9px;
    line-height: 1.35;
    opacity: 0.5;
    word-break: break-all;
}

.dup-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.dup-stats-grid__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.dup-stats-grid__value {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;

    &--dup {
        color: rgb(168, 85, 247);
    }

    &--extra {
        color: rgb(34, 197, 94);
    }
}

.dup-stats-grid__label {
    font-size: 10px;
    opacity: 0.55;
}

.dup-stats-summary {
    margin: 0;
    font-size: 11px;
    text-align: center;
    opacity: 0.55;
}

.toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.dup-selected-count {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.55;
}

.dup-result-bubble-wrap {
    flex-shrink: 0;
    padding: 12px 16px;
}

.dup-result-bubble {
    padding: 10px 12px 11px;
    border-radius: 14px;
    border: 1px solid $border-subtle;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.dup-result-bubble--success {
    background: rgba(34, 197, 94, 0.12);
}

.dup-result-bubble--warning {
    background: rgba(234, 179, 8, 0.14);
}

.dup-result-bubble__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
}

.dup-result-bubble__title {
    font-size: 12px;
    font-weight: 600;
}

.dup-result-bubble__close {
    flex-shrink: 0;
    margin: -2px -4px -2px 0;
}

.dup-result-bubble__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-line;
    opacity: 0.88;
}

.dup-main-pane {
    flex: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
}

.dup-main-spin {
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

.library-duplicates-empty {
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

.library-duplicates-empty__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.7;
}

.library-duplicates-empty__desc {
    margin: 0;
    font-size: 13px;
    opacity: 0.45;
    text-align: center;
    max-width: 320px;
}

.dup-tree-list {
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

.dup-tree-list__head {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    min-height: 36px;
    padding: 4px 0;
    border-bottom: 1px solid $border-subtle;
    background: var(--app-surface-raised);
}

.dup-tree-list__head-check {
    width: 32px;
    flex-shrink: 0;
}

.dup-tree-list__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.dup-tree-head {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    box-sizing: border-box;
    font-size: 11px;
}

.dup-tree-head__title {
    font-weight: 600;
    opacity: 0.8;
}

.dup-tree-head__hint {
    font-size: 10px;
    opacity: 0.5;
}
</style>
