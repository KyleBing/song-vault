<script setup lang="ts">
import {
    NButton,
    NIcon,
    NPopconfirm,
    NSelect,
    NSpin,
    useMessage,
    type DataTableColumns
} from 'naive-ui'
import { CreateOutline, Folder, FolderOpen, Refresh } from '@vicons/ionicons5'
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { PathFilterRule } from '@shared/appConfig'
import type {
    MetaTagMismatchItem,
    MetaTagMismatchReason,
    ScanMetaTagMismatchResult
} from '@shared/metaTagMismatch'
import type { SyncRootCheck } from '@shared/librarySyncJob'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import {
    buildDuplicateScanSourceGroups,
    hasDuplicateScanSourceOptions
} from '@shared/duplicateScanSources'
import { isEditableAudioMetaPath } from '@shared/audioMetaEdit'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import { useLayoutStore } from '@renderer/stores/layout'
import { useAudioPlayRowProps } from '@renderer/composables/useAudioPlayRowProps'
import VirtualDataTable from '@renderer/components/VirtualDataTable.vue'
import AudioMetaEditModal from '@renderer/components/AudioMetaEditModal.vue'
import { formatElapsedMs } from '@renderer/utils/formatDuration'

/** 表格展示行：预计算文案，避免虚拟滚动时重复解析 */
interface MetaTagMismatchDisplayRow extends MetaTagMismatchItem {
    tagArtistDisplay: string
    tagTitleDisplay: string
    tagArtistIsEmpty: boolean
    tagTitleIsEmpty: boolean
    mismatchLabel: string
    editableLabel: string
}

function mismatchLabelFromReasons(reasons: MetaTagMismatchReason[]): string {
    if (reasons.includes('both')) return '艺人 + 曲名'
    if (reasons.includes('artist')) return '艺人'
    return '曲名'
}

function toDisplayRow(row: MetaTagMismatchItem): MetaTagMismatchDisplayRow {
    return {
        ...row,
        tagArtistDisplay: row.tagArtist || '（空）',
        tagTitleDisplay: row.tagTitle || '（空）',
        tagArtistIsEmpty: !row.tagArtist,
        tagTitleIsEmpty: !row.tagTitle,
        mismatchLabel: mismatchLabelFromReasons(row.reasons),
        editableLabel: row.editable ? '可写' : '只读'
    }
}

function renderTagArtistCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        { class: row.tagArtistIsEmpty ? 'mtm-cell-empty' : undefined },
        row.tagArtistDisplay
    )
}

function renderTagTitleCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        { class: row.tagTitleIsEmpty ? 'mtm-cell-empty' : undefined },
        row.tagTitleDisplay
    )
}

function renderMismatchCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        { class: 'mtm-pill mtm-pill--warning' },
        row.mismatchLabel
    )
}

function renderEditableCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        {
            class: row.editable
                ? 'mtm-pill mtm-pill--success'
                : 'mtm-pill mtm-pill--default'
        },
        row.editableLabel
    )
}

/** 列配置保持引用稳定，减轻虚拟列表滚动时的 diff */
const META_MISMATCH_TABLE_COLUMNS: DataTableColumns<MetaTagMismatchDisplayRow> =
    [
        { type: 'selection', fixed: 'left' },
        {
            title: '相对路径',
            key: 'relativePath',
            minWidth: 160,
            ellipsis: { tooltip: false }
        },
        {
            title: '文件名·艺人',
            key: 'fileArtist',
            width: 120,
            ellipsis: { tooltip: false }
        },
        {
            title: '文件名·曲名',
            key: 'fileTitle',
            width: 120,
            ellipsis: { tooltip: false }
        },
        {
            title: '标签·艺人',
            key: 'tagArtistDisplay',
            width: 120,
            ellipsis: { tooltip: false },
            render: renderTagArtistCell
        },
        {
            title: '标签·曲名',
            key: 'tagTitleDisplay',
            width: 120,
            ellipsis: { tooltip: false },
            render: renderTagTitleCell
        },
        {
            title: '不一致',
            key: 'mismatchLabel',
            width: 88,
            render: renderMismatchCell
        },
        {
            title: '写入',
            key: 'editableLabel',
            width: 64,
            render: renderEditableCell
        }
    ]

