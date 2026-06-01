<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
    defineProps<{
        /** 校验失败时递增以清空并聚焦首格 */
        resetKey?: number
    }>(),
    { resetKey: 0 }
)

const emit = defineEmits<{
    complete: [pin: string]
}>()

const digits = ref(['', '', '', ''])
const inputRefs = ref<(HTMLInputElement | null)[]>([])

function setRef(el: unknown, index: number): void {
    inputRefs.value[index] = el as HTMLInputElement | null
}

function clearDigits(): void {
    digits.value = ['', '', '', '']
}

async function focusCell(index: number): Promise<void> {
    await nextTick()
    inputRefs.value[index]?.focus()
    inputRefs.value[index]?.select()
}

function tryEmitComplete(): void {
    if (digits.value.every((d) => d.length === 1)) {
        emit('complete', digits.value.join(''))
    }
}

function onInput(index: number, event: Event): void {
    const el = event.target as HTMLInputElement
    const digit = el.value.replace(/\D/g, '').slice(-1)
    digits.value[index] = digit
    el.value = digit
    if (digit && index < 3) {
        void focusCell(index + 1)
    }
    tryEmitComplete()
}

function onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
        event.preventDefault()
        digits.value[index - 1] = ''
        void focusCell(index - 1)
    }
}

function onPaste(event: ClipboardEvent): void {
    event.preventDefault()
    const text = event.clipboardData?.getData('text') ?? ''
    const nums = text.replace(/\D/g, '').slice(0, 4).split('')
    for (let i = 0; i < 4; i++) {
        digits.value[i] = nums[i] ?? ''
    }
    const nextEmpty = digits.value.findIndex((d) => !d)
    void focusCell(nextEmpty >= 0 ? nextEmpty : 3)
    tryEmitComplete()
}

watch(
    () => props.resetKey,
    () => {
        clearDigits()
        void focusCell(0)
    }
)

defineExpose({ clear: clearDigits, focus: () => focusCell(0) })
</script>

<template>
    <div class="pin-input" role="group" aria-label="4 位访问码">
        <input
            v-for="(_, index) in digits"
            :key="index"
            :ref="(el) => setRef(el, index)"
            class="pin-input__cell"
            type="password"
            inputmode="numeric"
            maxlength="1"
            autocomplete="off"
            :value="digits[index]"
            :aria-label="`第 ${index + 1} 位`"
            @input="onInput(index, $event)"
            @keydown="onKeydown(index, $event)"
            @paste="onPaste"
        />
    </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.pin-input {
    display: flex;
    gap: 10px;
}

.pin-input__cell {
    width: 48px;
    height: 52px;
    padding: 0;
    border: 1px solid $border-subtle;
    border-radius: $border-radius;
    background: $surface-panel;
    color: inherit;
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
    outline: none;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;

    &:focus {
        border-color: $color-primary;
        box-shadow: 0 0 0 2px rgb(110 168 254 / 25%);
    }
}
</style>
