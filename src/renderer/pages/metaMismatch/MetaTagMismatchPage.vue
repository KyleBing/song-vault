<script setup lang="ts">
import {
    NButton,
    NIcon,
    NInput,
    NPopconfirm,
    NSelect,
    NSpin,
    useMessage,
    type DataTableColumns
} from 'naive-ui'
import { Close, Refresh } from '@vicons/ionicons5'
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { PathFilterRule } from '@shared/appConfig'
import {
    countItemsByIssue,
    META_TAG_MISMATCH_ISSUE_LABELS,
    normalizeFilenameArtist,
    tagArtistForMetaFromFilename,
    type MetaTagMismatchIssue,
    type MetaTagMismatchItem,
    type ScanMetaTagMismatchResult
} from '@shared/metaTagMismatch'
import {
    fieldHasEdgeUnderscore,
    rebuildFileNameWithArtist,
    rebuildFileNameWithArtistAndTitle,
    rebuildFileNameWithoutTrailingUnderscore,
    trimEdgeUnderscores
} from '@shared/audioMetaEdit'
import type { SyncRootCheck } from '@shared/librarySyncJob'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import {
    buildDuplicateScanSourceGroups,
    flattenDuplicateScanSourcePaths,
    hasDuplicateScanSourceOptions
} from '@shared/duplicateScanSources'
import {
    metaTagRowHasTraditionalChinese,
    isTraditionalVariantChar
} from '@shared/traditionalChinese'
import {
    duplicateKeysForArtistStack,
    duplicateKeysForTitleStack
} from '@shared/audioMetaExtraEdit'
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
import { useBatchTask } from '@renderer/composables/useBatchTask'
import { syncGlobalBatchProgress } from '@renderer/composables/syncGlobalBatchProgress'
import SelectionPathFooter from '@renderer/components/SelectionPathFooter.vue'
import { formatElapsedMs } from '@renderer/utils/formatDuration'
import { tableStatusPill } from '@renderer/utils/tableStatusPill'
import { metaPanelPathFromSelection } from '@renderer/composables/metaPanelPathFromSelection'
import type { VNode } from 'vue'

type IssueFilterKey = 'all' | MetaTagMismatchIssue
type IssueGroupId = 'filename' | 'tag' | 'extended'

const ISSUE_GROUP_LABELS: Record<IssueGroupId, string> = {
    filename: '文件名',
    tag: '标签',
    extended: '扩展'
}

const ISSUE_FILTER_OPTIONS: {
    key: MetaTagMismatchIssue
    group: IssueGroupId
    label: string
    fixLabel: string
    confirmAll: (count: number) => string
    confirmSelected: (selectedCount: number, fixCount: number) => string
}[] = [
    {
        group: 'filename',
        key: 'fileArtistSep',
        label: META_TAG_MISMATCH_ISSUE_LABELS.fileArtistSep,
        fixLabel: '执行',
        confirmAll: (n) => `将全部 ${n} 个符合项重命名为规范艺人格式（逗号无空格）？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「文件名分隔」，确定重命名？`
    },
    {
        group: 'filename',
        key: 'fileUnderscore',
        label: META_TAG_MISMATCH_ISSUE_LABELS.fileUnderscore,
        fixLabel: '执行',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项去掉文件名中多余下划线（艺人/曲名首尾或文件名末尾）并重命名？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「文件名下划线」，确定重命名？`
    },
    {
        group: 'filename',
        key: 'fileTraditional',
        label: META_TAG_MISMATCH_ISSUE_LABELS.fileTraditional,
        fixLabel: '繁转简',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项的文件名（艺人 / 曲名）繁体转为简体并重命名？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「文件名繁体」，确定繁转简并重命名？`
    },
    {
        group: 'tag',
        key: 'tagArtistSep',
        label: META_TAG_MISMATCH_ISSUE_LABELS.tagArtistSep,
        fixLabel: '执行',
        confirmAll: (n) => `将全部 ${n} 个符合项的标签艺人改为「 & 」分隔？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「标签分隔」，确定修复标签艺人？`
    },
    {
        group: 'tag',
        key: 'tagUnderscore',
        label: META_TAG_MISMATCH_ISSUE_LABELS.tagUnderscore,
        fixLabel: '执行',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项去掉标签艺人/曲名首尾多余下划线？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「标签下划线」，确定修复标签？`
    },
    {
        group: 'tag',
        key: 'artistContent',
        label: META_TAG_MISMATCH_ISSUE_LABELS.artistContent,
        fixLabel: '执行',
        confirmAll: (n) => `将全部 ${n} 个符合项的标签艺人改为与文件名一致？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「标签艺人」，确定修复？`
    },
    {
        group: 'tag',
        key: 'titleContent',
        label: META_TAG_MISMATCH_ISSUE_LABELS.titleContent,
        fixLabel: '执行',
        confirmAll: (n) => `将全部 ${n} 个符合项的标签曲名改为与文件名一致？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「标签曲名」，确定修复？`
    },
    {
        group: 'tag',
        key: 'id3v1Tag',
        label: META_TAG_MISMATCH_ISSUE_LABELS.id3v1Tag,
        fixLabel: '删除',
        confirmAll: (n) =>
            `将全部 ${n} 个 MP3 的文件尾 ID3v1 标签删除（保留 ID3v2）？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条含有 ID3v1 标签，确定删除？`
    },
    {
        group: 'extended',
        key: 'extArtistContent',
        label: META_TAG_MISMATCH_ISSUE_LABELS.extArtistContent,
        fixLabel: '执行',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项的扩展艺人（Vorbis/ID3）改为与文件名一致？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「扩展艺人」，确定修复？`
    },
    {
        group: 'extended',
        key: 'extTitleContent',
        label: META_TAG_MISMATCH_ISSUE_LABELS.extTitleContent,
        fixLabel: '执行',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项的扩展曲名（Vorbis/ID3）改为与文件名一致？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「扩展曲名」，确定修复？`
    },
    {
        group: 'extended',
        key: 'extTagDuplicate',
        label: META_TAG_MISMATCH_ISSUE_LABELS.extTagDuplicate,
        fixLabel: '清理',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项的扩展标签去重（同键 / 别名重复只保留一条）？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「扩展重复」，确定清理？`
    },
    {
        group: 'extended',
        key: 'extTagTraditional',
        label: META_TAG_MISMATCH_ISSUE_LABELS.extTagTraditional,
        fixLabel: '繁转简',
        confirmAll: (n) =>
            `将全部 ${n} 个符合项的扩展标签（Vorbis/ID3）繁体转为简体？`,
        confirmSelected: (sel, n) =>
            `已选 ${sel} 条，其中 ${n} 条符合「扩展繁体」，确定繁转简？`
    }
]

const ISSUE_GROUP_ORDER: IssueGroupId[] = ['filename', 'tag', 'extended']

/** 表格展示行：预计算文案，避免虚拟滚动时重复解析 */
interface MetaTagMismatchDisplayRow extends MetaTagMismatchItem {
    tagArtistDisplay: string
    tagTitleDisplay: string
    tagArtistIsEmpty: boolean
    tagTitleIsEmpty: boolean
    extTagArtistDisplay: string
    extTagTitleDisplay: string
    extTagArtistIsEmpty: boolean
    extTagTitleIsEmpty: boolean
    extTagArtistDiffers: boolean
    extTagTitleDiffers: boolean
    issueSummary: string
    targetTagArtistBlocked: boolean
    editableLabel: string
}

type MetaTagMismatchTableRow = MetaTagMismatchDisplayRow & {
    writeTagArtist: string
    writeTagTitle: string
}

interface WriteTargetOverride {
    artist?: string
    title?: string
}

function issueSummaryFromIssues(issues: MetaTagMismatchIssue[]): string {
    return issues.map((issue) => META_TAG_MISMATCH_ISSUE_LABELS[issue]).join(' · ')
}

