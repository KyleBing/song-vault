<script setup lang="ts">
import { MusicalNotesOutline, Pause, Play } from '@vicons/ionicons5'
import { NButton, NIcon, NSlider, NTooltip, useMessage } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import { useAudioPlayerStore } from '@renderer/stores/audioPlayer'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'

const message = useMessage()

const player = useAudioPlayerStore()
const {
    filePath,
    title,
    playing,
    loading,
    hasTrack,
    duration,
    currentTime,
    lastError
} = storeToRefs(player)

const { getMeta } = useAudioMetaCache()
const { open: openCoverLightbox } = useAudioCoverLightbox()
const trackMeta = ref<AudioFileMetaInfo | null>(null)

const showCover = computed(() => Boolean(trackMeta.value?.coverDataUrl))

watch(
    filePath,
    async (path) => {
        trackMeta.value = null
        if (!path || !isMusicFilePathForMetaHover(path)) return
        trackMeta.value = await getMeta(path)
    },
    { immediate: true }
)

function onCoverClick(): void {
    const src = trackMeta.value?.coverDataUrl
    if (src) openCoverLightbox(src)
}

const scrubbing = ref(false)
const scrubProgress = ref(0)

const progress = computed({
    get(): number {
        if (scrubbing.value) return scrubProgress.value
        if (!duration.value || duration.value <= 0) return 0
        return Math.round((currentTime.value / duration.value) * 1000)
    },
    set(v: number) {
        scrubProgress.value = v
    }
})

const displayTimeSec = computed(() => {
    if (!hasTrack.value || duration.value <= 0) return 0
    if (scrubbing.value) {
        return (scrubProgress.value / 1000) * duration.value
    }
    return currentTime.value
})

const timeLabel = computed(() => {
    if (!hasTrack.value) return '未在播放'
    return `${formatClock(displayTimeSec.value)} / ${formatClock(duration.value)}`
})

function onScrubStart(): void {
    scrubbing.value = true
    scrubProgress.value =
        duration.value > 0
            ? Math.round((currentTime.value / duration.value) * 1000)
            : 0
}

function onScrubEnd(): void {
    if (!scrubbing.value) return
    const ratio = scrubProgress.value / 1000
    scrubbing.value = false
    if (duration.value > 0) {
        player.seek(ratio)
    }
}

function formatClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
    const total = Math.floor(seconds)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

let lastToastError = ''
watch(lastError, (err) => {
    if (!err || err === lastToastError) return
    lastToastError = err
    message.error(err, { duration: 4000 })
})
</script>

<template>
    <div
        class="app-audio-player"
        :class="{ 'app-audio-player--active': hasTrack }"
        role="region"
        aria-label="音频播放"
    >
        <img
            v-if="showCover && trackMeta?.coverDataUrl"
            class="app-audio-player__cover"
            :src="trackMeta.coverDataUrl"
            alt="专辑封面"
            title="点击查看原图"
            @click.stop="onCoverClick"
        />
        <div
            v-else
            class="app-audio-player__cover app-audio-player__cover--fallback"
            role="img"
            :aria-label="hasTrack ? '无专辑封面' : '未播放'"
        >
            <NIcon :size="14">
                <MusicalNotesOutline />
            </NIcon>
        </div>

        <NTooltip :disabled="!lastError" placement="bottom">
            <template #trigger>
                <NButton
                    quaternary
                    circle
                    size="small"
                    class="app-audio-player__btn"
                    :disabled="!hasTrack && !loading"
                    :loading="loading"
                    @click="player.toggle()"
                >
                    <template #icon>
                        <NIcon>
                            <Pause v-if="playing" />
                            <Play v-else />
                        </NIcon>
                    </template>
                </NButton>
            </template>
            {{ lastError }}
        </NTooltip>

        <div class="app-audio-player__main">
            <span class="app-audio-player__title" :title="title || '双击文件行播放'">
                {{ title || '双击文件行播放' }}
            </span>
            <div class="app-audio-player__progress">
                <NSlider
                    v-model:value="progress"
                    class="app-audio-player__slider"
                    :min="0"
                    :max="1000"
                    :step="1"
                    :disabled="!hasTrack || duration <= 0"
                    :tooltip="false"
                    @dragstart="onScrubStart"
                    @dragend="onScrubEnd"
                />
                <span class="app-audio-player__time">{{ timeLabel }}</span>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

$width-player: 300px;

.app-audio-player {
    display: flex;
    align-items: center;
    gap: 8px;
    width: $width-player;
    flex-shrink: 0;
    padding: 4px 0 4px 12px;
    margin-left: auto;
    border-left: 1px solid $border-subtle;
    opacity: 0.85;

    &--active {
        opacity: 1;
    }
}

.app-audio-player__cover {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid $border-subtle;
    flex-shrink: 0;
    background: rgba(128, 128, 128, 0.12);
    cursor: pointer;
}

.app-audio-player__cover--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    background: var(--app-cover-placeholder-bg);
    border: 1px solid $border-subtle;
    color: var(--app-cover-placeholder-icon);

    :deep(.n-icon) {
        opacity: 0.85;
    }
}

.app-audio-player__btn {
    flex-shrink: 0;
}

.app-audio-player__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.app-audio-player__title {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.9;
}

.app-audio-player__progress {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;

    :deep(.app-audio-player__slider.n-slider) {
        flex: 1;
        min-width: 72px;
        /* 与视觉尺寸一致，否则左右各多出半圈手柄宽，拖不到头尾 */
        --n-handle-size: 7px;
        --n-rail-height: 2px;
        --n-handle-box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.14);
        --n-handle-box-shadow-hover: 0 0 0 0.5px rgba(0, 0, 0, 0.22);
        --n-handle-box-shadow-active: 0 0 0 0.5px rgba(0, 0, 0, 0.28);
        --n-handle-box-shadow-focus: 0 0 0 0.5px rgba(0, 0, 0, 0.28);
    }
}

.app-audio-player__time {
    flex-shrink: 0;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    opacity: 0.55;
    white-space: nowrap;
}
</style>