const metaMismatchScanDir = defineModel<string>('metaMismatchScanDir', {
    required: true
})

const props = defineProps<{
    pathFilterRules: PathFilterRule[]
    searchRoots: string[]
    syncLeftDir: string
    syncLeftAlias: string
    syncRightDir: string
    syncRightAlias: string
}>()

const message = useMessage()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const { getMeta, invalidateMeta } = useAudioMetaCache()

const loading = ref(false)
const validatingDir = ref(false)
const scanButtonLoading = ref(false)
const applyingTags = ref(false)
const rootValidation = ref<SyncRootCheck | null>(null)
const scanResult = ref<ScanMetaTagMismatchResult | null>(null)

const editModalShow = ref(false)
const editFilePath = ref<string | null>(null)
const editMeta = ref<Awaited<ReturnType<typeof getMeta>> | null>(null)

const tableWrapRef = ref<HTMLElement | null>(null)
const tableMaxHeight = ref(320)
let tableResizeObserver: ResizeObserver | null = null

function syncTableMaxHeight(): void {
    const el = tableWrapRef.value
    if (!el) return
    tableMaxHeight.value = Math.max(200, Math.floor(el.clientHeight))
}

function observeTableWrap(el: HTMLElement | null): void {
    tableResizeObserver?.disconnect()
    tableResizeObserver = null
    if (!el) return
    tableResizeObserver = new ResizeObserver(() => syncTableMaxHeight())
    tableResizeObserver.observe(el)
    syncTableMaxHeight()
}

watch(tableWrapRef, (el) => observeTableWrap(el))

watch(
    () => scanResult.value?.items.length,
    () => {
        void nextTick(() => syncTableMaxHeight())
    }
)

watch(
    () => insets.value.windowHeight,
    () => {
        void nextTick(() => syncTableMaxHeight())
    }
)

const canScan = computed(() => !!(metaMismatchScanDir.value ?? '').trim())

const rootReady = computed(
    () => !!rootValidation.value && rootValidation.value.ok
)

const rootIssue = computed(() => {
    const validation = rootValidation.value
    if (!validation || validation.ok) return null
    return {
        message: validation.error ?? '目录无效',
        path: validation.path || (metaMismatchScanDir.value ?? '').trim()
    }
})