function edgeUnderscoreIndexes(text: string): Set<number> {
    const indexes = new Set<number>()
    if (!fieldHasEdgeUnderscore(text)) return indexes
    const trimmed = text.trim()
    if (!trimmed) return indexes
    const start = text.indexOf(trimmed)
    const end = start + trimmed.length - 1
    for (let i = start; i <= end && text[i] === '_'; i += 1) {
        indexes.add(i)
    }
    for (let i = end; i >= start && text[i] === '_'; i -= 1) {
        indexes.add(i)
    }
    return indexes
}

function isBadEdgeUnderscoreChar(text: string, index: number): boolean {
    return edgeUnderscoreIndexes(text).has(index)
}

function isBadFileArtistChar(text: string, index: number): boolean {
    if (isBadEdgeUnderscoreChar(text, index)) return true
    const ch = text[index]
    if (isTraditionalVariantChar(ch ?? '')) return true
    if (ch === ';' || ch === '&') return true
    if (ch === ',') {
        return text[index + 1] === ' ' || text[index - 1] === ' '
    }
    return false
}

function isBadTagArtistChar(text: string, index: number): boolean {
    if (isBadEdgeUnderscoreChar(text, index)) return true
    const ch = text[index]
    if (ch === ',' || ch === ';') return true
    if (ch === '&') {
        return !(text[index - 1] === ' ' && text[index + 1] === ' ')
    }
    return false
}

function isBadFileTitleChar(text: string, index: number): boolean {
    if (isBadEdgeUnderscoreChar(text, index)) return true
    return isTraditionalVariantChar(text[index] ?? '')
}

function renderTextWithHighlights(
    text: string,
    isEmpty: boolean,
    isBad: (text: string, index: number) => boolean
) {
    if (isEmpty) {
        return h('span', { class: 'sv-cell-empty' }, '（空）')
    }
    const children: VNode[] = []
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i]
        children.push(
            h('span', isBad(text, i) ? { class: 'mtm-char-bad' } : undefined, ch)
        )
    }
    return h('span', children)
}

function renderArtistWithHighlights(
    text: string,
    kind: 'file' | 'tag',
    isEmpty: boolean
) {
    const isBad =
        kind === 'file' ? isBadFileArtistChar : isBadTagArtistChar
    return renderTextWithHighlights(text, isEmpty, isBad)
}

interface StackedLineSpec {
    label: string
    content: VNode
    lineClass?: string
}

function renderStackedCell(lines: StackedLineSpec[]): VNode {
    return h(
        'div',
        { class: 'mtm-stack-cell' },
        lines.map((line) =>
            h(
                'div',
                {
                    class: ['mtm-stack-line', line.lineClass].filter(Boolean)
                },
                [
                    h('span', { class: 'mtm-stack-label' }, line.label),
                    h('span', { class: 'mtm-stack-value' }, [line.content])
                ]
            )
        )
    )
}

function metaValuesDiffer(a: string, b: string): boolean {
    if (!a.trim() && !b.trim()) return false
    return a.trim().toLowerCase() !== b.trim().toLowerCase()
}

function toDisplayRow(row: MetaTagMismatchItem): MetaTagMismatchDisplayRow {
    const targetTagArtistBlocked = row.targetTagArtist === null

    return {
        ...row,
        tagArtistDisplay: row.tagArtist || '（空）',
        tagTitleDisplay: row.tagTitle || '（空）',
        tagArtistIsEmpty: !row.tagArtist,
        tagTitleIsEmpty: !row.tagTitle,
        extTagArtistDisplay: row.extTagArtist || '（空）',
        extTagTitleDisplay: row.extTagTitle || '（空）',
        extTagArtistIsEmpty: !row.extTagArtist,
        extTagTitleIsEmpty: !row.extTagTitle,
        extTagArtistDiffers: metaValuesDiffer(row.extTagArtist, row.tagArtist),
        extTagTitleDiffers: metaValuesDiffer(row.extTagTitle, row.tagTitle),
        issueSummary: issueSummaryFromIssues(row.issues),
        targetTagArtistBlocked,
        editableLabel: row.editable ? '可写' : '只读'
    }
}

