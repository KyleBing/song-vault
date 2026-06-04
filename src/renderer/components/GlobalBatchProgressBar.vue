<script setup lang="ts">
import { NButton, NProgress } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useBatchProgressStore } from '@renderer/stores/batchProgress'

const store = useBatchProgressStore()
const { snapshot } = storeToRefs(store)

const visible = computed(() => snapshot.value !== null)

const progressPercent = computed(() => {
    const current = snapshot.value
    if (!current) return 0
    if (current.indeterminate) return 100
    return current.percentage ?? 0
})

const showIndicator = computed(() => {
    const current = snapshot.value
    return !!current && !current.indeterminate
})

function onCancel(): void {
    snapshot.value?.onCancel()
}
</script>

<template>
    <Transition name="global-batch-bar">
        <section
            v-if="visible && snapshot"
            class="global-batch-progress"
            role="status"
            aria-live="polite"
        >
            <p class="global-batch-progress__title">{{ snapshot.title }}</p>
            <NProgress
                type="line"
                :percentage="progressPercent"
                :processing="!!snapshot.indeterminate"
                :show-indicator="showIndicator"
            />
            <p v-if="snapshot.detail" class="global-batch-progress__detail">
                {{ snapshot.detail }}
            </p>
            <NButton
                block
                size="small"
                secondary
                type="error"
                class="global-batch-progress__cancel"
                @click="onCancel"
            >
                取消
            </NButton>
        </section>
    </Transition>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.global-batch-progress {
    position: fixed;
    left: 0;
    bottom: 0;
    z-index: 3000;
    width: $sidebar-width;
    max-width: 100vw;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 14px 16px;
    border-top: 1px solid $border-subtle;
    border-right: 1px solid $border-subtle;
    background: color-mix(in srgb, var(--app-surface-sidebar) 72%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
    box-sizing: border-box;
}

.global-batch-progress__title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    opacity: 0.75;
}

.global-batch-progress__detail {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
}

.global-batch-progress__cancel {
    margin-top: 2px;
}

.global-batch-bar-enter-active,
.global-batch-bar-leave-active {
    transition: transform 0.18s ease, opacity 0.18s ease;
}

.global-batch-bar-enter-from,
.global-batch-bar-leave-to {
    transform: translateY(100%);
    opacity: 0;
}
</style>
