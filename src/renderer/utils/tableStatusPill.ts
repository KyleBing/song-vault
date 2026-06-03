import type { TagProps } from 'naive-ui'
import { h, type VNode } from 'vue'

/** 表格状态标签配色（与 Naive NTag type 对应） */
export type TableStatusPillTone =
    | 'default'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'

const NAIVE_TAG_TYPE_TO_TONE: Record<
    NonNullable<TagProps['type']>,
    TableStatusPillTone
> = {
    default: 'default',
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'info',
    primary: 'info'
}

export function naiveTagTypeToPillTone(
    type?: TagProps['type']
): TableStatusPillTone {
    if (!type) return 'default'
    return NAIVE_TAG_TYPE_TO_TONE[type] ?? 'default'
}

export interface TableStatusPillOptions {
    class?: string
    onClick?: (event: MouseEvent) => void
}

/** 轻量表格状态标签（虚拟列表友好，替代 NTag） */
export function tableStatusPill(
    label: string,
    tone: TableStatusPillTone = 'default',
    options?: TableStatusPillOptions
): VNode {
    const classNames = ['sv-pill', `sv-pill--${tone}`]
    if (options?.class) classNames.push(options.class)

    return h(
        'span',
        {
            class: classNames,
            onClick: options?.onClick
        },
        label
    )
}

export function tableStatusPillFromNaiveType(
    label: string,
    type?: TagProps['type'],
    options?: TableStatusPillOptions
): VNode {
    return tableStatusPill(label, naiveTagTypeToPillTone(type), options)
}