function renderIssuesCell(row: MetaTagMismatchDisplayRow) {
    return h(
        'span',
        { class: 'mtm-issues-cell' },
        row.issues.map((issue) =>
            tableStatusPill(
                META_TAG_MISMATCH_ISSUE_LABELS[issue],
                issue === 'fileArtistSep' ||
                issue === 'fileUnderscore' ||
                issue === 'extArtistContent' ||
                issue === 'extTitleContent' ||
                issue === 'extTagDuplicate'
                    ? 'error'
                    : 'warning',
                { class: 'mtm-issue-pill' }
            )
        )
    )
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
    | 'issueSummary'
    | 'editableLabel'

const SORTABLE_META_MISMATCH_KEYS = new Set<string>([
    'relativePath',
    'fileArtist',
    'fileTitle',
    'issueSummary',
    'editableLabel'
])

function issueRank(issues: MetaTagMismatchIssue[]): number {
    return issues.length
}

function compareMetaTagMismatchRow(
    a: MetaTagMismatchTableRow,
    b: MetaTagMismatchTableRow,
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
        case 'issueSummary':
            return (
                issueRank(a.issues) - issueRank(b.issues) ||
                a.issueSummary.localeCompare(b.issueSummary, undefined, {
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

/** 列配置：艺人 / 曲名列为纵向堆叠展示 */
const META_MISMATCH_TABLE_BASE_COLUMNS: DataTableColumns<MetaTagMismatchTableRow> = [
        { type: 'selection', fixed: 'left' },
        {
            title: '相对路径',
            key: 'relativePath',
            minWidth: 160,
            ellipsis: { tooltip: false }
        },
        {
            title: '问题',
            key: 'issueSummary',
            width: 168,
            render: renderIssuesCell
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
const batchTask = useBatchTask()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const { invalidateMeta } = useAudioMetaCache()

const loading = ref(false)
const validatingDir = ref(false)
const scanButtonLoading = ref(false)
const scanTiming = ref<{ elapsedMs: number | null }>({ elapsedMs: null })
const scanProgress = ref<{
    done: number
    total: number
    phase: 'read' | 'compare'
}>({ done: 0, total: 0, phase: 'read' })

let scanTimingTimer: ReturnType<typeof setInterval> | null = null
let scanStartedAt = 0
let activeScanJobId: string | null = null
let unsubscribeBatchJobProgress: (() => void) | null = null

function stopScanTimingClock(final = false): void {
    if (scanTimingTimer) {
        clearInterval(scanTimingTimer)
        scanTimingTimer = null
    }
    if (final && scanStartedAt > 0) {
        scanTiming.value = { elapsedMs: performance.now() - scanStartedAt }
    }
}

function startScanTimingClock(): void {
    stopScanTimingClock()
    scanStartedAt = performance.now()
    scanTiming.value = { elapsedMs: 0 }
    scanTimingTimer = setInterval(() => {
        scanTiming.value = { elapsedMs: performance.now() - scanStartedAt }
    }, 200)
}
const applyingFixIssue = ref<MetaTagMismatchIssue | null>(null)
const applyingFix = computed(() => applyingFixIssue.value !== null)
const rootValidation = ref<SyncRootCheck | null>(null)
const scanResult = ref<ScanMetaTagMismatchResult | null>(null)
const filterTraditionalMeta = ref(false)
const issueFilter = ref<IssueFilterKey>('all')

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
        syncRightAlias: props.syncRightAlias
    })
)

function normalizeScanPath(dirPath: string): string {
    return dirPath.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function ensureScanDirFromConfiguredSources(): void {
    const allowed = flattenDuplicateScanSourcePaths(sourceGroups.value)
    if (allowed.length === 0) {
        metaMismatchScanDir.value = ''
        return
    }
    const current = (metaMismatchScanDir.value ?? '').trim()
    const ok =
        !!current &&
        allowed.some((p) => normalizeScanPath(p) === normalizeScanPath(current))
    if (!ok) {
        metaMismatchScanDir.value = allowed[0]!
    }
}

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
    let rows = tableRows.value
    if (filterTraditionalMeta.value) {
        rows = rows.filter((row) => metaTagRowHasTraditionalChinese(row))
    }
    if (issueFilter.value !== 'all') {
        const key = issueFilter.value
        rows = rows.filter((row) => row.issues.includes(key))
    }
    return rows
})

const issueFilterCounts = computed(() => {
    const items = tableRows.value
    return Object.fromEntries(
        ISSUE_FILTER_OPTIONS.map(({ key }) => [
            key,
            countItemsByIssue(items, key)
        ])
    ) as Record<MetaTagMismatchIssue, number>
})

const issueFilterGroups = computed(() =>
    ISSUE_GROUP_ORDER.map((groupId) => {
        const options = ISSUE_FILTER_OPTIONS.filter(
            (opt) => opt.group === groupId
        )
        const total = options.reduce(
            (sum, opt) => sum + (issueFilterCounts.value[opt.key] ?? 0),
            0
        )
        return {
            id: groupId,
            label: ISSUE_GROUP_LABELS[groupId],
            total,
            options
        }
    }).filter((group) => group.total > 0)
)

function toggleIssueFilter(issue: MetaTagMismatchIssue): void {
    if ((issueFilterCounts.value[issue] ?? 0) === 0) return
    issueFilter.value = issueFilter.value === issue ? 'all' : issue
}

const traditionalMetaCount = computed(
    () => tableRows.value.filter((row) => metaTagRowHasTraditionalChinese(row)).length
)

const sortKey = ref<MetaTagMismatchSortKey>('relativePath')
const sortOrder = ref<TableSortOrder>('asc')

const writeTargetOverrides = ref(new Map<string, WriteTargetOverride>())

function shouldShowExtArtistLine(row: MetaTagMismatchTableRow): boolean {
    return (
        Boolean(row.extTagArtist) ||
        row.extArtistMismatchFilename ||
        row.extTagArtistDiffers ||
        row.issues.includes('extArtistContent') ||
        duplicateKeysForArtistStack(row.extDuplicateKeys).length > 0
    )
}

function shouldShowExtTitleLine(row: MetaTagMismatchTableRow): boolean {
    return (
        Boolean(row.extTagTitle) ||
        row.extTitleMismatchFilename ||
        row.extTagTitleDiffers ||
        row.issues.includes('extTitleContent') ||
        duplicateKeysForTitleStack(row.extDuplicateKeys).length > 0
    )
}

function defaultWriteArtist(row: MetaTagMismatchItem): string {
    if (
        row.issues.includes('extArtistContent') &&
        !row.issues.includes('artistContent')
    ) {
        if (row.targetTagArtist !== null) {
            return row.targetTagArtist
        }
        const normalized = tagArtistForMetaFromFilename(row.fileArtist)
        if (normalized) return normalized
        return row.fileArtist
    }
    if (row.targetTagArtist !== null) {
        return row.targetTagArtist
    }
    const normalized = tagArtistForMetaFromFilename(row.fileArtist)
    if (normalized) return normalized
    if (fieldHasEdgeUnderscore(row.tagArtist)) {
        return trimEdgeUnderscores(row.tagArtist)
    }
    if (fieldHasEdgeUnderscore(row.extTagArtist)) {
        return trimEdgeUnderscores(row.extTagArtist)
    }
    return row.tagArtist
}

function defaultWriteTitle(row: MetaTagMismatchItem): string {
    if (
        row.issues.includes('titleContent') ||
        row.issues.includes('extTitleContent')
    ) {
        return row.fileTitle
    }
    if (fieldHasEdgeUnderscore(row.tagTitle)) {
        return trimEdgeUnderscores(row.tagTitle)
    }
    if (fieldHasEdgeUnderscore(row.extTagTitle)) {
        return trimEdgeUnderscores(row.extTagTitle)
    }
    return row.tagTitle
}

function getWriteArtist(row: MetaTagMismatchItem): string {
    return writeTargetOverrides.value.get(row.fullPath)?.artist ?? defaultWriteArtist(row)
}

function getWriteTitle(row: MetaTagMismatchItem): string {
    return writeTargetOverrides.value.get(row.fullPath)?.title ?? defaultWriteTitle(row)
}

function getExtWriteArtist(row: MetaTagMismatchItem): string {
    const override = writeTargetOverrides.value.get(row.fullPath)?.artist
    if (override !== undefined) return override
    if (row.targetTagArtist !== null) return row.targetTagArtist
    const normalized = tagArtistForMetaFromFilename(row.fileArtist)
    if (normalized) return normalized
    return row.fileArtist
}

function getExtWriteTitle(row: MetaTagMismatchItem): string {
    const override = writeTargetOverrides.value.get(row.fullPath)?.title
    if (override !== undefined) return override
    if (row.issues.includes('extTitleContent') && !row.issues.includes('titleContent')) {
        return row.fileTitle || row.tagTitle || row.extTagTitle
    }
    return row.tagTitle || row.extTagTitle || row.fileTitle
}

function setWriteTargetField(
    fullPath: string,
    field: 'artist' | 'title',
    value: string
): void {
    const next = new Map(writeTargetOverrides.value)
    const current = next.get(fullPath) ?? {}
    next.set(fullPath, { ...current, [field]: value })
    writeTargetOverrides.value = next
}

function pruneWriteTargetOverrides(items: MetaTagMismatchItem[]): void {
    const valid = new Set(items.map((row) => row.fullPath))
    const next = new Map<string, WriteTargetOverride>()
    for (const [path, value] of writeTargetOverrides.value) {
        if (valid.has(path)) next.set(path, value)
    }
    writeTargetOverrides.value = next
}

function renderExtArtistValue(row: MetaTagMismatchTableRow): VNode {
    if (row.extTagArtistIsEmpty) {
        return h('span', { class: 'sv-cell-empty' }, '（空）')
    }
    const highlighted = renderArtistWithHighlights(
        row.extTagArtist,
        'tag',
        row.extTagArtistIsEmpty
    )
    if (!row.extArtistMismatchFilename && !row.extTagArtistDiffers) {
        return highlighted
    }
    if (!row.editable) {
        return highlighted
    }
    return h('span', { class: 'mtm-ext-diff' }, [
        highlighted,
        h(
            'button',
            {
                type: 'button',
                class: 'mtm-ext-adopt',
                title: '填入写入',
                onClick: (event: MouseEvent) => {
                    event.stopPropagation()
                    setWriteTargetField(row.fullPath, 'artist', row.extTagArtist)
                }
            },
            '→'
        )
    ])
}

function renderExtTitleValue(row: MetaTagMismatchTableRow): VNode {
    if (row.extTagTitleIsEmpty) {
        return h('span', { class: 'sv-cell-empty' }, '（空）')
    }
    const highlighted = renderTextWithHighlights(
        row.extTagTitle,
        row.extTagTitleIsEmpty,
        isBadEdgeUnderscoreChar
    )
    if (!row.extTitleMismatchFilename && !row.extTagTitleDiffers) {
        return highlighted
    }
    if (!row.editable) {
        return highlighted
    }
    return h('span', { class: 'mtm-ext-diff' }, [
        highlighted,
        h(
            'button',
            {
                type: 'button',
                class: 'mtm-ext-adopt',
                title: '填入写入',
                onClick: (event: MouseEvent) => {
                    event.stopPropagation()
                    setWriteTargetField(row.fullPath, 'title', row.extTagTitle)
                }
            },
            '→'
        )
    ])
}

function renderWriteArtistInput(row: MetaTagMismatchTableRow): VNode {
    if (!row.editable) {
        return h('span', { class: 'sv-cell-empty' }, '只读')
    }
    if (row.targetTagArtistBlocked) {
        return tableStatusPill('需先修正文件名', 'error')
    }
    return h(NInput, {
        class: 'mtm-write-input',
        size: 'tiny',
        value: row.writeTagArtist,
        placeholder: defaultWriteArtist(row) || '艺人',
        onClick: (event: MouseEvent) => event.stopPropagation(),
        onUpdateValue: (value: string) =>
            setWriteTargetField(row.fullPath, 'artist', value)
    })
}

function renderWriteTitleInput(row: MetaTagMismatchTableRow): VNode {
    if (!row.editable) {
        return h('span', { class: 'sv-cell-empty' }, '只读')
    }
    return h(NInput, {
        class: 'mtm-write-input',
        size: 'tiny',
        value: row.writeTagTitle,
        placeholder: defaultWriteTitle(row) || '曲名',
        onClick: (event: MouseEvent) => event.stopPropagation(),
        onUpdateValue: (value: string) =>
            setWriteTargetField(row.fullPath, 'title', value)
    })
}

function renderArtistStackCell(row: MetaTagMismatchTableRow): VNode {
    const lines: StackedLineSpec[] = [
        {
            label: '文件名',
            content: renderArtistWithHighlights(
                row.fileArtist,
                'file',
                !row.fileArtist
            )
        },
        {
            label: '标签',
            content: renderArtistWithHighlights(
                row.tagArtist,
                'tag',
                row.tagArtistIsEmpty
            )
        }
    ]
    if (shouldShowExtArtistLine(row)) {
        lines.push({
            label: '扩展',
            content: renderExtArtistValue(row),
            lineClass: row.extArtistMismatchFilename
                ? 'mtm-stack-line--mismatch'
                : row.extTagArtistDiffers
                  ? 'mtm-stack-line--warn'
                  : undefined
        })
        const dupKeys = duplicateKeysForArtistStack(row.extDuplicateKeys)
        if (dupKeys.length) {
            lines.push({
                label: '重复',
                content: h(
                    'span',
                    { class: 'mtm-ext-dup-hint' },
                    dupKeys.join(', ')
                ),
                lineClass: 'mtm-stack-line--warn'
            })
        }
    }
    if (row.editable) {
        lines.push({
            label: '写入',
            content: renderWriteArtistInput(row),
            lineClass: 'mtm-stack-line--write'
        })
    }
    return renderStackedCell(lines)
}

function renderTitleStackCell(row: MetaTagMismatchTableRow): VNode {
    const lines: StackedLineSpec[] = [
        {
            label: '文件名',
            content: renderTextWithHighlights(
                row.fileTitle,
                !row.fileTitle,
                isBadFileTitleChar
            )
        },
        {
            label: '标签',
            content: renderTextWithHighlights(
                row.tagTitle,
                row.tagTitleIsEmpty,
                isBadEdgeUnderscoreChar
            )
        }
    ]
    if (shouldShowExtTitleLine(row)) {
        lines.push({
            label: '扩展',
            content: renderExtTitleValue(row),
            lineClass: row.extTitleMismatchFilename
                ? 'mtm-stack-line--mismatch'
                : row.extTagTitleDiffers
                  ? 'mtm-stack-line--warn'
                  : undefined
        })
        const dupKeys = duplicateKeysForTitleStack(row.extDuplicateKeys)
        if (dupKeys.length) {
            lines.push({
                label: '重复',
                content: h(
                    'span',
                    { class: 'mtm-ext-dup-hint' },
                    dupKeys.join(', ')
                ),
                lineClass: 'mtm-stack-line--warn'
            })
        }
    }
    if (row.editable) {
        lines.push({
            label: '写入',
            content: renderWriteTitleInput(row),
            lineClass: 'mtm-stack-line--write'
        })
    }
    return renderStackedCell(lines)
}

const displayRows = computed(() => {
    const overrides = writeTargetOverrides.value
    const rows = filteredTableRows.value.map((row) => {
        const display = toDisplayRow(row)
        const override = overrides.get(row.fullPath)
        return {
            ...display,
            writeTagArtist: override?.artist ?? defaultWriteArtist(row),
            writeTagTitle: override?.title ?? defaultWriteTitle(row)
        }
    })
    return sortRows(rows, sortKey.value, sortOrder.value, compareMetaTagMismatchRow)
})

const orderedRowKeys = computed(() => displayRows.value.map((row) => row.fullPath))

const tableColumns = computed(() => {
    const cols: DataTableColumns<MetaTagMismatchTableRow> = [
        ...META_MISMATCH_TABLE_BASE_COLUMNS.slice(0, 2),
        {
            title: '艺人',
            key: 'fileArtist',
            width: 220,
            ellipsis: { tooltip: false },
            render: renderArtistStackCell
        },
        {
            title: '曲名',
            key: 'fileTitle',
            width: 220,
            ellipsis: { tooltip: false },
            render: renderTitleStackCell
        },
        ...META_MISMATCH_TABLE_BASE_COLUMNS.slice(2)
    ]

    return applySortableHeaders(cols, {
        sortKey: sortKey.value,
        sortOrder: sortOrder.value,
        isSortable: (key) => SORTABLE_META_MISMATCH_KEYS.has(key),
        compare: (key) => (a, b) => compareMetaTagMismatchRow(a, b, key)
    })
})

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

watch(issueFilter, () => {
    const visible = new Set(filteredTableRows.value.map((row) => row.fullPath))
    selectedRowKeys.value = selectedRowKeys.value.filter((key) => visible.has(key))
})

const { rowProps: tableRowProps, playRowHighlightKey } = useAudioPlayRowProps(
    shiftRowProps,
    (row) => (row as MetaTagMismatchItem).fullPath
)

watch(playRowHighlightKey, () => rowPropsCache.clear())

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

const metaPanelFilePath = computed(() =>
    metaPanelPathFromSelection(selectedRowKeys.value)
)

const metaPanelHidden = computed(() => loading.value)

const applyFixProgressTitle = computed(() => {
    const issue = applyingFixIssue.value
    if (!issue) return '正在处理'
    return `正在修复：${META_TAG_MISMATCH_ISSUE_LABELS[issue]}`
})

const scanProgressDetailText = computed(() => {
    if (!loading.value || applyingFix.value) return ''
    const { done, total } = scanProgress.value
    const parts: string[] = []
    if (total > 0) {
        parts.push(`已扫描 ${done} / ${total}`)
    } else {
        parts.push('正在统计文件…')
    }
    const ms = scanTiming.value.elapsedMs
    if (ms != null) {
        parts.push(`已用 ${formatElapsedMs(ms)}`)
    }
    return parts.join(' · ')
})

const scanProgressPercent = computed(() => {
    const { done, total } = scanProgress.value
    if (!total) return 0
    return Math.round((done / total) * 100)
})

const batchProgressTitle = computed(() => {
    if (loading.value && batchTask.active && !applyingFix.value) {
        return '正在扫描'
    }
    return applyFixProgressTitle.value
})

const selectedEditableCount = computed(() =>
    selectedItems.value.filter((row) => row.editable).length
)

const selectedWritableReadyCount = computed(() =>
    selectedItems.value.filter(
        (row) => row.editable && row.targetTagArtist !== null
    ).length
)

const selectedFilenameBlockedCount = computed(() =>
    selectedItems.value.filter(
        (row) => row.editable && row.targetTagArtist === null
    ).length
)

const applyResult = ref<{
    ok: number
    fail: number
    elapsedMs: number
    subject: string
    failSamples: string[]
} | null>(null)

const applyResultTitle = computed(() => '执行结果')

const applyResultText = computed(() => {
    const result = applyResult.value
    if (!result) return ''
    const lines: string[] = []
    if (result.fail > 0) {
        lines.push(
            `写入完成：成功 ${result.ok}，失败 ${result.fail}（${result.subject}）`
        )
    } else {
        lines.push(`已成功处理 ${result.ok} 个文件的${result.subject}`)
    }
    if (result.failSamples.length) {
        lines.push(...result.failSamples)
    }
    lines.push(`用时 ${formatElapsedMs(result.elapsedMs)}`)
    return lines.join('\n')
})

const applyResultTone = computed(() => {
    const result = applyResult.value
    if (!result) return 'success' as const
    if (result.fail > 0) return 'warning' as const
    return 'success' as const
})

function dismissApplyResult(): void {
    applyResult.value = null
}

const applyTagsProgress = ref({ done: 0, total: 0 })
const applyTagsTiming = ref({ elapsedMs: 0 })

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
    if (!applyingFix.value || total === 0) return ''
    const parts: string[] = [`${done} / ${total}`]
    if (done > 0) {
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

syncGlobalBatchProgress(batchTask, {
    active: () => batchTask.active,
    title: () => batchProgressTitle.value,
    percentage: () =>
        loading.value && !applyingFix.value
            ? scanProgressPercent.value
            : applyTagsProgressPercent.value,
    detail: () =>
        loading.value && !applyingFix.value
            ? scanProgressDetailText.value
            : applyingFix.value
              ? applyTagsProgressDetailText.value
              : undefined,
    indeterminate: () =>
        loading.value && !applyingFix.value && scanProgress.value.total === 0
})

function mismatchRowKey(row: MetaTagMismatchTableRow): string {
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

async function runScan(options?: {
    silent?: boolean
    scanLoading?: boolean
}): Promise<void> {
    if (!canScan.value) return

    const validation = await validateScanRoot()
    if (!validation.ok) return

    if (options?.scanLoading) scanButtonLoading.value = true
    loading.value = true
    scanProgress.value = { done: 0, total: 0, phase: 'read' }
    startScanTimingClock()
    batchTask.begin()
    activeScanJobId = batchTask.jobId
    try {
        const root = (metaMismatchScanDir.value ?? '').trim()
        scanResult.value = await window.electronAPI.scanMetaTagMismatches({
            root,
            pathFilterRules: pathFilterRulesForSave(props.pathFilterRules),
            jobId: batchTask.jobId ?? undefined
        })
        if (scanResult.value) {
            pruneWriteTargetOverrides(scanResult.value.items)
        }
        clearSelection()
        applyResult.value = null
        filterTraditionalMeta.value = false
        issueFilter.value = 'all'
    } catch (err) {
        if (batchTask.notifyIfCancelled(err)) return
        const msg = err instanceof Error ? err.message : String(err)
        if (!options?.silent) message.error(msg)
        throw err
    } finally {
        stopScanTimingClock(true)
        activeScanJobId = null
        batchTask.end()
        loading.value = false
        if (options?.scanLoading) scanButtonLoading.value = false
    }
}

onMounted(() => {
    unsubscribeBatchJobProgress = window.electronAPI.onBatchJobProgress(
        (payload) => {
            if (!activeScanJobId || payload.jobId !== activeScanJobId) return
            scanProgress.value = {
                done: payload.done,
                total: payload.total,
                phase: payload.phase ?? 'read'
            }
        }
    )
    ensureScanDirFromConfiguredSources()
    void (async () => {
        if (canScan.value) await validateScanRoot()
    })()
})

watch(
    () => [
        props.searchRoots,
        props.syncLeftDir,
        props.syncRightDir
    ],
    () => {
        ensureScanDirFromConfiguredSources()
    },
    { deep: true }
)

onUnmounted(() => {
    unsubscribeBatchJobProgress?.()
    unsubscribeBatchJobProgress = null
    stopScanTimingClock()
    tableResizeObserver?.disconnect()
    tableResizeObserver = null
})

watch(metaMismatchScanDir, () => {
    scanResult.value = null
    scanTiming.value = { elapsedMs: null }
    scanProgress.value = { done: 0, total: 0, phase: 'read' }
    rootValidation.value = null
    void (async () => {
        if (!canScan.value) return
        await validateScanRoot()
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

function fixScopeItems(): MetaTagMismatchItem[] {
    if (selectedItems.value.length > 0) {
        return selectedItems.value
    }
    return scanResult.value?.items ?? []
}

function itemsWithIssue(issue: MetaTagMismatchIssue): MetaTagMismatchItem[] {
    return fixScopeItems().filter((row) => row.issues.includes(issue))
}

function fixableCountForIssue(issue: MetaTagMismatchIssue): number {
    const items = itemsWithIssue(issue)
    if (issue === 'fileArtistSep' || issue === 'fileUnderscore' || issue === 'fileTraditional') {
        return items.length
    }
    if (issue === 'id3v1Tag') {
        return items.filter(
            (row) =>
                row.editable &&
                row.fullPath.toLowerCase().endsWith('.mp3')
        ).length
    }
    if (issue === 'tagUnderscore') {
        return items.filter(
            (row) =>
                row.editable &&
                (fieldHasEdgeUnderscore(row.tagArtist) ||
                    fieldHasEdgeUnderscore(row.tagTitle) ||
                    fieldHasEdgeUnderscore(row.extTagArtist) ||
                    fieldHasEdgeUnderscore(row.extTagTitle))
        ).length
    }
    return items.filter((row) => row.editable).length
}

function fixConfirmMessage(issue: MetaTagMismatchIssue): string {
    const opt = ISSUE_FILTER_OPTIONS.find((item) => item.key === issue)
    if (!opt) return ''
    const fixCount = fixableCountForIssue(issue)
    const selectedCount = selectedItems.value.length
    if (selectedCount > 0) {
        return opt.confirmSelected(selectedCount, fixCount)
    }
    return opt.confirmAll(fixCount)
}

function canFixIssue(issue: MetaTagMismatchIssue): boolean {
    return fixableCountForIssue(issue) > 0 && !applyingFix.value && !loading.value
}

function bumpApplyProgress(
    ok: number,
    fail: number,
    total: number,
    started: number
): void {
    applyTagsTiming.value = {
        elapsedMs: performance.now() - started
    }
    applyTagsProgress.value = { done: ok + fail, total }
}

async function writeTagsForRow(
    row: MetaTagMismatchItem,
    artist?: string,
    title?: string
): Promise<{ ok: boolean; message?: string }> {
    const resolvedArtist = (artist ?? getWriteArtist(row)).trim()
    const resolvedTitle = (title ?? getWriteTitle(row)).trim()
    const res = await window.electronAPI.writeFilenameTags({
        filePath: row.fullPath,
        artist: resolvedArtist,
        title: resolvedTitle
    })
    if (res.ok) {
        invalidateMeta(row.fullPath)
    }
    return { ok: res.ok, message: res.message }
}

async function fixTagArtistSepItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'tagArtistSep'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(row)
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '标签艺人')
}

async function fixArtistContentItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'artistContent'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(row)
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '标签艺人')
}

async function fixExtArtistContentItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'extArtistContent'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(
                    row,
                    getExtWriteArtist(row),
                    getExtWriteTitle(row)
                )
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '扩展艺人')
}

async function fixTitleContentItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'titleContent'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(row)
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '标签曲名')
}

async function fixExtTitleContentItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'extTitleContent'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(
                    row,
                    getWriteArtist(row),
                    getExtWriteTitle(row)
                )
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '扩展曲名')
}

