<script setup lang="ts">
import { NButton, NInput, useMessage } from 'naive-ui'
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdvancedUnlockStore } from '@renderer/stores/advancedUnlock'

const message = useMessage()
const store = useAdvancedUnlockStore()
const { modalVisible } = storeToRefs(store)

const pin = ref('')
const inputRef = ref<InstanceType<typeof NInput> | null>(null)
const shake = ref(false)

watch(modalVisible, async (open) => {
    if (!open) {
        pin.value = ''
        return
    }
    await nextTick()
    inputRef.value?.focus()
})

function onPinInput(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    pin.value = digits
    if (digits.length === 4) {
        void trySubmit()
    }
}

async function trySubmit(): Promise<void> {
    if (pin.value.length !== 4) return
    if (store.submitPin(pin.value)) {
        pin.value = ''
        return
    }
    pin.value = ''
    shake.value = true
    message.error('访问码不正确')
    window.setTimeout(() => {
        shake.value = false
    }, 450)
    await nextTick()
    inputRef.value?.focus()
}

function onCancel(): void {
    store.closeModal()
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="modalVisible"
            class="advanced-unlock-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-unlock-title"
        >
            <div
                class="advanced-unlock-panel"
                :class="{ 'advanced-unlock-panel--shake': shake }"
            >
                <h2 id="advanced-unlock-title" class="advanced-unlock-title">
                    高级功能
                </h2>
                <p class="advanced-unlock-desc">请输入 4 位访问码以继续</p>
                <NInput
                    ref="inputRef"
                    :value="pin"
                    type="password"
                    inputmode="numeric"
                    maxlength="4"
                    placeholder="····"
                    size="large"
                    class="advanced-unlock-input"
                    autocomplete="off"
                    @update:value="onPinInput"
                    @keydown.enter.prevent="trySubmit"
                />
                <div class="advanced-unlock-actions">
                    <NButton quaternary @click="onCancel">取消</NButton>
                    <NButton
                        type="primary"
                        :disabled="pin.length !== 4"
                        @click="trySubmit"
                    >
                        确认
                    </NButton>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.advanced-unlock-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgb(0 0 0 / 35%);
    backdrop-filter: blur(14px);
}

.advanced-unlock-panel {
    width: min(100%, 360px);
    padding: 28px 24px 20px;
    border-radius: $border-radius;
    border: 1px solid $border-subtle;
    background: $surface-panel;
    box-shadow: 0 12px 40px rgb(0 0 0 / 28%);
}

.advanced-unlock-panel--shake {
    animation: advanced-unlock-shake 0.45s ease;
}

@keyframes advanced-unlock-shake {
    0%,
    100% {
        transform: translateX(0);
    }
    20%,
    60% {
        transform: translateX(-8px);
    }
    40%,
    80% {
        transform: translateX(8px);
    }
}

.advanced-unlock-title {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
}

.advanced-unlock-desc {
    margin: 0 0 20px;
    font-size: 13px;
    text-align: center;
    opacity: 0.72;
}

.advanced-unlock-input {
    margin-bottom: 16px;

    :deep(.n-input__input-el) {
        text-align: center;
        letter-spacing: 0.35em;
        font-size: 22px;
        font-variant-numeric: tabular-nums;
    }
}

.advanced-unlock-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
