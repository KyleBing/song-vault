<script setup lang="ts">
import { NModal, NScrollbar, NSpin, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'
import {
    closeLyricsViewModal,
    lyricsViewModalState
} from '@renderer/composables/useLyricsViewModal'
import {
    parseLyricsForDisplay,
    type NeteaseLyricChunk,
    type ParsedLyricsLine
} from '@renderer/utils/parseLyricsDisplay'

const message = useMessage()
const { open: openCoverLightbox } = useAudioCoverLightbox()

function onMetaAvatarClick(chunk: NeteaseLyricChunk): void {
    if (!chunk.imageUrl) {
        return
    }
    openCoverLightbox(chunk.imageUrl, {
        caption: chunk.text.trim() || undefined
    })
}

const loading = ref(false)
const text = ref('')
const error = ref('')

const displayLines = computed((): ParsedLyricsLine[] => {
    if (!text.value) {
        return []
    }
    return parseLyricsForDisplay(text.value)
})

const hasMetaLines = computed(() =>
    displayLines.value.some((line) => line.kind === 'meta' || line.kind === 'tag')
)

function isLastHeaderMetaLine(index: number): boolean {
    const line = displayLines.value[index]
    if (line?.kind !== 'meta' && line?.kind !== 'tag') {
        return false
    }
    const next = displayLines.value[index + 1]
    return !next || (next.kind !== 'meta' && next.kind !== 'tag')
}

const modalTitle = computed(() => {
    const filePath = lyricsViewModalState.lrcPath
    if (!filePath) return '歌词'
    const name = filePath.replace(/^.*[/\\]/, '')
    return name.length > 36 ? `${name.slice(0, 34)}…` : name
})

async function loadLyrics(filePath: string): Promise<void> {
    loading.value = true
    text.value = ''
    error.value = ''
    try {
        const res = await window.electronAPI.readTextFile(filePath)
        if (res.ok) {
            text.value = res.text ?? ''
            if (!text.value.trim()) {
                error.value = '歌词文件为空'
            }
            return
        }
        error.value = res.message ?? '无法读取歌词'
        message.error(error.value)
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        message.error(error.value)
    } finally {
        loading.value = false
    }
}

watch(
    () => lyricsViewModalState.show,
    (show) => {
        if (!show) {
            text.value = ''
            error.value = ''
            loading.value = false
            return
        }
        const filePath = lyricsViewModalState.lrcPath.trim()
        if (filePath) {
            void loadLyrics(filePath)
        }
    }
)

function onShowUpdate(value: boolean): void {
    if (!value) {
        closeLyricsViewModal()
    }
}
</script>

<template>
    <NModal
        :show="lyricsViewModalState.show"
        preset="card"
        :title="modalTitle"
        class="lyrics-view-modal"
        :style="{ width: 'min(640px, 92vw)' }"
        :mask-closable="true"
        @update:show="onShowUpdate"
    >
        <p v-if="lyricsViewModalState.lrcPath" class="lyrics-view-modal__path">
            {{ lyricsViewModalState.lrcPath }}
        </p>
        <NSpin :show="loading">
            <NScrollbar class="lyrics-view-modal__scroll" trigger="none">
                <div
                    v-if="text"
                    class="lyrics-view-modal__content"
                    :class="{ 'lyrics-view-modal__content--has-meta': hasMetaLines }"
                >
                    <template
                        v-for="(line, index) in displayLines"
                        :key="index"
                    >
                        <p
                            v-if="line.kind === 'meta'"
                            class="lyrics-view-modal__meta lyrics-view-modal__header-meta"
                            :class="{ 'lyrics-view-modal__header-meta--last': isLastHeaderMetaLine(index) }"
                        >
                            <template
                                v-for="(chunk, chunkIndex) in line.chunks"
                                :key="chunkIndex"
                            >
                                <img
                                    v-if="chunk.imageUrl"
                                    class="lyrics-view-modal__meta-avatar"
                                    :src="chunk.imageUrl"
                                    alt=""
                                    title="点击查看大图"
                                    loading="lazy"
                                    @click.stop="onMetaAvatarClick(chunk)"
                                >
                                <span
                                    class="lyrics-view-modal__meta-text"
                                    :class="{
                                        'lyrics-view-modal__meta-text--artist': chunk.artistId
                                    }"
                                >{{ chunk.text }}</span>
                            </template>
                        </p>
                        <p
                            v-else-if="line.kind === 'tag'"
                            class="lyrics-view-modal__meta lyrics-view-modal__header-meta"
                            :class="{ 'lyrics-view-modal__header-meta--last': isLastHeaderMetaLine(index) }"
                        >
                            <span class="lyrics-view-modal__tag-label">{{ line.label }}:</span>
                            <span class="lyrics-view-modal__meta-text">{{ line.value }}</span>
                        </p>
                        <p
                            v-else
                            class="lyrics-view-modal__text-line"
                        >
                            <template
                                v-for="(segment, segmentIndex) in line.segments"
                                :key="segmentIndex"
                            >
                                <span
                                    v-if="segment.kind === 'time'"
                                    class="lyrics-view-modal__time"
                                >{{ segment.value }}</span>
                                <span
                                    v-else
                                    class="lyrics-view-modal__lyric-text"
                                >{{ segment.value }}</span>
                            </template>
                        </p>
                    </template>
                </div>
                <p v-else-if="error" class="lyrics-view-modal__error">
                    {{ error }}
                </p>
                <p v-else-if="!loading" class="lyrics-view-modal__empty">
                    暂无内容
                </p>
            </NScrollbar>
        </NSpin>
    </NModal>
</template>

<style scoped lang="scss">
.lyrics-view-modal__path {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.65;
    word-break: break-all;
}

.lyrics-view-modal__scroll {
    max-height: min(60vh, 520px);
}

.lyrics-view-modal__content {
    margin: 0;
    padding: 4px 2px 8px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 2;
}

.lyrics-view-modal__content--has-meta {
    .lyrics-view-modal__header-meta + .lyrics-view-modal__text-line,
    .lyrics-view-modal__header-meta + .lyrics-view-modal__header-meta {
        margin-top: 0;
    }

    .lyrics-view-modal__header-meta--last {
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.22);
    }
}

.lyrics-view-modal__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin: 0 0 4px;
    line-height: 1.5;
    opacity: 0.82;
}

.lyrics-view-modal__meta-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    cursor: pointer;
}

.lyrics-view-modal__meta-text--artist {
    font-weight: 500;
}

.lyrics-view-modal__tag-label {
    flex-shrink: 0;
    opacity: 0.72;
}

.lyrics-view-modal__text-line {
    margin: 0;
    white-space: pre-wrap;
}

.lyrics-view-modal__time {
    color: var(--n-primary-color);
    opacity: 0.78;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    margin-right: 1px;
    user-select: none;
}

.lyrics-view-modal__time + .lyrics-view-modal__lyric-text {
    margin-left: 6px;
}

.lyrics-view-modal__lyric-text {
    color: inherit;
}

.lyrics-view-modal__error,
.lyrics-view-modal__empty {
    margin: 0;
    padding: 12px 2px;
    font-size: 13px;
    opacity: 0.72;
}
</style>