async function fixExtTagDuplicateItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'extTagDuplicate'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await window.electronAPI.cleanupDuplicateExtendedTags({
                    filePath: row.fullPath
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
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '扩展重复')
}

async function fixExtTagTraditionalItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter((row) => row.editable)
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'extTagTraditional'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await window.electronAPI.convertTraditionalExtendedTags({
                    filePath: row.fullPath
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
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '扩展繁转简')
}

async function fixId3v1TagItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter(
        (row) =>
            row.editable && row.fullPath.toLowerCase().endsWith('.mp3')
    )
    if (!targets.length) {
        message.warning('没有可处理的 MP3 文件')
        return
    }

    applyingFixIssue.value = 'id3v1Tag'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await window.electronAPI.removeId3v1Tags({
                    filePath: row.fullPath
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
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '删除 ID3v1')
}

async function fixFileArtistSepItems(items: MetaTagMismatchItem[]): Promise<void> {
    if (!items.length) return

    const root = (metaMismatchScanDir.value ?? '').trim()
    if (!root) return

    applyingFixIssue.value = 'fileArtistSep'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: items.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of items) {
            batchTask.createCheck()()
            const normalized = normalizeFilenameArtist(row.fileArtist)
            const newName = rebuildFileNameWithArtist(row.fullPath, normalized)
            if (!newName) {
                fail += 1
                if (failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: 无法解析文件名结构`)
                }
                bumpApplyProgress(ok, fail, items.length, started)
                continue
            }
            if (newName === row.fileName) {
                ok += 1
                bumpApplyProgress(ok, fail, items.length, started)
                continue
            }
            try {
                await window.electronAPI.browseRenamePath({
                    browseRoots: [root],
                    targetPath: row.fullPath,
                    newName,
                    disambiguateIfExists: true
                })
                ok += 1
                invalidateMeta(row.fullPath)
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, items.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '文件名')
}

async function fixFileTraditionalItems(items: MetaTagMismatchItem[]): Promise<void> {
    if (!items.length) return

    const root = (metaMismatchScanDir.value ?? '').trim()
    if (!root) return

    applyingFixIssue.value = 'fileTraditional'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: items.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of items) {
            batchTask.createCheck()()
            const artist = await window.electronAPI.convertTextToSimplified(
                row.fileArtist
            )
            const title = await window.electronAPI.convertTextToSimplified(
                row.fileTitle
            )
            if (artist === row.fileArtist && title === row.fileTitle) {
                ok += 1
                bumpApplyProgress(ok, fail, items.length, started)
                continue
            }
            const newName = rebuildFileNameWithArtistAndTitle(
                row.fullPath,
                artist,
                title
            )
            if (!newName) {
                fail += 1
                if (failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: 无法解析文件名结构`)
                }
                bumpApplyProgress(ok, fail, items.length, started)
                continue
            }
            if (newName === row.fileName) {
                ok += 1
                bumpApplyProgress(ok, fail, items.length, started)
                continue
            }
            try {
                await window.electronAPI.browseRenamePath({
                    browseRoots: [root],
                    targetPath: row.fullPath,
                    newName,
                    disambiguateIfExists: true
                })
                ok += 1
                invalidateMeta(row.fullPath)
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, items.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '文件名繁转简')
}

