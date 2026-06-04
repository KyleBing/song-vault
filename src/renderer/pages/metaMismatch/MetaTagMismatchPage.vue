<script setup lang="ts">
import {
    NButton,
    NIcon,
    NPopconfirm,
    NProgress,
    NSelect,
    NSpin,
    useMessage,
    type DataTableColumns
} from 'naive-ui'
import { Folder, FolderOpen, Refresh } from '@vicons/ionicons5'
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
import { metaTagFieldsHaveTraditionalChinese } from '@shared/traditionalChinese'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import {
    applySortableHeaders,
    handleTableSorterUpdate,
    sortRows,
    type TableSortOrder
} from '@renderer/composables/useTableHeaderSort'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import { useLayoutStore } from '@renderer/stores/layout'
import { useAudioPlayRowProps } from '@renderer/composables/useAudioPlayRowProps'
import VirtualDataTable from '@renderer/components/VirtualDataTable.vue'
import AudioMetaPanel from '@renderer/components/AudioMetaPanel.vue'
import SelectionPathFooter from '@renderer/components/SelectionPathFooter.vue'
import { formatElapsedMs } from '@renderer/utils/formatDuration'
import { tableStatusPill } from '@renderer/utils/tableStatusPill'

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
        { class: row.tagArtistIsEmpty ? 'sv-cell-empty' : undefined },
        row.tagArtistDisplay
    )
}

function renderTagTitleCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        { class: row.tagTitleIsEmpty ? 'sv-cell-empty' : undefined },
        row.tagTitleDisplay
    )
}

function renderMismatchCell(row: MetaTagMismatchDisplayRow) {
    return tableStatusPill(row.mismatchLabel, 'warning')
}

function renderEditableCell(row: MetaTagMismatchDisplayRow) {
    return tableStatusPill(
        row.editableLabel,
        row.editable ? 'success' : 'default'
    )
}

type MetaTagMismatchSortKey =
    | 'relativePath'
    | 'fileArtist'
    | 'fileTitle'
    | 'tagArtistDisplay'
    | 'tagTitleDisplay'
    | 'mismatchLabel'
    | 'editableLabel'

const SORTABLE_META_MISMATCH_KEYS = new Set<string>([
    'relativePath',
    'fileArtist',
    'fileTitle',
    'tagArtistDisplay',
    'tagTitleDisplay',
    'mismatchLabel',
    'editableLabel'
])

function mismatchReasonRank(reasons: MetaTagMismatchReason[]): number {
    if (reasons.includes('both')) return 3
    if (reasons.includes('artist')) return 2
    return 1
}

function compareMetaTagMismatchRow(
    a: MetaTagMismatchDisplayRow,
    b: MetaTagMismatchDisplayRow,
    key: string
): number {
    switch (key) {
        case 'relativePath':
            return a.relativePath.localeCompare(b.relativePath, undefined, {
                sensitivity: 'base'
            })
        case 'fileArtist':
            return a.fileArtist.localeCompare(b.fileArtist, undefined, {
                sensitivity: 'base'
            })
        case 'fileTitle':
            return a.fileTitle.localeCompare(b.fileTitle, undefined, {
                sensitivity: 'base'
            })
        case 'tagArtistDisplay':
            return a.tagArtist.localeCompare(b.tagArtist, undefined, {
                sensitivity: 'base'
            })
        case 'tagTitleDisplay':
            return a.tagTitle.localeCompare(b.tagTitle, undefined, {
                sensitivity: 'base'
            })
        case 'mismatchLabel':
            return (
                mismatchReasonRank(a.reasons) - mismatchReasonRank(b.reasons) ||
                a.mismatchLabel.localeCompare(b.mismatchLabel, undefined, {
                    sensitivity: 'base'
                })
            )
        case 'editableLabel':
            return Number(a.editable) - Number(b.editable)
        default:
            return a.relativePath.localeCompare(b.relativePath, undefined, {
                sensitivity: 'base'
            })
    }
}

