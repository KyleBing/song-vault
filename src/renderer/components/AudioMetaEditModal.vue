<script setup lang="ts">
import { ImageOutline, MusicalNotesOutline, TrashOutline } from '@vicons/ionicons5'
import {
    NButton,
    NIcon,
    NInput,
    NModal,
    NScrollbar,
    NTooltip,
    useMessage
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import {
    nativeArtistTitleFromMeta,
    nativeArtistTitleMatchesCommon
} from '@shared/audioFileMeta'
import { plainForIpc } from '@renderer/utils/ipcPayload'
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
const saving = ref(false)
const pickingCover = ref(false)

/** undefined = 未改动；null = 移除；string = 新封面 base64 */
const coverBase64 = ref<string | null | undefined>(undefined)
const coverPreviewUrl = ref<string | null>(null)

const extNativeTags = computed(() => {
    if (!props.meta?.ok) {
        return { artist: '', title: '', artistDiffers: false, titleDiffers: false }
    }
    const native = nativeArtistTitleFromMeta(props.meta)
    const matches = nativeArtistTitleMatchesCommon(props.meta)
    return {
        artist: native.artist,
        title: native.title,
        artistDiffers: Boolean(native.artist) && !matches.artistMatches,
        titleDiffers: Boolean(native.title) && !matches.titleMatches
    }
})

const showExtNativeSection = computed(
    () => extNativeTags.value.artistDiffers || extNativeTags.value.titleDiffers
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

const modalTitle = computed(() => {
    if (!props.filePath) return '编辑标签'
    const name = props.filePath.replace(/^.*[/\\]/, '')
    return name.length > 28 ? `编辑 · ${name.slice(0, 26)}…` : `编辑 · ${name}`
})

function fieldPlaceholder(field: AudioMetaEditFieldDef): string | undefined {
    return field.multiValue ? '多值 ; 分隔' : undefined
}

function resetFromMeta(): void {
    if (!props.meta) {
        form.value = emptyAudioMetaEditForm()
        coverBase64.value = undefined
        coverPreviewUrl.value = null
        return
    }
    form.value = metaInfoToEditForm(props.meta)
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

function onAdoptExtArtist(): void {
    if (!extNativeTags.value.artist) return
    form.value.artist = extNativeTags.value.artist
    message.success('已采用扩展标签中的艺人')
}

function onAdoptExtTitle(): void {
    if (!extNativeTags.value.title) return
    form.value.title = extNativeTags.value.title
    message.success('已采用扩展标签中的曲名')
}

async function onSave(): Promise<void> {
    if (!props.filePath || saving.value) return

    saving.value = true
    try {
        const result = await window.electronAPI.writeAudioMeta(
            plainForIpc({
                filePath: props.filePath,
                form: form.value,
                coverBase64: coverBase64.value
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
        :style="{ width: 'min(520px, 96vw)' }"
        :bordered="false"
        :segmented="{ content: true, footer: true }"
        :mask-closable="false"
        @update:show="emit('update:show', $event)"
        @close="close"
    >
        <NScrollbar style="max-height: min(72vh, 540px)">
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

                <section
                    v-if="showExtNativeSection"
                    class="audio-meta-edit-modal__ext"
                >
                    <p class="audio-meta-edit-modal__ext-title">
                        扩展 / Vorbis 标签与上方常规字段不一致
                    </p>
                    <dl class="audio-meta-edit-modal__dl audio-meta-edit-modal__dl-ext">
                        <template v-if="extNativeTags.artistDiffers">
                            <dt>扩展·艺人</dt>
                            <dd class="audio-meta-edit-modal__ext-row">
                                <span class="audio-meta-edit-modal__ext-value">{{
                                    extNativeTags.artist
                                }}</span>
                                <NButton
                                    size="tiny"
                                    quaternary
                                    @click="onAdoptExtArtist"
                                >
                                    采用
                                </NButton>
                            </dd>
                        </template>
                        <template v-if="extNativeTags.titleDiffers">
                            <dt>扩展·曲名</dt>
                            <dd class="audio-meta-edit-modal__ext-row">
                                <span class="audio-meta-edit-modal__ext-value">{{
                                    extNativeTags.title
                                }}</span>
                                <NButton
                                    size="tiny"
                                    quaternary
                                    @click="onAdoptExtTitle"
                                >
                                    采用
                                </NButton>
                            </dd>
                        </template>
                    </dl>
                </section>

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
            </div>
        </NScrollbar>

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

.audio-meta-edit-modal__body {
    padding-right: 2px;
}

.audio-meta-edit-modal__head {
    display: flex;
    align-items: flex-start;
    gap: 50px;
    margin-bottom: 6px;
}

.audio-meta-edit-modal__ext {
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid $border-subtle;
    background: rgba(255, 196, 64, 0.06);
}

.audio-meta-edit-modal__ext-title {
    margin: 0 0 6px;
    font-size: 11px;
    line-height: 1.35;
    opacity: 0.72;
}

.audio-meta-edit-modal__dl-ext {
    grid-template-columns: max-content minmax(0, 1fr);
}

.audio-meta-edit-modal__ext-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.audio-meta-edit-modal__ext-value {
    flex: 1;
    min-width: 0;
    word-break: break-word;
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
