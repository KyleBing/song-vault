<script setup lang="ts">
import {
    NButton,
    NCard,
    NDataTable,
    NPopconfirm,
    NTabs,
    NTabPane,
    NTag,
    NTooltip,
    useMessage,
    type DataTableColumns
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, h, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import SourceLrcSelect from './SourceLrcSelect.vue'
import type {
    AudioJobItem,
    AudioItemStatus,
    JobResult,
    OrphanLrcItem
} from '@shared/lrcJob'
import {
    allSourcesInSameDir,
    countPendingSourcePick,
    pickSourceLrc,
    type SourceSelection
} from '@shared/sourcePick'
import { dirnameOf } from '@shared/pathLite'
import { joinPath, relativeToRoots } from '@renderer/utils/displayPath'

const props = defineProps<{
    result: JobResult
    searchRoots: string[]
    lrcDirs: string[]
}>()

/** 用户对「多个源歌词」的选择（歌名指定 + 优先源子文件夹） */
const sourceSelection = defineModel<SourceSelection>('sourceSelection', {
    required: true
})

const emit = defineEmits<{
    refresh: []
}>()

const selectedOrphanKeys = defineModel<string[]>('selectedOrphanKeys', {
    default: () => []
})

const message = useMessage()
const activeTab = ref('all')
const copyingAudioPath = ref<string | null>(null)
/** 源歌词选择变更后递增，强制表格重绘 */
const pickRevision = ref(0)

// 布局信息
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 110) // 表格最大高度

const audioStatusMeta: Record<
    AudioItemStatus,
    { label: string; type: 'default' | 'info' | 'success' | 'warning' | 'error' }
> = {
    matched: { label: '已匹配', type: 'success' },
    can_copy: { label: '可复制', type: 'info' },
    no_lrc_source: { label: '无源歌词', type: 'default' },
    source_ambiguous: { label: '待选源', type: 'warning' },
    copied: { label: '已复制', type: 'success' },
    copy_error: { label: '复制失败', type: 'error' }
}

const stats = computed(() => props.result.stats)
const isPreview = computed(() => !props.result.execute)

const pendingPickCount = computed(() =>
    countPendingSourcePick(props.result.audioItems, sourceSelection.value)
)

function resolveSourcePath(row: AudioJobItem): string | undefined {
    return (
        row.selectedSourceLrcPath ??
        (row.sourceLrcPaths?.length
            ? pickSourceLrc(row.songKey, row.sourceLrcPaths, sourceSelection.value) ??
            undefined
            : undefined)
    )
}

function displayStatus(row: AudioJobItem): AudioItemStatus {
    if (row.status === 'source_ambiguous' && resolveSourcePath(row)) {
        return 'can_copy'
    }
    return row.status
}

function onPickSource(row: AudioJobItem, lrcPath: string): void {
    const prev = sourceSelection.value ?? {}
    sourceSelection.value = {
        sourceOverrides: {
            ...(prev.sourceOverrides ?? {}),
            [row.songKey]: lrcPath
        },
        preferredSourceDir: dirnameOf(lrcPath)
    }
    pickRevision.value++

    if (allSourcesInSameDir(row.sourceLrcPaths ?? [])) {
        message.success('已记住该源文件夹，将自动应用于其它同文件夹下的待选歌曲')
    } else {
        message.success('已记住该源子文件夹，将优先用于其它待选歌曲')
    }
}

watch(
    () => props.result,
    () => {
        pickRevision.value++
    }
)

function shortAudio(p: string): string {
    return relativeToRoots(p, props.searchRoots)
}

function shortLrcSource(p: string): string {
    return relativeToRoots(p, props.lrcDirs)
}

function pathCell(full: string, short: string) {
    return h(
        NTooltip,
        { placement: 'top-start', style: { maxWidth: '560px' } },
        {
            trigger: () =>
                h('span', { class: 'path-cell' }, short),
            default: () => full
        }
    )
}

function plannedDestFor(row: AudioJobItem): string | undefined {
    if (row.plannedDestLrcPath) return row.plannedDestLrcPath
    const src = resolveSourcePath(row)
    if (!src) return undefined
    const base = src.replace(/^.*[/\\]/, '')
    return joinPath(row.destDir, base)
}

function canCopyRow(row: AudioJobItem): boolean {
    const src = resolveSourcePath(row)
    const dest = plannedDestFor(row)
    return (
        (displayStatus(row) === 'can_copy' || row.status === 'copy_error') &&
        !!src &&
        !!dest
    )
}

async function copyOne(row: AudioJobItem): Promise<void> {
    const source = resolveSourcePath(row)
    const dest = plannedDestFor(row)
    if (!source || !dest) return

    copyingAudioPath.value = row.audioPath
    try {
        const res = await window.electronAPI.copyLrcToAudio({
            sourceLrcPath: source,
            destLrcPath: dest
        })
        if (res.ok) {
            message.success(`已复制：${row.audioName}`)
            emit('refresh')
        } else {
            message.error(res.message ?? '复制失败')
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg)
    } finally {
        copyingAudioPath.value = null
    }
}