async function renameFileInScanRoot(
    row: MetaTagMismatchItem,
    newName: string
): Promise<void> {
    const root = (metaMismatchScanDir.value ?? '').trim()
    if (!root) throw new Error('未选择扫描目录')
    await window.electronAPI.browseRenamePath({
        browseRoots: [root],
        targetPath: row.fullPath,
        newName,
        disambiguateIfExists: true
    })
    invalidateMeta(row.fullPath)
}

function buildFixedFileName(row: MetaTagMismatchItem): string | null {
    const artist = fieldHasEdgeUnderscore(row.fileArtist)
        ? trimEdgeUnderscores(row.fileArtist)
        : row.fileArtist
    const title = fieldHasEdgeUnderscore(row.fileTitle)
        ? trimEdgeUnderscores(row.fileTitle)
        : row.fileTitle

    let newName: string | null = row.fileName
    if (artist !== row.fileArtist || title !== row.fileTitle) {
        newName = rebuildFileNameWithArtistAndTitle(row.fullPath, artist, title)
    } else {
        newName = rebuildFileNameWithoutTrailingUnderscore(row.fullPath) ?? row.fileName
    }
    if (!newName) return null

    const base = newName.replace(/^.*[/\\]/, '')
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const stem = dot > 0 ? base.slice(0, dot) : base
    if (stem.trimEnd().endsWith('_')) {
        const trimmedStem = stem.replace(/_+$/, '')
        if (!trimmedStem) return null
        newName = `${trimmedStem}${ext}`
    }

    return newName !== row.fileName ? newName : row.fileName
}