const sourceGroups = computed(() =>
    buildDuplicateScanSourceGroups({
        searchRoots: props.searchRoots,
        syncLeftDir: props.syncLeftDir,
        syncLeftAlias: props.syncLeftAlias,
        syncRightDir: props.syncRightDir,
        syncRightAlias: props.syncRightAlias,
        duplicateScanDir: metaMismatchScanDir.value
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

const tableRows = computed(() => scanResult.value?.items ?? [])

const displayRows = computed(() => tableRows.value.map(toDisplayRow))

const rowKeys = computed(() => tableRows.value.map((row) => row.fullPath))

const tableColumns = META_MISMATCH_TABLE_COLUMNS

const rowPropsCache = new Map<string, Record<string, unknown>>()

watch(tableRows, () => rowPropsCache.clear())

const {
    selectedKeys: selectedRowKeys,
    clearSelection,
    onUpdateCheckedRowKeys,
    onTableMouseDown,
    rowProps: shiftRowProps
} = useShiftRowSelection((row) => (row as MetaTagMismatchItem).fullPath)

const tableRowProps = useAudioPlayRowProps(
    shiftRowProps,
    (row) => (row as MetaTagMismatchItem).fullPath
)

function onCheckedRowKeys(
    keys: Array<string | number>,
    _rows: object[],
    meta: {
        row: object | undefined
        action: 'check' | 'uncheck' | 'checkAll' | 'uncheckAll'
    }
): void {
    onUpdateCheckedRowKeys(keys.map(String), rowKeys, meta)
}

const selectedItems = computed(() => {
    const set = new Set(selectedRowKeys.value)
    return tableRows.value.filter((row) => set.has(row.fullPath))
})

const selectedEditableCount = computed(() =>
    selectedItems.value.filter((row) => row.editable).length
)

const applyResult = ref<{
    ok: number
    fail: number
    elapsedMs: number
} | null>(null)

function mismatchRowKey(row: MetaTagMismatchDisplayRow): string {
    return row.fullPath
}

async function validateScanRoot(): Promise<SyncRootCheck> {
    validatingDir.value = true
    try {
        const root = (metaMismatchScanDir.value ?? '').trim()
        const result = await window.electronAPI.validateSyncRoots(root, root)
        rootValidation.value = result.left
        return result.left
    } finally {
        validatingDir.value = false
    }
}

async function pickScanDir(): Promise<void> {
    const picked = await window.electronAPI.pickDirectory()
    if (picked) {
        metaMismatchScanDir.value = picked
    }
}

async function runScan(options?: {
    silent?: boolean
    scanLoading?: boolean
}): Promise<void> {
    if (!canScan.value) return

    const validation = await validateScanRoot()
    if (!validation.ok) return

    if (options?.scanLoading) scanButtonLoading.value = true
    loading.value = true
    try {
        const root = (metaMismatchScanDir.value ?? '').trim()
        scanResult.value = await window.electronAPI.scanMetaTagMismatches({
            root,
            pathFilterRules: pathFilterRulesForSave(props.pathFilterRules)
        })
        clearSelection()
        applyResult.value = null
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!options?.silent) message.error(msg)
        throw err
    } finally {
        loading.value = false
        if (options?.scanLoading) scanButtonLoading.value = false
    }
}

async function tryAutoScan(): Promise<void> {
    if (!canScan.value || loading.value || applyingTags.value) return
    const validation = rootValidation.value ?? (await validateScanRoot())
    if (!validation.ok) return
    await runScan()
}

onMounted(() => {
    void (async () => {
        if (canScan.value) await validateScanRoot()
        await tryAutoScan()
    })()
})

onUnmounted(() => {
    tableResizeObserver?.disconnect()
    tableResizeObserver = null
})

watch(metaMismatchScanDir, () => {
    scanResult.value = null
    rootValidation.value = null
    void (async () => {
        if (!canScan.value) return
        await validateScanRoot()
        await tryAutoScan()
    })()
})

async function openEditModal(filePath: string): Promise<void> {
    editFilePath.value = filePath
    editMeta.value = await getMeta(filePath)
    editModalShow.value = true
}

async function onEditSaved(): Promise<void> {
    if (editFilePath.value) invalidateMeta(editFilePath.value)
    try {
        await runScan({ silent: true })
    } catch {
        /* 扫描失败时保留列表 */
    }
}

async function applyFilenameTagsToItems(
    items: MetaTagMismatchItem[]
): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC）')
        return
    }

    applyingTags.value = true
    applyResult.value = null
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            try {
                const res = await window.electronAPI.writeFilenameTags({
                    filePath: row.fullPath,
                    artist: row.fileArtist,
                    title: row.fileTitle
                })
                if (res.ok) {
                    ok += 1
                    invalidateMeta(row.fullPath)
                } else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
        }
    } finally {
        applyingTags.value = false
    }

    applyResult.value = {
        ok,
        fail,
        elapsedMs: performance.now() - started
    }

    if (ok > 0) {
        message.success(`已写入 ${ok} 个文件的标签`)
    }
    if (fail > 0) {
        const detail = failSamples.length ? `\n${failSamples.join('\n')}` : ''
        message.warning(`${fail} 个文件未能写入${detail}`, { duration: 8000 })
    }

    try {
        await runScan({ silent: true })
    } catch {
        /* ignore */
    }
}

