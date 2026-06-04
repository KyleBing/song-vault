/** 仅单选时返回 meta 面板路径；多选或未选时返回 null */
export function metaPanelPathFromSelection(
    keys: readonly string[]
): string | null {
    return keys.length === 1 ? keys[0] : null
}