/** 列配置保持引用稳定，减轻虚拟列表滚动时的 diff */
const META_MISMATCH_TABLE_COLUMNS: DataTableColumns<MetaTagMismatchDisplayRow> = [
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
            width: 150,
            ellipsis: { tooltip: false }
        },
        {
            title: '文件名·曲名',
            key: 'fileTitle',
            width: 150,
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
const { invalidateMeta } = useAudioMetaCache()

const loading = ref(false)
const validatingDir = ref(false)
const scanButtonLoading = ref(false)
const applyingTags = ref(false)
const rootValidation = ref<SyncRootCheck | null>(null)
const scanResult = ref<ScanMetaTagMismatchResult | null>(null)
const filterTraditionalMeta = ref(false)

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

const filteredTableRows = computed(() => {
    if (!filterTraditionalMeta.value) return tableRows.value
    return tableRows.value.filter((row) =>
        metaTagFieldsHaveTraditionalChinese(row.tagArtist, row.tagTitle)
    )
})

const traditionalMetaCount = computed(
    () =>
        tableRows.value.filter((row) =>
            metaTagFieldsHaveTraditionalChinese(row.tagArtist, row.tagTitle)
        ).length
)

const sortKey = ref<MetaTagMismatchSortKey>('relativePath')
const sortOrder = ref<TableSortOrder>('asc')

const displayRows = computed(() => {
    const rows = filteredTableRows.value.map(toDisplayRow)
    return sortRows(rows, sortKey.value, sortOrder.value, compareMetaTagMismatchRow)
})

const orderedRowKeys = computed(() => displayRows.value.map((row) => row.fullPath))

const tableColumns = computed(() =>
    applySortableHeaders(META_MISMATCH_TABLE_COLUMNS, {
        sortKey: sortKey.value,
        sortOrder: sortOrder.value,
        isSortable: (key) => SORTABLE_META_MISMATCH_KEYS.has(key),
        compare: (key) => (a, b) => compareMetaTagMismatchRow(a, b, key)
    })
)

function onSorterUpdate(
    sorter: Parameters<typeof handleTableSorterUpdate>[0]
): void {
    handleTableSorterUpdate(sorter, sortKey, sortOrder, 'relativePath')
}

const rowPropsCache = new Map<string, Record<string, unknown>>()

watch(tableRows, () => rowPropsCache.clear())

const {
    selectedKeys: selectedRowKeys,
    clearSelection,
    onUpdateCheckedRowKeys,
    onTableMouseDown,
    rowProps: shiftRowProps
} = useShiftRowSelection((row) => (row as MetaTagMismatchItem).fullPath)

watch(filterTraditionalMeta, () => {
    const visible = new Set(filteredTableRows.value.map((row) => row.fullPath))
    selectedRowKeys.value = selectedRowKeys.value.filter((key) => visible.has(key))
})

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
    onUpdateCheckedRowKeys(keys.map(String), orderedRowKeys, meta)
}

const selectedItems = computed(() => {
    const set = new Set(selectedRowKeys.value)
    return tableRows.value.filter((row) => set.has(row.fullPath))
})

const metaPanelFilePath = computed(() => selectedRowKeys.value[0] ?? null)

const metaPanelHidden = computed(
    () => applyingTags.value || loading.value
)

const selectedEditableCount = computed(() =>
    selectedItems.value.filter((row) => row.editable).length
)

const applyResult = ref<{
    ok: number
    fail: number
    elapsedMs: number
} | null>(null)

const applyTagsProgress = ref({ done: 0, total: 0 })
const applyTagsTiming = ref({ lastFileMs: 0, elapsedMs: 0 })

const APPLY_TAGS_ETA_MIN_SAMPLES = 5