function applyFilenameToSelected(): void {
    void applyFilenameTagsToItems(selectedItems.value)
}

function mismatchTableRowProps(row: MetaTagMismatchDisplayRow) {
    const key = row.fullPath
    let cached = rowPropsCache.get(key)
    if (!cached) {
        cached = tableRowProps(row, rowKeys)
        rowPropsCache.set(key, cached)
    }
    return cached
}

function editSelected(): void {
    const first = selectedItems.value[0]
    if (!first) {
        message.info('请先选择一条记录')
        return
    }
    if (!isEditableAudioMetaPath(first.fullPath)) {
        message.warning('该格式不支持编辑标签')
        return
    }
    void openEditModal(first.fullPath)
}
</script>

<template>
    <div class="meta-mismatch-page">
        <section v-if="!canScan" class="meta-mismatch-hint">
            <p>
                扫描「艺人 - 曲名」类文件名与内嵌标签不一致的音频。请从乐库 / 同步目录选择，或指定文件夹。
            </p>
            <NSelect
                v-if="hasConfiguredSources"
                class="mtm-source-select"
                :value="metaMismatchScanDir || null"
                :options="sourceSelectOptions"
                size="small"
                filterable
                :consistent-menu-width="false"
                placeholder="从已配置的目录选择"
                @update:value="
                    (value) => {
                        if (typeof value === 'string') {
                            metaMismatchScanDir = value
                        }
                    }
                "
            />
            <NButton size="small" @click="pickScanDir">
                <template #icon>
                    <NIcon><Folder /></NIcon>
                </template>
                选择目录
            </NButton>
        </section>

        <section
            v-else-if="validatingDir && !rootValidation"
            class="meta-mismatch-hint"
        >
            <p>正在检查目录…</p>
        </section>

        <section
            v-else-if="!rootReady"
            class="meta-mismatch-hint meta-mismatch-hint--warning"
        >
            <p>当前目录无法访问，请检查路径或重新选择：</p>
            <p v-if="rootIssue" class="meta-mismatch-hint__path">
                {{ rootIssue.message }}
                <span>{{ rootIssue.path }}</span>
            </p>
            <NButton size="small" @click="pickScanDir">重新选择</NButton>
        </section>

        <div v-else class="workspace">
            <aside class="sidebar">
                <div class="sidebar-scroll">
                    <section class="mtm-source-panel">
                        <span class="mtm-source-panel__label">扫描源</span>
                        <NSelect
                            v-if="hasConfiguredSources"
                            class="mtm-source-select"
                            :value="metaMismatchScanDir || null"
                            :options="sourceSelectOptions"
                            size="small"
                            filterable
                            :consistent-menu-width="false"
                            placeholder="从已配置的目录选择"
                            @update:value="
                                (value) => {
                                    if (typeof value === 'string') {
                                        metaMismatchScanDir = value
                                    }
                                }
                            "
                        />
                        <NButton block size="small" secondary @click="pickScanDir">
                            <template #icon>
                                <NIcon><FolderOpen /></NIcon>
                            </template>
                            选择其他目录
                        </NButton>
                        <p v-if="metaMismatchScanDir" class="mtm-source-panel__path">
                            {{ metaMismatchScanDir }}
                        </p>
                    </section>

                    <section v-if="scanResult" class="mtm-stats-panel">
                        <p class="mtm-stats-panel__path">{{ scanResult.root }}</p>
                        <div class="mtm-stats-grid">
                            <div class="mtm-stats-grid__item">
                                <span class="mtm-stats-grid__value">
                                    {{ scanResult.stats.fileCount }}
                                </span>
                                <span class="mtm-stats-grid__label">音频文件</span>
                            </div>
                            <div class="mtm-stats-grid__item">
                                <span class="mtm-stats-grid__value">
                                    {{ scanResult.stats.parsedFilenameCount }}
                                </span>
                                <span class="mtm-stats-grid__label">可解析文件名</span>
                            </div>
                            <div class="mtm-stats-grid__item">
                                <span
                                    class="mtm-stats-grid__value mtm-stats-grid__value--warn"
                                >
                                    {{ scanResult.stats.mismatchCount }}
                                </span>
                                <span class="mtm-stats-grid__label">不一致</span>
                            </div>
                        </div>
                    </section>

                    <section class="toolbar">
                        <NButton
                            block
                            type="primary"
                            :disabled="applyingTags"
                            :loading="scanButtonLoading"
                            @click="runScan({ scanLoading: true })"
                        >
                            <template #icon>
                                <NIcon><Refresh /></NIcon>
                            </template>
                            扫描不一致
                        </NButton>
                        <p v-if="scanResult" class="mtm-selected-count">
                            已选 {{ selectedItems.length }} 条
                            <template v-if="selectedEditableCount > 0">
                                · 可写 {{ selectedEditableCount }}
                            </template>
                        </p>
                        <NPopconfirm
                            v-if="scanResult && scanResult.items.length > 0"
                            :disabled="
                                selectedEditableCount === 0
                                    || applyingTags
                                    || loading
                            "
                            @positive-click="applyFilenameToSelected"
                        >
                            <template #trigger>
                                <NButton
                                    block
                                    type="primary"
                                    secondary
                                    :disabled="
                                        selectedEditableCount === 0
                                            || applyingTags
                                            || loading
                                    "
                                    :loading="applyingTags"
                                >
                                    用文件名写入标签
                                </NButton>
                            </template>
                            将选中文件的艺人 / 曲名标签改为与文件名一致？
                        </NPopconfirm>
                        <NButton
                            v-if="scanResult && scanResult.items.length > 0"
                            block
                            quaternary
                            :disabled="selectedItems.length !== 1 || applyingTags"
                            @click="editSelected"
                        >
                            <template #icon>
                                <NIcon><CreateOutline /></NIcon>
                            </template>
                            编辑选中标签
                        </NButton>
                        <NButton
                            v-if="scanResult && selectedItems.length > 0"
                            block
                            quaternary
                            :disabled="applyingTags"
                            @click="clearSelection"
                        >
                            取消选择
                        </NButton>
                        <p v-if="applyResult" class="mtm-apply-result">
                            写入完成：成功 {{ applyResult.ok }}，失败
                            {{ applyResult.fail }}（{{
                                formatElapsedMs(applyResult.elapsedMs)
                            }}）
                        </p>
                    </section>
                </div>

                <section class="mtm-usage-guide">
                    <p class="mtm-usage-guide__title">说明</p>
                    <p class="mtm-usage-guide__text">
                        仅检测文件名含「艺人 - 曲名」等分隔格式的文件。双击行可试听。批量写入仅影响 MP3 / FLAC 的艺人、曲名字段，其他标签保留。
                    </p>
                </section>
            </aside>

            <main class="mtm-main-pane">
                <NSpin :show="loading" class="mtm-main-spin">
                    <div
                        v-if="scanResult && scanResult.items.length > 0"
                        ref="tableWrapRef"
                        class="mtm-table-wrap"
                        @mousedown.capture="onTableMouseDown"
                    >
                        <VirtualDataTable
                            :columns="tableColumns"
                            :data="displayRows"
                            :row-key="mismatchRowKey"
                            :checked-row-keys="selectedRowKeys"
                            :row-props="mismatchTableRowProps"
                            :max-height="tableMaxHeight"
                            size="small"
                            striped
                            @update:checked-row-keys="onCheckedRowKeys"
                        />
                    </div>
                    <div
                        v-else-if="scanResult"
                        class="meta-mismatch-empty"
                    >
                        <p class="meta-mismatch-empty__title">未发现不一致</p>
                        <p class="meta-mismatch-empty__desc">
                            在 {{ scanResult.stats.parsedFilenameCount }}
                            个可解析文件名中，标签与文件名均已匹配。
                        </p>
                    </div>
                    <div v-else class="meta-mismatch-empty">
                        <p class="meta-mismatch-empty__title">尚未扫描</p>
                        <p class="meta-mismatch-empty__desc">
                            点击「扫描不一致」开始检测。
                        </p>
                    </div>
                </NSpin>
            </main>
        </div>

        <AudioMetaEditModal
            v-model:show="editModalShow"
            :file-path="editFilePath"
            :meta="editMeta"
            @saved="onEditSaved"
        />
    </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.meta-mismatch-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    background: $color-bg;
    box-sizing: border-box;
}