// 音频表格列配置
const audioColumns = computed<DataTableColumns<AudioJobItem>>(() => {
    void pickRevision.value
    void sourceSelection.value

    return [
        {
            title: '音频',
            key: 'audioPath',
            minWidth: 220,
            ellipsis: { tooltip: false },
            render(row) {
                return pathCell(row.audioPath, shortAudio(row.audioPath))
            }
        },
        {
            title: '本目录歌词',
            key: 'localLrcPath',
            width: 230,
            ellipsis: { tooltip: false },
            render(row) {
                if (!row.hasLocalLrc || !row.localLrcPath) return '无'
                return pathCell(
                    row.localLrcPath,
                    shortAudio(row.localLrcPath)
                )
            }
        },
        {
            title: '选择源歌词',
            key: 'sourcePick',
            width: 220,
            render(row) {
                const paths = row.sourceLrcPaths
                if (!paths?.length) return '—'

                if (paths.length === 1) {
                    return pathCell(paths[0], shortLrcSource(paths[0]))
                }

                return h(SourceLrcSelect, {
                    row,
                    lrcDirs: props.lrcDirs,
                    value: resolveSourcePath(row) ?? null,
                    onPick: (v: string) => onPickSource(row, v)
                })
            }
        },
        {
            title: '状态',
            key: 'status',
            width: 88,
            render(row) {
                const meta = audioStatusMeta[displayStatus(row)]
                return h(NTag, { type: meta.type, size: 'small', round: true }, () => meta.label)
            }
        },
        {
            title: '操作',
            key: 'actions',
            width: 108,
            render(row) {
                if (!canCopyRow(row)) return '—'
                const loading = copyingAudioPath.value === row.audioPath
                const src = resolveSourcePath(row)!
                const dest = plannedDestFor(row)!
                return h(
                    NPopconfirm,
                    { onPositiveClick: () => copyOne(row) },
                    {
                        trigger: () =>
                            h(
                                NButton,
                                {
                                    size: 'tiny',
                                    type: 'primary',
                                    loading,
                                    secondary: true
                                },
                                { default: () => '复制歌词' }
                            ),
                        default: () =>
                            `将「${shortLrcSource(src)}」复制到「${shortAudio(dest)}」？`
                    }
                )
            }
        }
    ]
})

// 多余歌词表格列配置
const orphanColumns: DataTableColumns<OrphanLrcItem> = [
    { type: 'selection' },
    {
        title: '歌词文件',
        key: 'lrcPath',
        ellipsis: { tooltip: false },
        render(row) {
            return pathCell(row.lrcPath, shortAudio(row.lrcPath))
        }
    },
    {
        title: '说明',
        key: 'message',
        width: 220
    }
]

// 所有音频数据
const plainAudio = computed(() =>
    props.result.audioItems.map((r) => ({ ...r }))
)

// 已匹配音频数据
const matchedAudio = computed(() =>
    plainAudio.value.filter((r) => r.status === 'matched' || r.status === 'copied')
)

// 可复制音频数据
const canCopyAudio = computed(() =>
    plainAudio.value.filter((r) => displayStatus(r) === 'can_copy')
)

// 缺歌词音频数据
const needLrcAudio = computed(() =>
    plainAudio.value.filter(
        (r) =>
            r.status === 'no_lrc_source' ||
            (r.status === 'source_ambiguous' && !resolveSourcePath(r))
    )
)

// 待选源音频数据
const pickSourceAudio = computed(() =>
    plainAudio.value.filter((r) => r.status === 'source_ambiguous')
)

// 多余歌词数据
const plainOrphan = computed(() =>
    props.result.orphanLrcItems.map((r) => ({ ...r, key: r.lrcPath }))
)
</script>





<template>
    <div class="table-container">
        <NTabs v-model:value="activeTab" type="line" class="result-tabs">
            <NTabPane name="all" :tab="`全部 (${stats.audioTotal})`">
                <div class="tab-pane-body">
                    <NDataTable :key="`all-${pickRevision}`" :columns="audioColumns" :data="plainAudio"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>

            <NTabPane name="matched" :tab="`已匹配 (${matchedAudio.length})`">
                <div class="tab-pane-body">
                    <NDataTable :key="`matched-${pickRevision}`" :columns="audioColumns" :data="matchedAudio"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>

            <NTabPane name="copy" :tab="`待复制 (${canCopyAudio.length})`">
                <div class="tab-pane-body">
                    <NDataTable :key="`copy-${pickRevision}`" :columns="audioColumns" :data="canCopyAudio"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>

            <NTabPane name="pick" :tab="`待选源 (${pickSourceAudio.length})`">
                <div class="tab-pane-body">
                    <NDataTable :key="`pick-${pickRevision}`" :columns="audioColumns" :data="pickSourceAudio"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>

            <NTabPane name="missing" :tab="`缺歌词 (${needLrcAudio.length})`">
                <div class="tab-pane-body">
                    <NDataTable :key="`missing-${pickRevision}`" :columns="audioColumns" :data="needLrcAudio"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>

            <NTabPane name="orphan" :tab="`多余 (${stats.orphanLrc})`">
                <div class="tab-pane-body">
                    <NDataTable v-model:checked-row-keys="selectedOrphanKeys" :columns="orphanColumns"
                        :data="plainOrphan" :row-key="(row: { key: string }) => row.key"
                        :max-height="maxHeightForTable" size="small" striped />
                </div>
            </NTabPane>
        </NTabs>
    </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;


.table-container {
    padding: 0 10px;
}


.results-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 600;
    line-height: 1.3;
}

.results-title {
    font-size: 14px;
}

.scan-stats {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.55;
}

.tabs-fill-host--fill {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.result-tabs {
    margin-top: 2px;

    &--fill {
        flex: 1;
        min-height: 0;
        height: 100%;
        display: flex;
        flex-direction: column;

        :deep(.n-tabs) {
            flex: 1;
            min-height: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        :deep(.n-tabs-nav) {
            flex-shrink: 0;
        }

        :deep(.n-tabs-pane-wrapper) {
            flex: 1 1 0;
            min-height: 0;
            overflow: hidden;
        }

        :deep(.n-tab-pane) {
            height: 100%;
            padding-top: 8px !important;
            box-sizing: border-box;
        }
    }
}

.tab-pane-body {
    height: 100%;
    min-height: 0;
}

.path-cell {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: $font-mono;
    font-size: 12px;
}
</style>