function estimateApplyTagsRemainingMs(
    done: number,
    total: number,
    elapsedMs: number
): number | null {
    if (done < APPLY_TAGS_ETA_MIN_SAMPLES || done >= total || total <= 0) {
        return null
    }
    const remaining = total - done
    return (elapsedMs / done) * remaining
}

const applyTagsProgressPercent = computed(() => {
    const { done, total } = applyTagsProgress.value
    if (!total) return 0
    return Math.round((done / total) * 100)
})

const applyTagsProgressDetailText = computed(() => {
    const { done, total } = applyTagsProgress.value
    if (!applyingTags.value || total === 0) return ''
    const parts: string[] = [`${done} / ${total}`]
    if (done > 0) {
        parts.push(`上个约 ${formatElapsedMs(applyTagsTiming.value.lastFileMs)}`)
        parts.push(`已用 ${formatElapsedMs(applyTagsTiming.value.elapsedMs)}`)
        const remainingMs = estimateApplyTagsRemainingMs(
            done,
            total,
            applyTagsTiming.value.elapsedMs
        )
        if (remainingMs != null) {
            parts.push(`剩余 ${formatElapsedMs(remainingMs)}`)
        }
    }
    return parts.join(' · ')
})

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
        filterTraditionalMeta.value = false
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

async function onMetaPanelSaved(): Promise<void> {
    if (metaPanelFilePath.value) invalidateMeta(metaPanelFilePath.value)
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
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { lastFileMs: 0, elapsedMs: 0 }
    const started = performance.now()
    let lastCheckpointAt = started
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
            const now = performance.now()
            applyTagsTiming.value = {
                lastFileMs: now - lastCheckpointAt,
                elapsedMs: now - started
            }
            lastCheckpointAt = now
            applyTagsProgress.value = { done: ok + fail, total: targets.length }
        }
    } finally {
        applyingTags.value = false
        applyTagsProgress.value = { done: 0, total: 0 }
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
        cached = tableRowProps(row, orderedRowKeys)
        rowPropsCache.set(key, cached)
    }
    return cached
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
                        <NButton
                            v-if="scanResult && scanResult.items.length > 0"
                            block
                            quaternary
                            :type="filterTraditionalMeta ? 'primary' : 'default'"
                            :disabled="traditionalMetaCount === 0"
                            @click="filterTraditionalMeta = !filterTraditionalMeta"
                        >
                            {{
                                filterTraditionalMeta
                                    ? '显示全部'
                                    : `仅繁体标签 (${traditionalMetaCount})`
                            }}
                        </NButton>
                        <p
                            v-if="scanResult && filterTraditionalMeta"
                            class="mtm-selected-count"
                        >
                            显示 {{ displayRows.length }} / {{ scanResult.items.length }} 条
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
                        <NProgress
                            v-if="applyingTags"
                            type="line"
                            :percentage="applyTagsProgressPercent"
                            :show-indicator="true"
                        />
                        <p
                            v-if="applyingTags && applyTagsProgressDetailText"
                            class="mtm-apply-progress-detail"
                        >
                            {{ applyTagsProgressDetailText }}
                        </p>
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

                <AudioMetaPanel
                    v-if="!metaPanelHidden"
                    :file-path="metaPanelFilePath"
                    @saved="onMetaPanelSaved"
                />
            </aside>

            <main class="mtm-main-pane">
                <NSpin :show="loading" class="mtm-main-spin">
                    <div
                        v-if="scanResult && displayRows.length > 0"
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
                            @update:sorter="onSorterUpdate"
                        />
                    </div>
                    <div
                        v-else-if="scanResult && scanResult.items.length > 0"
                        class="meta-mismatch-empty"
                    >
                        <p class="meta-mismatch-empty__title">无匹配项</p>
                        <p class="meta-mismatch-empty__desc">
                            当前列表中没有标签含繁体字的记录。
                        </p>
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
                <SelectionPathFooter :path="metaPanelFilePath" />
            </main>
        </div>
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
.mtm-apply-result,
.mtm-apply-progress-detail {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.55;
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
