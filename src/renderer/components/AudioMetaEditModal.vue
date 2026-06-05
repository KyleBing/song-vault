<script setup lang="ts">
import { AddOutline, ImageOutline, MusicalNotesOutline, TrashOutline } from '@vicons/ionicons5'
import {
    NButton,
    NIcon,
    NInput,
    NModal,
    NTabPane,
    NTabs,
    NTooltip,
    useMessage
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import {
    emptyExtraEditState,
    familyTokenForTagKey,
    metaInfoToExtraEditState,
    normalizeNativeTagKey,
    type AudioMetaExtraEditState,
    type AudioMetaExtraTagRow
} from '@shared/audioMetaExtraEdit'
import { plainForIpc } from '@renderer/utils/ipcPayload'
import { fileExtensionLower } from '@shared/pathLite'
import {
    AUDIO_META_EDIT_FIELDS,
    emptyAudioMetaEditForm,
    metaInfoToEditForm,
    parseArtistTitleFromFilePath,
    type AudioMetaEditFieldDef,
    type AudioMetaEditForm
} from '@shared/audioMetaEdit'

const props = defineProps<{
    show: boolean
    filePath: string | null
    meta: AudioFileMetaInfo | null
}>()

const emit = defineEmits<{
    'update:show': [value: boolean]
    saved: []
}>()

const message = useMessage()

const form = ref<AudioMetaEditForm>(emptyAudioMetaEditForm())
const extraEdit = ref<AudioMetaExtraEditState>(emptyExtraEditState())
const touchedExtensionFamilies = ref(new Set<string>())
const activeTab = ref<'regular' | 'extended' | 'other'>('regular')
const saving = ref(false)
const pickingCover = ref(false)

const newExtTagKey = ref('')
const newExtTagValue = ref('')
const newOtherTagKey = ref('')
const newOtherTagValue = ref('')

/** undefined = 未改动；null = 移除；string = 新封面 base64 */
const coverBase64 = ref<string | null | undefined>(undefined)
const coverPreviewUrl = ref<string | null>(null)

const fileExt = computed(() =>
    props.filePath ? fileExtensionLower(props.filePath) : ''
)

const HEAD_KEYS = new Set<keyof AudioMetaEditForm>([
    'title',
    'artist',
    'album',
    'albumartist'
])
const WIDE_KEYS = new Set<keyof AudioMetaEditForm>(['comment', 'lyrics'])

const headFields = computed(() =>
    AUDIO_META_EDIT_FIELDS.filter((f) => HEAD_KEYS.has(f.key))
)
const gridFields = computed(() =>
    AUDIO_META_EDIT_FIELDS.filter(
        (f) =>
            !HEAD_KEYS.has(f.key) &&
            !WIDE_KEYS.has(f.key) &&
            f.key !== 'trackNo' &&
            f.key !== 'trackOf' &&
            f.key !== 'diskNo' &&
            f.key !== 'diskOf'
    )
)
const wideFields = computed(() =>
    AUDIO_META_EDIT_FIELDS.filter((f) => WIDE_KEYS.has(f.key))
)

const visibleExtendedRows = computed(() =>
    extraEdit.value.extendedNative.filter((row) => !row.removed)
)
const visibleOtherRows = computed(() =>
    extraEdit.value.otherExtra.filter((row) => !row.removed)
)

const modalTitle = computed(() => {
    if (!props.filePath) return '编辑标签'
    const name = props.filePath.replace(/^.*[/\\]/, '')
    return name.length > 28 ? `编辑 · ${name.slice(0, 26)}…` : `编辑 · ${name}`
})

const extendedTabHint = computed(() =>
    fileExt.value === 'mp3'
        ? 'ID3v2 原生标签，可编辑或删除单条'
        : 'Vorbis 原生标签，可编辑或删除单条'
)

function fieldPlaceholder(field: AudioMetaEditFieldDef): string | undefined {
    return field.multiValue ? '多值 ; 分隔' : undefined
}

function resetFromMeta(): void {
    touchedExtensionFamilies.value = new Set()
    activeTab.value = 'regular'
    newExtTagKey.value = ''
    newExtTagValue.value = ''
    newOtherTagKey.value = ''
    newOtherTagValue.value = ''

    if (!props.meta) {
        form.value = emptyAudioMetaEditForm()
        extraEdit.value = emptyExtraEditState()
        coverBase64.value = undefined
        coverPreviewUrl.value = null
        return
    }

    form.value = metaInfoToEditForm(props.meta)
    extraEdit.value = props.filePath
        ? metaInfoToExtraEditState(props.meta, props.filePath)
        : emptyExtraEditState()
    coverBase64.value = undefined
    coverPreviewUrl.value = props.meta.coverDataUrl ?? null
}

watch(
    () => props.show,
    (visible) => {
        if (visible) resetFromMeta()
    }
)

function close(): void {
    emit('update:show', false)
}

function markExtensionFamily(tagKey: string): void {
    const token = familyTokenForTagKey(tagKey)
    if (!token) return
    const next = new Set(touchedExtensionFamilies.value)
    next.add(token)
    touchedExtensionFamilies.value = next
}

/** 编辑/新增时移除同族别名行（如 ARTIST + ARTISTS），保留当前键 */
function removeOtherAliasRowsInFamily(tagKey: string, keepRowKey: string): void {
    const token = familyTokenForTagKey(tagKey)
    const keepNormalized = normalizeNativeTagKey(tagKey)
    if (!token) return

    const rows = extraEdit.value.extendedNative
    let changed = false
    const nextRows = rows.map((row) => {
        if (row.rowKey === keepRowKey || row.removed) return row
        if (familyTokenForTagKey(row.tagKey) !== token) return row
        if (normalizeNativeTagKey(row.tagKey) === keepNormalized) return row
        changed = true
        return { ...row, removed: true }
    })
    if (changed) {
        extraEdit.value = { ...extraEdit.value, extendedNative: nextRows }
    }
}

function updateExtraRow(
    list: 'extendedNative' | 'otherExtra',
    rowKey: string,
    patch: Partial<AudioMetaExtraTagRow>
): void {
    const rows = extraEdit.value[list]
    const index = rows.findIndex((row) => row.rowKey === rowKey)
    if (index < 0) return
    const current = rows[index]!
    if (list === 'extendedNative' && patch.value !== undefined) {
        markExtensionFamily(current.tagKey)
    }
    const nextRows = [...rows]
    nextRows[index] = { ...current, ...patch }
    extraEdit.value = { ...extraEdit.value, [list]: nextRows }
    if (list === 'extendedNative' && patch.value !== undefined) {
        removeOtherAliasRowsInFamily(current.tagKey, rowKey)
    }
}

function removeExtraRow(list: 'extendedNative' | 'otherExtra', rowKey: string): void {
    const rows = extraEdit.value[list]
    const index = rows.findIndex((row) => row.rowKey === rowKey)
    if (index < 0) return
    const current = rows[index]!
    if (list === 'extendedNative') {
        markExtensionFamily(current.tagKey)
    }
    updateExtraRow(list, rowKey, { removed: true })
}

function addExtendedRow(): void {
    const tagKey = newExtTagKey.value.trim()
    const value = newExtTagValue.value.trim()
    if (!tagKey || !value) {
        message.warning('请填写键名与值')
        return
    }
    markExtensionFamily(tagKey)
    const rowKey = `new-ext-${Date.now()}-${tagKey}`
    extraEdit.value = {
        ...extraEdit.value,
        extendedNative: [
            ...extraEdit.value.extendedNative,
            {
                rowKey,
                label: tagKey,
                tagKey,
                source: 'native',
                value,
                removed: false
            }
        ]
    }
    removeOtherAliasRowsInFamily(tagKey, rowKey)
    newExtTagKey.value = ''
    newExtTagValue.value = ''
}

function addOtherRow(): void {
    const tagKey = newOtherTagKey.value.trim()
    const value = newOtherTagValue.value.trim()
    if (!tagKey || !value) {
        message.warning('请填写键名与值')
        return
    }
    extraEdit.value = {
        ...extraEdit.value,
        otherExtra: [
            ...extraEdit.value.otherExtra,
            {
                rowKey: `new-other-${Date.now()}-${tagKey}`,
                label: tagKey,
                tagKey,
                source: 'common',
                value,
                removed: false
            }
        ]
    }
    newOtherTagKey.value = ''
    newOtherTagValue.value = ''
}

async function onPickCover(): Promise<void> {
    pickingCover.value = true
    try {
        const result = await window.electronAPI.pickCoverImage()
        if (!result.ok) {
            if (result.message && result.message !== '未选择图片') {
                message.warning(result.message)
            }
            return
        }
        coverBase64.value = result.base64 ?? null
        coverPreviewUrl.value = result.dataUrl ?? null
    } finally {
        pickingCover.value = false
    }
}

function onRemoveCover(): void {
    coverBase64.value = null
    coverPreviewUrl.value = null
}

function onFillFromFilename(): void {
    if (!props.filePath) return
    const parsed = parseArtistTitleFromFilePath(props.filePath)
    form.value.artist = parsed.artist
    form.value.title = parsed.title
    if (parsed.split) {
        message.success('已从文件名填充艺人与曲名')
    } else {
        message.info('文件名未识别出「艺人 - 曲名」格式，已填入曲名')
    }
}

async function onSave(): Promise<void> {
    if (!props.filePath || saving.value) return

    saving.value = true
    try {
        const result = await window.electronAPI.writeAudioMeta(
            plainForIpc({
                filePath: props.filePath,
                form: form.value,
                coverBase64:
                    coverBase64.value === null ? null : coverBase64.value,
                extendedNative: extraEdit.value.extendedNative,
                otherExtra: extraEdit.value.otherExtra,
                touchedExtensionFamilies: [...touchedExtensionFamilies.value]
            })
        )
        if (!result.ok) {
            message.error(result.message ?? '保存失败')
            return
        }
        message.success('已保存')
        emit('saved')
        close()
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        message.error(msg || '保存失败')
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <NModal
        :show="show"
        preset="card"
        :title="modalTitle"
        class="audio-meta-edit-modal"
        :style="{ width: 'min(580px, 96vw)' }"
        :bordered="false"
        :segmented="{ content: true, footer: true }"
        :mask-closable="false"
        @update:show="emit('update:show', $event)"
        @close="close"
    >
        <div class="audio-meta-edit-modal__scroll">
            <div class="audio-meta-edit-modal__body">
                <div class="audio-meta-edit-modal__head">
                    <div class="audio-meta-edit-modal__cover-block">
                        <button
                            type="button"
                            class="audio-meta-edit-modal__cover-btn"
                            :disabled="pickingCover"
                            title="点击更换封面"
                            @click="onPickCover"
                        >
                            <img
                                v-if="coverPreviewUrl"
                                class="audio-meta-edit-modal__cover"
                                :src="coverPreviewUrl"
                                alt=""
                            />
                            <span
                                v-else
                                class="audio-meta-edit-modal__cover audio-meta-edit-modal__cover-fallback"
                            >
                                <NIcon :size="22"><MusicalNotesOutline /></NIcon>
                            </span>
                        </button>
                        <div class="audio-meta-edit-modal__cover-actions">
                            <NTooltip>
                                <template #trigger>
                                    <NButton
                                        quaternary
                                        circle
                                        size="small"
                                        :loading="pickingCover"
                                        @click="onPickCover"
                                    >
                                        <template #icon>
                                            <NIcon :size="14"><ImageOutline /></NIcon>
                                        </template>
                                    </NButton>
                                </template>
                                换封面
                            </NTooltip>
                            <NTooltip v-if="coverPreviewUrl">
                                <template #trigger>
                                    <NButton
                                        quaternary
                                        circle
                                        size="small"
                                        @click="onRemoveCover"
                                    >
                                        <template #icon>
                                            <NIcon :size="14"><TrashOutline /></NIcon>
                                        </template>
                                    </NButton>
                                </template>
                                移除
                            </NTooltip>
                        </div>
                    </div>

                    <dl class="audio-meta-edit-modal__dl audio-meta-edit-modal__dl-head">
                        <template v-for="field in headFields" :key="field.key">
                            <dt>{{ field.label }}</dt>
                            <dd>
                                <NInput
                                    v-model:value="form[field.key]"
                                    size="small"
                                    :placeholder="fieldPlaceholder(field)"
                                />
                            </dd>
                        </template>
                    </dl>
                </div>

                <NTabs v-model:value="activeTab" size="small" class="audio-meta-edit-modal__tabs">
                    <NTabPane name="regular" tab="常规">
                        <dl class="audio-meta-edit-modal__dl">
                            <template v-for="field in gridFields" :key="field.key">
                                <dt>{{ field.label }}</dt>
                                <dd>
                                    <NInput
                                        v-model:value="form[field.key]"
                                        size="small"
                                        :placeholder="fieldPlaceholder(field)"
                                    />
                                </dd>
                            </template>
                        </dl>

                        <div class="audio-meta-edit-modal__track-row">
                            <label class="audio-meta-edit-modal__track-item">
                                <span>曲号</span>
                                <NInput v-model:value="form.trackNo" size="small" />
                            </label>
                            <label class="audio-meta-edit-modal__track-item">
                                <span>曲共</span>
                                <NInput v-model:value="form.trackOf" size="small" />
                            </label>
                            <label class="audio-meta-edit-modal__track-item">
                                <span>碟号</span>
                                <NInput v-model:value="form.diskNo" size="small" />
                            </label>
                            <label class="audio-meta-edit-modal__track-item">
                                <span>碟共</span>
                                <NInput v-model:value="form.diskOf" size="small" />
                            </label>
                        </div>

                        <dl class="audio-meta-edit-modal__dl audio-meta-edit-modal__dl-wide">
                            <template v-for="field in wideFields" :key="field.key">
                                <dt>{{ field.label }}</dt>
                                <dd>
                                    <NInput
                                        v-model:value="form[field.key]"
                                        size="small"
                                        type="textarea"
                                        :autosize="{ minRows: 1, maxRows: 4 }"
                                        :placeholder="fieldPlaceholder(field)"
                                    />
                                </dd>
                            </template>
                        </dl>
                    </NTabPane>

                    <NTabPane name="extended" tab="扩展">
                        <p class="audio-meta-edit-modal__tab-hint">
                            {{ extendedTabHint }}
                        </p>
                        <div
                            v-if="visibleExtendedRows.length === 0"
                            class="audio-meta-edit-modal__empty"
                        >
                            无扩展标签
                        </div>
                        <ul v-else class="audio-meta-edit-modal__extra-list">
                            <li
                                v-for="row in visibleExtendedRows"
                                :key="row.rowKey"
                                class="audio-meta-edit-modal__extra-item"
                            >
                                <div class="audio-meta-edit-modal__extra-meta">
                                    <span class="audio-meta-edit-modal__extra-label">{{
                                        row.label
                                    }}</span>
                                    <span class="audio-meta-edit-modal__extra-key">{{
                                        row.tagKey
                                    }}</span>
                                </div>
                                <NInput
                                    class="audio-meta-edit-modal__extra-input"
                                    size="small"
                                    :value="row.value"
                                    @update:value="
                                        (value) =>
                                            updateExtraRow('extendedNative', row.rowKey, {
                                                value
                                            })
                                    "
                                />
                                <NTooltip>
                                    <template #trigger>
                                        <NButton
                                            quaternary
                                            circle
                                            size="tiny"
                                            @click="removeExtraRow('extendedNative', row.rowKey)"
                                        >
                                            <template #icon>
                                                <NIcon :size="14"><TrashOutline /></NIcon>
                                            </template>
                                        </NButton>
                                    </template>
                                    删除此项
                                </NTooltip>
                            </li>
                        </ul>
                        <div class="audio-meta-edit-modal__add-row">
                            <NInput
                                v-model:value="newExtTagKey"
                                size="small"
                                placeholder="键名（如 ARTIST）"
                            />
                            <NInput
                                v-model:value="newExtTagValue"
                                size="small"
                                placeholder="值"
                            />
                            <NButton size="small" @click="addExtendedRow">
                                <template #icon>
                                    <NIcon :size="14"><AddOutline /></NIcon>
                                </template>
                                添加
                            </NButton>
                        </div>
                    </NTabPane>

                    <NTabPane name="other" tab="其它">
                        <p class="audio-meta-edit-modal__tab-hint">
                            MusicBrainz、未纳入常规表单的 common 字段及其它原生标签
                        </p>
                        <div
                            v-if="visibleOtherRows.length === 0"
                            class="audio-meta-edit-modal__empty"
                        >
                            无其它元数据
                        </div>
                        <ul v-else class="audio-meta-edit-modal__extra-list">
                            <li
                                v-for="row in visibleOtherRows"
                                :key="row.rowKey"
                                class="audio-meta-edit-modal__extra-item"
                            >
                                <div class="audio-meta-edit-modal__extra-meta">
                                    <span class="audio-meta-edit-modal__extra-label">{{
                                        row.label
                                    }}</span>
                                    <span class="audio-meta-edit-modal__extra-key">{{
                                        row.tagKey
                                    }}</span>
                                </div>
                                <NInput
                                    class="audio-meta-edit-modal__extra-input"
                                    size="small"
                                    :value="row.value"
                                    @update:value="
                                        (value) =>
                                            updateExtraRow('otherExtra', row.rowKey, { value })
                                    "
                                />
                                <NTooltip>
                                    <template #trigger>
                                        <NButton
                                            quaternary
                                            circle
                                            size="tiny"
                                            @click="removeExtraRow('otherExtra', row.rowKey)"
                                        >
                                            <template #icon>
                                                <NIcon :size="14"><TrashOutline /></NIcon>
                                            </template>
                                        </NButton>
                                    </template>
                                    删除此项
                                </NTooltip>
                            </li>
                        </ul>
                        <div class="audio-meta-edit-modal__add-row">
                            <NInput
                                v-model:value="newOtherTagKey"
                                size="small"
                                placeholder="键名"
                            />
                            <NInput
                                v-model:value="newOtherTagValue"
                                size="small"
                                placeholder="值"
                            />
                            <NButton size="small" @click="addOtherRow">
                                <template #icon>
                                    <NIcon :size="14"><AddOutline /></NIcon>
                                </template>
                                添加
                            </NButton>
                        </div>
                    </NTabPane>
                </NTabs>
            </div>
        </div>

        <template #footer>
            <div class="audio-meta-edit-modal__footer">
                <NButton
                    size="small"
                    :disabled="!filePath || saving"
                    @click="onFillFromFilename"
                >
                    从文件名填充 meta
                </NButton>
                <div class="audio-meta-edit-modal__footer-actions">
                    <NButton size="small" :disabled="saving" @click="close">
                        取消
                    </NButton>
                    <NButton
                        type="primary"
                        size="small"
                        :loading="saving"
                        @click="onSave"
                    >
                        保存
                    </NButton>
                </div>
            </div>
        </template>
    </NModal>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.audio-meta-edit-modal {
    :deep(.n-card-header) {
        padding: 10px 14px;
        font-size: 14px;
    }

    :deep(.n-card-header__main) {
        font-size: 14px;
    }

    :deep(.n-card__content) {
        padding: 8px 12px 10px;
    }

    :deep(.n-card__footer) {
        padding: 8px 12px;
    }
}

.audio-meta-edit-modal__scroll {
    max-height: min(72vh, 560px);
    overflow: auto;
    scrollbar-gutter: stable;
}

.audio-meta-edit-modal__body {
    padding-right: 4px;
}

.audio-meta-edit-modal__head {
    display: flex;
    align-items: flex-start;
    gap: 50px;
    margin-bottom: 8px;
}

.audio-meta-edit-modal__tabs {
    :deep(.n-tabs-nav) {
        margin-bottom: 8px;
    }
}

.audio-meta-edit-modal__tab-hint {
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.65;
}

.audio-meta-edit-modal__empty {
    margin: 0 0 10px;
    font-size: 12px;
    opacity: 0.5;
}

.audio-meta-edit-modal__extra-list {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.audio-meta-edit-modal__extra-item {
    display: grid;
    grid-template-columns: minmax(88px, 120px) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
}

.audio-meta-edit-modal__extra-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.audio-meta-edit-modal__extra-label {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    word-break: break-word;
}

.audio-meta-edit-modal__extra-key {
    font-size: 10px;
    opacity: 0.55;
    word-break: break-all;
}

.audio-meta-edit-modal__extra-input {
    min-width: 0;
}

.audio-meta-edit-modal__add-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
    gap: 8px;
    align-items: center;
}

.audio-meta-edit-modal__cover-block {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.audio-meta-edit-modal__cover-btn {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    line-height: 0;

    &:disabled {
        cursor: wait;
        opacity: 0.7;
    }
}

.audio-meta-edit-modal__cover {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 3px;
    border: 1px solid $border-subtle;
    background: rgba(128, 128, 128, 0.12);
}

.audio-meta-edit-modal__cover-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid $border-subtle;
    background: var(--app-cover-placeholder-bg);
    color: var(--app-cover-placeholder-icon);
}

.audio-meta-edit-modal__cover-actions {
    display: flex;
    gap: 0;
}

.audio-meta-edit-modal__dl {
    margin: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 6px;
    align-items: center;
    font-size: 12px;
    line-height: 1.3;

    dt {
        margin: 0;
        opacity: 0.58;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 5.5em;
    }

    dd {
        margin: 0;
        min-width: 0;
    }

    :deep(.n-input) {
        font-size: 12px;
    }
}

.audio-meta-edit-modal__dl-head {
    flex: 1;
    min-width: 0;
    grid-template-columns: max-content minmax(0, 1fr);
}

.audio-meta-edit-modal__dl-wide {
    margin-top: 4px;
    grid-template-columns: max-content minmax(0, 1fr);

    dd {
        grid-column: 2;
    }
}

.audio-meta-edit-modal__track-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-top: 4px;
}

.audio-meta-edit-modal__track-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 11px;
    opacity: 0.58;

    :deep(.n-input) {
        font-size: 12px;
    }
}

.audio-meta-edit-modal__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.audio-meta-edit-modal__footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
}
</style>