async function fixFileUnderscoreItems(items: MetaTagMismatchItem[]): Promise<void> {
    if (!items.length) return

    applyingFixIssue.value = 'fileUnderscore'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: items.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of items) {
            batchTask.createCheck()()
            const newName = buildFixedFileName(row)
            if (!newName) {
                fail += 1
                if (failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: 无法解析文件名结构`)
                }
            } else if (newName === row.fileName) {
                ok += 1
            } else {
                try {
                    await renameFileInScanRoot(row, newName)
                    ok += 1
                } catch (err) {
                    if (batchTask.notifyIfCancelled(err)) throw err
                    fail += 1
                    const msg = err instanceof Error ? err.message : String(err)
                    if (msg && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${msg}`)
                    }
                }
            }
            bumpApplyProgress(ok, fail, items.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '文件名')
}

async function fixTagUnderscoreItems(items: MetaTagMismatchItem[]): Promise<void> {
    const targets = items.filter(
        (row) =>
            row.editable &&
            (fieldHasEdgeUnderscore(row.tagArtist) ||
                fieldHasEdgeUnderscore(row.tagTitle) ||
                fieldHasEdgeUnderscore(row.extTagArtist) ||
                fieldHasEdgeUnderscore(row.extTagTitle))
    )
    if (!targets.length) {
        message.warning('没有可写入标签的文件（仅支持 MP3 / FLAC / OGG / M4A）')
        return
    }

    applyingFixIssue.value = 'tagUnderscore'
    applyResult.value = null
    applyTagsProgress.value = { done: 0, total: targets.length }
    applyTagsTiming.value = { elapsedMs: 0 }
    const started = performance.now()
    let ok = 0
    let fail = 0
    const failSamples: string[] = []

    try {
        for (const row of targets) {
            batchTask.createCheck()()
            try {
                const res = await writeTagsForRow(row)
                if (res.ok) ok += 1
                else {
                    fail += 1
                    if (res.message && failSamples.length < 3) {
                        failSamples.push(`${row.fileName}: ${res.message}`)
                    }
                }
            } catch (err) {
                if (batchTask.notifyIfCancelled(err)) throw err
                fail += 1
                const msg = err instanceof Error ? err.message : String(err)
                if (msg && failSamples.length < 3) {
                    failSamples.push(`${row.fileName}: ${msg}`)
                }
            }
            bumpApplyProgress(ok, fail, targets.length, started)
        }
    } finally {
        applyingFixIssue.value = null
        applyTagsProgress.value = { done: 0, total: 0 }
    }

    finishFixResult(ok, fail, started, failSamples, '标签')
}

function finishFixResult(
    ok: number,
    fail: number,
    started: number,
    failSamples: string[],
    subject: string
): void {
    applyResult.value = {
        ok,
        fail,
        elapsedMs: performance.now() - started,
        subject,
        failSamples
    }

    void runScan({ silent: true }).catch(() => {
        /* 扫描失败时保留列表 */
    })
}

