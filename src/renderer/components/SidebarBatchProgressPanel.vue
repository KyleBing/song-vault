<script setup lang="ts">
import { NProgress } from 'naive-ui'

defineProps<{
    title: string
    percentage?: number
    detail?: string
    /** 无逐步进度时显示动画条（如批量删除） */
    indeterminate?: boolean
}>()
</script>

<template>
    <section class="sidebar-batch-progress">
        <p class="sidebar-batch-progress__title">{{ title }}</p>
        <NProgress
            type="line"
            :percentage="indeterminate ? 100 : (percentage ?? 0)"
            :processing="indeterminate"
            :show-indicator="!indeterminate"
        />
        <p v-if="detail" class="sidebar-batch-progress__detail">{{ detail }}</p>
    </section>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.sidebar-batch-progress {
    height: 120px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    padding: 14px 16px;
    border-top: 1px solid $border-subtle;
    background: $surface-sidebar;
    box-sizing: border-box;
}

.sidebar-batch-progress__title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    opacity: 0.75;
}

.sidebar-batch-progress__detail {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    text-align: center;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
}
</style>
