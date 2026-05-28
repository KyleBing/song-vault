<script setup lang="ts">
import { Add } from '@vicons/ionicons5'
import {
    NButton,
    NEmpty,
    NIcon,
    NInput,
    NModal,
    NTooltip,
    NTree,
    useMessage
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { PathFilterRule } from '@shared/pathFilters'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import { useLazyDirTree } from '@renderer/composables/useLazyDirTree'
import { relativeToRoots } from '@renderer/utils/displayPath'

const props = defineProps<{
    show: boolean
    browseRoots: string[]
    pathFilterRules: PathFilterRule[]
    /** 打开时默认选中的目录 */
    initialDir?: string | null
    title?: string
    positiveText?: string
}>()

const message = useMessage()

const emit = defineEmits<{
    'update:show': [value: boolean]
    confirm: [destDir: string]
}>()

const roots = computed(() => [...props.browseRoots])
const filtersForApi = computed(() =>
    pathFilterRulesForSave(props.pathFilterRules)
)

const {
    treeData,
    expandedKeys,
    rebuildTreeRoots,
    onLoadTreeNode,
    onUpdateExpandedKeys,
    refreshNode,
    mergeExpanded,
    ensurePathLoaded
} = useLazyDirTree({
    roots,
    browseRoots: roots,
    filtersForApi
})

const selectedKeys = ref<string[]>([])

const selectedDir = computed(() => selectedKeys.value[0] ?? null)

const selectedDirLabel = computed(() => {
    if (!selectedDir.value) return ''
    return (
        relativeToRoots(selectedDir.value, props.browseRoots) ||
        selectedDir.value
    )
})

function onSelectKeys(keys: string[]): void {
    selectedKeys.value = keys.length ? [keys[0]!] : []
}

function close(): void {
    emit('update:show', false)
}

function onPositiveClick(): boolean {
    if (!selectedDir.value) {
        message.warning('请选择目标文件夹')
        return false
    }
    emit('confirm', selectedDir.value)
    close()
    return true
}

const namePromptVisible = ref(false)
const namePromptTitle = ref('')
const namePromptValue = ref('')
let namePromptResolve: ((value: string | null) => void) | null = null

function promptName(title: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
        namePromptTitle.value = title
        namePromptValue.value = defaultValue
        namePromptResolve = resolve
        namePromptVisible.value = true
    })
}

function finishNamePrompt(value: string | null): void {
    const resolve = namePromptResolve
    namePromptResolve = null
    resolve?.(value)
}

function onNamePromptPositive(): boolean {
    const trimmed = namePromptValue.value.trim()
    if (!trimmed) {
        message.warning('名称不能为空')
        return false
    }
    namePromptVisible.value = false
    finishNamePrompt(trimmed)
    return true
}

function onNamePromptNegative(): void {
    namePromptVisible.value = false
    finishNamePrompt(null)
}

/** 在选中目录下新建子文件夹并选为移动目标 */
async function createSubdir(): Promise<void> {
    if (!selectedDir.value) {
        message.warning('请先选择作为父级的文件夹')
        return
    }
    const name = await promptName('请输入新文件夹名称')
    if (!name) return
    try {
        const { path: created } = await window.electronAPI.browseCreateDir({
            parentPath: selectedDir.value,
            name,
            browseRoots: props.browseRoots
        })
        message.success('文件夹已创建')
        await refreshNode(selectedDir.value)
        mergeExpanded(selectedDir.value)
        selectedKeys.value = [created]
        await ensurePathLoaded(created)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg)
    }
}

async function initTree(): Promise<void> {
    rebuildTreeRoots()
    const initial = props.initialDir
    if (initial && props.browseRoots.length > 0) {
        selectedKeys.value = [initial]
        await ensurePathLoaded(initial)
    } else {
        selectedKeys.value = []
    }
}

watch(
    () => props.show,
    (visible) => {
        if (visible) void initTree()
    }
)
</script>

<template>
    <NModal
        v-model:show="namePromptVisible"
        preset="dialog"
        :title="namePromptTitle"
        positive-text="确定"
        negative-text="取消"
        :mask-closable="false"
        @positive-click="onNamePromptPositive"
        @negative-click="onNamePromptNegative"
        @close="onNamePromptNegative"
    >
        <NInput
            v-model:value="namePromptValue"
            placeholder="请输入名称"
            autofocus
            @keyup.enter="onNamePromptPositive"
        />
    </NModal>

    <NModal
        :show="show"
        preset="dialog"
        :title="title ?? '选择目标文件夹'"
        :positive-text="positiveText ?? '确定'"
        negative-text="取消"
        :mask-closable="false"
        class="browse-dir-picker-modal"
        @update:show="emit('update:show', $event)"
        @positive-click="onPositiveClick"
        @negative-click="close"
        @close="close"
    >
        <p v-if="selectedDir" class="picker-hint">
            将移动到：<strong>{{ selectedDirLabel }}</strong>
        </p>
        <p v-else class="picker-hint picker-hint--muted">
            请在目录树中选择目标文件夹
        </p>
        <div v-if="browseRoots.length" class="picker-toolbar">
            <NTooltip>
                <template #trigger>
                    <NButton
                        quaternary
                        size="tiny"
                        :disabled="!selectedDir"
                        @click="createSubdir"
                    >
                        <template #icon>
                            <NIcon :size="16"><Add /></NIcon>
                        </template>
                        新建子文件夹
                    </NButton>
                </template>
                在选中的文件夹下创建子目录并设为移动目标
            </NTooltip>
        </div>
        <div class="picker-tree-wrap">
            <NEmpty
                v-if="!browseRoots.length"
                size="small"
                description="未配置音频搜索目标"
            />
            <NTree
                v-else
                block-line
                selectable
                :data="treeData"
                :expanded-keys="expandedKeys"
                :selected-keys="selectedKeys"
                :on-load="onLoadTreeNode"
                @update:expanded-keys="onUpdateExpandedKeys"
                @update:selected-keys="onSelectKeys"
            />
        </div>
    </NModal>
</template>

<style lang="scss" scoped>
.picker-hint {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.4;

    strong {
        font-weight: 600;
        word-break: break-all;
    }
}

.picker-hint--muted {
    opacity: 0.55;
}

.picker-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.picker-tree-wrap {
    max-height: min(52vh, 420px);
    overflow: auto;
    padding: 4px 0;
    border: 1px solid rgba(128, 128, 128, 0.2);
    border-radius: 6px;

    :deep(.n-tree) {
        font-size: 13px;
        padding: 6px 8px;
    }
}
</style>