async function fixIssue(issue: MetaTagMismatchIssue): Promise<void> {
    const items = itemsWithIssue(issue)
    if (!items.length) return

    batchTask.begin({ useMainJob: false })
    try {
        switch (issue) {
            case 'tagArtistSep':
                await fixTagArtistSepItems(items)
                break
            case 'fileArtistSep':
                await fixFileArtistSepItems(items)
                break
            case 'fileUnderscore':
                await fixFileUnderscoreItems(items)
                break
            case 'fileTraditional':
                await fixFileTraditionalItems(items)
                break
            case 'tagUnderscore':
                await fixTagUnderscoreItems(items)
                break
            case 'artistContent':
                await fixArtistContentItems(items)
                break
            case 'extArtistContent':
                await fixExtArtistContentItems(items)
                break
            case 'titleContent':
                await fixTitleContentItems(items)
                break
            case 'extTitleContent':
                await fixExtTitleContentItems(items)
                break
            case 'extTagDuplicate':
                await fixExtTagDuplicateItems(items)
                break
            case 'extTagTraditional':
                await fixExtTagTraditionalItems(items)
                break
            case 'id3v1Tag':
                await fixId3v1TagItems(items)
                break
        }
    } catch (err) {
        if (batchTask.notifyIfCancelled(err)) return
        throw err
    } finally {
        batchTask.end()
    }
}

function mismatchTableRowProps(row: MetaTagMismatchTableRow) {
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
                扫描「艺人 - 曲名」类文件名与内嵌标签不一致的音频。请从下方已配置的乐库 / 同步目录中选择。
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
        </section>

        <div v-else class="workspace">
            <aside class="sidebar">
                <div
                    v-if="applyResult"
                    class="mtm-result-bubble-wrap"
                    role="status"
                >
                    <div
                        class="mtm-result-bubble"
                        :class="`mtm-result-bubble--${applyResultTone}`"
                    >
                        <div class="mtm-result-bubble__head">
                            <span class="mtm-result-bubble__title">
                                {{ applyResultTitle }}
                            </span>
                            <NButton
                                quaternary
                                circle
                                size="tiny"
                                class="mtm-result-bubble__close"
                                aria-label="关闭"
                                @click="dismissApplyResult"
                            >
                                <template #icon>
                                    <NIcon :size="14"><Close /></NIcon>
                                </template>
                            </NButton>
                        </div>
                        <p class="mtm-result-bubble__text">
                            {{ applyResultText }}
                        </p>
                    </div>
                </div>

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
                        <p v-if="metaMismatchScanDir" class="mtm-source-panel__path">
                            {{ metaMismatchScanDir }}
                        </p>
                    </section>

                    <section class="toolbar">
                        <NButton
                            block
                            type="primary"
                            :disabled="applyingFix || loading"
                            :loading="scanButtonLoading"
                            @click="runScan({ scanLoading: true })"
                        >
                            <template #icon>
                                <NIcon><Refresh /></NIcon>
                            </template>
                            开始扫描
                        </NButton>

                        <section
                            v-if="!scanResult && !loading"
                            class="mtm-usage-guide"
                            aria-label="使用说明"
                        >
                            <h3 class="mtm-usage-guide__title">用途</h3>
                            <p class="mtm-usage-guide__text">
                                核对「艺人 - 曲名」类文件名与内嵌标签（及扩展标签）是否一致，并按你的命名规范批量修正。可发现文件名 / 标签内容不一致、多作者分隔符不规范、首尾下划线、繁体字、扩展标签重复、MP3 文件尾 ID3v1 标签（常为 ????）等问题。
                            </p>
                            <h3 class="mtm-usage-guide__title">使用说明</h3>
                            <ol class="mtm-usage-guide__list">
                                <li>扫描源来自「设置 → 路径」中已配置的乐库 / 同步目录，请先在上方下拉框选择。</li>
                                <li>点击「开始扫描」；大库扫描需一些时间，进度与用时见左下角全局进度条。</li>
                                <li>扫描完成后，左侧可按问题类型筛选列表；勾选记录后点击对应「执行 / 繁转简 / 删除」批量处理，或选中单条后在下方元数据面板编辑。</li>
                                <li>有选中时，批量操作仅处理已选中且符合该项的记录。</li>
                            </ol>
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
                                    <span class="mtm-stats-grid__label">待处理</span>
                                </div>
                            </div>
                            <p
                                v-if="scanTiming.elapsedMs != null"
                                class="mtm-stats-panel__timing"
                            >
                                扫描用时 {{ formatElapsedMs(scanTiming.elapsedMs) }}
                            </p>
                        </section>

                        <section
                            v-if="scanResult && issueFilterGroups.length > 0"
                            class="mtm-issue-filters"
                        >
                            <div class="mtm-issue-filters__head">
                                <p class="mtm-issue-filters__title">
                                    问题处理
                                    <span
                                        v-if="selectedItems.length > 0"
                                        class="mtm-issue-filters__scope"
                                    >
                                        · 已选 {{ selectedItems.length }} 条
                                    </span>
                                </p>
                                <NButton
                                    v-if="issueFilter !== 'all'"
                                    quaternary
                                    size="tiny"
                                    @click="issueFilter = 'all'"
                                >
                                    显示全部
                                </NButton>
                            </div>
                            <p
                                v-if="selectedItems.length > 0"
                                class="mtm-issue-filters__hint"
                            >
                                点击问题名筛选列表；执行时仅处理已选中且符合该项的记录
                            </p>
                            <div
                                v-for="group in issueFilterGroups"
                                :key="group.id"
                                class="mtm-issue-group"
                            >
                                <p class="mtm-issue-group__title">
                                    {{ group.label }}
                                    <span class="mtm-issue-group__total">{{
                                        group.total
                                    }}</span>
                                </p>
                                <div
                                    v-for="opt in group.options"
                                    :key="opt.key"
                                    class="mtm-issue-item"
                                >
                                    <button
                                        type="button"
                                        class="mtm-issue-item__filter"
                                        :class="{
                                            'mtm-issue-item__filter--active':
                                                issueFilter === opt.key
                                        }"
                                        :disabled="issueFilterCounts[opt.key] === 0"
                                        :title="
                                            issueFilter === opt.key
                                                ? '点击取消筛选'
                                                : '点击筛选此项'
                                        "
                                        @click="toggleIssueFilter(opt.key)"
                                    >
                                        <span class="mtm-issue-item__label">{{
                                            opt.label
                                        }}</span>
                                        <span class="mtm-issue-item__count">{{
                                            issueFilterCounts[opt.key]
                                        }}</span>
                                    </button>
                                    <NPopconfirm
                                        :disabled="!canFixIssue(opt.key)"
                                        @positive-click="fixIssue(opt.key)"
                                    >
                                        <template #trigger>
                                            <NButton
                                                class="mtm-issue-item__fix"
                                                type="primary"
                                                size="tiny"
                                                :disabled="!canFixIssue(opt.key)"
                                                :loading="
                                                    applyingFixIssue === opt.key
                                                "
                                            >
                                                {{ opt.fixLabel }}
                                                ({{
                                                    fixableCountForIssue(opt.key)
                                                }})
                                            </NButton>
                                        </template>
                                        {{ fixConfirmMessage(opt.key) }}
                                    </NPopconfirm>
                                </div>
                            </div>
                        </section>

                        <p v-if="scanResult" class="mtm-selected-count">
                            已选 {{ selectedItems.length }} 条
                            <template v-if="selectedEditableCount > 0">
                                · 可写 {{ selectedEditableCount }}
                            </template>
                            <template v-if="selectedWritableReadyCount > 0">
                                · 可立即写入 {{ selectedWritableReadyCount }}
                            </template>
                        </p>
                        <p
                            v-if="selectedFilenameBlockedCount > 0"
                            class="mtm-selected-count mtm-selected-count--warn"
                        >
                            {{ selectedFilenameBlockedCount }} 条需先修正文件名艺人格式
                        </p>
                        <section v-if="scanResult" class="mtm-rules-panel">
                            <p class="mtm-rules-panel__title">艺人分隔规范</p>
                            <ul class="mtm-rules-panel__list">
                                <li>文件名：多作者用 <code>,</code> 连接，逗号两侧无空格；不得含 <code>;</code>、<code>&amp;</code></li>
                                <li>文件名：扩展名前不得有多余 <code>_</code>（如 <code>曲名_.flac</code>）</li>
                                <li>标签：多作者用 <code> &amp; </code> 连接，不用 <code>,</code>、<code>;</code></li>
                                <li>列表：艺人 / 曲名列内纵向展示文件名、标签、扩展与写入；扩展≠文件名时标红；扩展同键或别名重复（如多个 ARTIST / ARTIST+ARTISTS）显示「扩展重复」，清理后每键只保留一条；文件名或扩展字段含繁体字分别显示「文件名繁体」「扩展繁体」，可批量繁转简；MP3 含文件尾 ID3v1 标签（常为 ????）显示「ID3v1 标签」，可批量删除</li>
                            </ul>
                        </section>
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
                                    : `仅含繁体 (${traditionalMetaCount})`
                            }}
                        </NButton>
                        <p
                            v-if="scanResult && (filterTraditionalMeta || issueFilter !== 'all')"
                            class="mtm-selected-count"
                        >
                            显示 {{ displayRows.length }} / {{ scanResult.items.length }} 条
                        </p>
                        <NButton
                            v-if="scanResult && selectedItems.length > 0"
                            block
                            quaternary
                            :disabled="applyingFix"
                            @click="clearSelection"
                        >
                            取消选择
                        </NButton>
                    </section>
                </div>

                <AudioMetaPanel
                    v-if="!batchTask.active && !metaPanelHidden"
                    :file-path="metaPanelFilePath"
                    @saved="onMetaPanelSaved"
                />
            </aside>

            <main class="mtm-main-pane">
                <NSpin :show="applyingFix" class="mtm-main-spin">
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
                            当前筛选条件下没有记录，可切换问题类型或显示全部。
                        </p>
                    </div>
                    <div
                        v-else-if="scanResult"
                        class="meta-mismatch-empty"
                    >
                        <p class="meta-mismatch-empty__title">未发现不一致</p>
                        <p class="meta-mismatch-empty__desc">
                            在 {{ scanResult.stats.parsedFilenameCount }}
                            个可解析文件名中，标签内容与分隔符均已符合规范。
                        </p>
                    </div>
                    <div
                        v-else-if="loading && !applyingFix && !scanResult"
                        class="meta-mismatch-empty"
                    >
                        <p class="meta-mismatch-empty__title">正在扫描</p>
                        <p class="meta-mismatch-empty__desc">请稍候，进度见左下角。</p>
                    </div>
                    <div v-else class="meta-mismatch-empty">
                        <p class="meta-mismatch-empty__title">尚未扫描</p>
                        <p class="meta-mismatch-empty__desc">
                            请在左侧选择扫描源并点击「开始扫描」。
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