.meta-mismatch-hint {
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

.meta-mismatch-hint--warning {
    border-color: rgba(234, 179, 8, 0.45);
    background: rgba(234, 179, 8, 0.08);
    opacity: 1;
}

.meta-mismatch-hint__path {
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

.mtm-source-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.mtm-source-panel__label {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.mtm-source-panel__path {
    margin: 0;
    font-family: $font-mono;
    font-size: 10px;
    line-height: 1.4;
    opacity: 0.5;
    word-break: break-all;
}

.mtm-source-select {
    width: fit-content;
    max-width: 100%;
    min-width: 160px;
}

.mtm-stats-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.mtm-stats-panel__path {
    margin: 0;
    font-family: $font-mono;
    font-size: 9px;
    line-height: 1.35;
    opacity: 0.5;
    word-break: break-all;
}

.mtm-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.mtm-stats-grid__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.mtm-stats-grid__value {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;

    &--warn {
        color: rgb(234, 179, 8);
    }
}

.mtm-stats-grid__label {
    font-size: 10px;
    opacity: 0.55;
}

.toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mtm-selected-count,
.mtm-apply-result {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.55;
}

.mtm-usage-guide {
    flex-shrink: 0;
    padding: 12px 16px 14px;
    border-top: 1px solid $border-sidebar;
    background: $surface-sidebar;
}

.mtm-usage-guide__title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.mtm-usage-guide__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.5;
}

.mtm-main-pane {
    flex: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
}

.mtm-main-spin {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;

    :deep(.n-spin-container),
    :deep(.n-spin-content) {
        flex: 1;
        width: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
}

.mtm-table-wrap {
    flex: 1;
    min-height: 0;
    margin: 12px;
    border: 1px solid $border-subtle;
    border-radius: $radius-panel;
    overflow: hidden;
    background: $surface-panel;
    display: flex;
    flex-direction: column;
}

.meta-mismatch-empty {
    flex: 1;
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 12px;
    background: var(--app-placeholder-bg);
    border-radius: $radius-panel;
}

.meta-mismatch-empty__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.7;
}

.meta-mismatch-empty__desc {
    margin: 0;
    font-size: 13px;
    opacity: 0.45;
    text-align: center;
    max-width: 360px;
}

</style>

<style lang="scss">
/* render 单元格在表格外层，需非 scoped；配色对齐 Naive NTag */
.n-data-table.virtual-data-table {
    .mtm-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 22px;
        padding: 0 7px;
        border-radius: 2px;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        box-sizing: border-box;
    }

    .mtm-pill--warning {
        color: #f0a020;
        background-color: rgba(240, 160, 32, 0.18);
    }

    .mtm-pill--success {
        color: #18a058;
        background-color: rgba(24, 160, 88, 0.18);
    }

    .mtm-pill--default {
        opacity: 0.72;
        background-color: rgba(128, 128, 128, 0.2);
    }

    .mtm-cell-empty {
        opacity: 0.4;
    }
}
</style>
