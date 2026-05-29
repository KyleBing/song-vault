<script setup lang="ts">
import {
  NButton,
  NCheckbox,
  NIcon,
  NInput,
  NSelect,
  NText,
  type SelectOption
} from 'naive-ui'
import { Add, Close } from '@vicons/ionicons5'
import type { PathFilterRule } from '@shared/appConfig'
import {
  createEmptyPathFilterRule,
  PATH_FILTER_MATCH_LABELS,
  PATH_FILTER_TARGET_LABELS,
  type PathFilterMatch,
  type PathFilterTarget
} from '@shared/pathFilters'

const rules = defineModel<PathFilterRule[]>('rules', { required: true })

const targetOptions: SelectOption[] = (
  Object.entries(PATH_FILTER_TARGET_LABELS) as [PathFilterTarget, string][]
).map(([value, label]) => ({ value, label }))

const matchOptions: SelectOption[] = (
  Object.entries(PATH_FILTER_MATCH_LABELS) as [PathFilterMatch, string][]
).map(([value, label]) => ({ value, label }))

/** 追加一条空白过滤规则 */
function addRule(): void {
  rules.value = [...rules.value, createEmptyPathFilterRule()]
}

/** 删除指定下标的规则 */
function removeAt(index: number): void {
  rules.value = rules.value.filter((_, i) => i !== index)
}

/** 更新单条规则的某一字段 */
function updateRule<K extends keyof PathFilterRule>(
  index: number,
  key: K,
  value: PathFilterRule[K]
): void {
  const next = rules.value.map((r, i) =>
    i === index ? { ...r, [key]: value } : r
  )
  rules.value = next
}

/** 匹配文本输入变更 */
function onPatternInput(index: number, value: string): void {
  updateRule(index, 'pattern', value)
}
</script>

<template>
  <div class="filter-rules">
    <NText depth="3" class="filter-hint">
      纯文本匹配。
      <br>
      扫描、浏览时跳过命中的文件或文件夹。
      <br>
      每条规则可单独设置是否区分大小写，默认区分。
    </NText>

    <ul v-if="rules.length" class="rule-list">
      <li v-for="(rule, index) in rules" :key="rule.id" class="rule-row">
        <NSelect
          :value="rule.target"
          :options="targetOptions"
          size="small"
          class="rule-select rule-select--target"
          @update:value="(v) => updateRule(index, 'target', v as PathFilterTarget)"
        />
        <NSelect
          :value="rule.match"
          :options="matchOptions"
          size="small"
          class="rule-select rule-select--match"
          @update:value="(v) => updateRule(index, 'match', v as PathFilterMatch)"
        />
        <NInput
          :value="rule.pattern"
          size="small"
          placeholder="匹配文本，如 ._ 或 ."
          class="rule-pattern"
          @update:value="(v) => onPatternInput(index, v)"
        />
        <NCheckbox
          :checked="rule.caseSensitive"
          size="small"
          class="rule-case"
          @update:checked="(v) => updateRule(index, 'caseSensitive', v)"
        >
          区分大小写
        </NCheckbox>
        <NButton
          quaternary
          circle
          size="tiny"
          class="rule-remove"
          @click="removeAt(index)"
        >
          <template #icon>
            <NIcon :size="16"><Close /></NIcon>
          </template>
        </NButton>
      </li>
    </ul>

    <NText v-else depth="3" class="rule-empty">暂无规则，扫描时不做名称过滤</NText>

    <NButton secondary type="primary" size="small" class="add-btn" @click="addRule">
      <template #icon>
        <NIcon><Add /></NIcon>
      </template>
      添加规则
    </NButton>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.filter-rules {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-hint {
  font-size: 12px;
  line-height: 1.45;
}

.rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rule-select {
  width: 120px;

  &--target {
    width: 128px;
  }

  &--match {
    width: 112px;
  }
}

.rule-pattern {
  flex: 1;
  min-width: 120px;
}

.rule-case {
  flex-shrink: 0;
  white-space: nowrap;
}

.rule-remove {
  flex-shrink: 0;
}

.rule-empty {
  font-size: 13px;
}

.add-btn {
  align-self: flex-start;
}
</style>