.mtm-source-panel .mtm-source-select {
    width: 100%;
    min-width: 0;

    :deep(.n-base-selection) {
        width: 100%;
    }

    :deep(.n-base-selection-label) {
        overflow: hidden;
        text-overflow: ellipsis;
    }
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

.mtm-stats-panel__timing {
    margin: 0;
    font-size: 11px;
    text-align: center;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
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

.mtm-usage-guide {
    padding: 12px 14px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: $surface-panel;
}

.mtm-usage-guide__title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;

    &:not(:first-child) {
        margin-top: 12px;
    }
}

.mtm-usage-guide__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.55;
    opacity: 0.55;
}

.mtm-usage-guide__list {
    margin: 0;
    padding-left: 18px;
    font-size: 11px;
    line-height: 1.55;
    opacity: 0.55;

    li + li {
        margin-top: 6px;
    }
}

.mtm-selected-count {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.55;
}

.mtm-result-bubble-wrap {
    flex-shrink: 0;
    padding: 12px 16px;
}

.mtm-result-bubble {
    padding: 10px 12px 11px;
    border-radius: 14px;
    border: 1px solid $border-subtle;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.mtm-result-bubble--success {
    background: rgba(34, 197, 94, 0.12);
}

.mtm-result-bubble--warning {
    background: rgba(234, 179, 8, 0.14);
}

.mtm-result-bubble__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
}

.mtm-result-bubble__title {
    font-size: 12px;
    font-weight: 600;
}

.mtm-result-bubble__close {
    flex-shrink: 0;
    margin: -2px -4px -2px 0;
}

.mtm-result-bubble__text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-line;
    opacity: 0.88;
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

.mtm-issue-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: rgba(255, 255, 255, 0.02);
}

.mtm-issue-filters__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mtm-issue-filters__title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.mtm-issue-filters__scope {
    font-weight: 500;
    opacity: 0.85;
}

.mtm-issue-filters__hint {
    margin: 0;
    font-size: 10px;
    line-height: 1.4;
    opacity: 0.55;
}

.mtm-issue-group {
    display: flex;
    flex-direction: column;
    gap: 4px;

    & + & {
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid $border-subtle;
    }
}

.mtm-issue-group__title {
    margin: 0 0 2px;
    font-size: 10px;
    font-weight: 600;
    opacity: 0.5;
}

.mtm-issue-group__total {
    margin-left: 4px;
    font-weight: 500;
}

.mtm-issue-item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.mtm-issue-item__filter {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.3;
    text-align: left;

    &:hover:not(:disabled) {
        background: rgba(128, 128, 128, 0.08);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--active {
        border-color: rgba(99, 102, 241, 0.35);
        background: rgba(99, 102, 241, 0.1);
    }
}

.mtm-issue-item__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mtm-issue-item__count {
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.55;
}

.mtm-issue-item__fix {
    flex-shrink: 0;
    min-width: 52px;
}

.mtm-rules-panel {
    padding: 10px 12px;
    border-radius: $radius-panel;
    border: 1px solid $border-subtle;
    background: rgba(255, 255, 255, 0.02);
}

.mtm-rules-panel__title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.65;
}

.mtm-rules-panel__list {
    margin: 0;
    padding-left: 16px;
    font-size: 11px;
    line-height: 1.45;
    opacity: 0.7;

    code {
        font-family: $font-mono;
        font-size: 10px;
    }
}

.mtm-selected-count--warn {
    color: rgb(234, 88, 88);
    opacity: 0.85;
}

:deep(.mtm-issues-cell) {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
}

:deep(.mtm-issue-pill) {
    font-size: 10px;
}

:deep(.mtm-char-bad) {
    color: rgb(234, 88, 88);
    font-weight: 600;
    text-decoration: underline wavy rgba(234, 88, 88, 0.45);
}

:deep(.mtm-write-input) {
    width: 100%;
}

:deep(.mtm-stack-cell) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 2px 0;
}

:deep(.mtm-stack-line) {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    font-size: 10px;
    line-height: 1.35;
}

:deep(.mtm-stack-line--warn .mtm-stack-value) {
    padding: 0 2px;
    border-radius: 3px;
    background: rgba(255, 196, 64, 0.1);
}

:deep(.mtm-stack-line--mismatch .mtm-stack-value) {
    padding: 0 2px;
    border-radius: 3px;
    background: rgba(234, 88, 88, 0.08);
}

:deep(.mtm-stack-line--write) {
    align-items: center;
}

:deep(.mtm-stack-label) {
    flex-shrink: 0;
    width: 3.2em;
    opacity: 0.5;
}

:deep(.mtm-stack-value) {
    flex: 1;
    min-width: 0;
    word-break: break-word;
    font-size: 11px;
}

:deep(.mtm-ext-diff) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

:deep(.mtm-ext-dup-hint) {
    font-size: 11px;
    font-weight: 600;
    color: rgb(234, 179, 8);
    word-break: break-word;
}

:deep(.mtm-ext-adopt) {
    flex-shrink: 0;
    padding: 0 4px;
    border: none;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font-size: 10px;
    line-height: 1.4;
    cursor: pointer;
    opacity: 0.72;

    &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.12);
    }
}

</style>
