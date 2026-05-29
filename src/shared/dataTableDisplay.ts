/** 表格显示相关配置（写入 config_search_match_replace.json） */
export interface DataTableDisplaySettings {
    /** 表格单元格字号（px） */
    fontSizePx: number
}

export const DATA_TABLE_FONT_SIZE_MIN = 10  // 字体大小最小值
export const DATA_TABLE_FONT_SIZE_MAX = 16  // 字体大小最大值
export const DEFAULT_DATA_TABLE_FONT_SIZE_PX = 13  // 默认字体大小

export const DATA_TABLE_CELL_PADDING_X = '8px'

/** 行高 = 字号 + 固定余量（与 small 标签列对齐） */
const DATA_TABLE_ROW_EXTRA_PX = 16

export function createDefaultDataTableDisplay(): DataTableDisplaySettings {
    return { fontSizePx: DEFAULT_DATA_TABLE_FONT_SIZE_PX }
}

function clampFontSize(value: number): number {
    return Math.min(
        DATA_TABLE_FONT_SIZE_MAX,
        Math.max(DATA_TABLE_FONT_SIZE_MIN, Math.round(value))
    )
}

/** 从磁盘 JSON 解析并规范化 */
export function normalizeDataTableDisplay(raw: unknown): DataTableDisplaySettings {
    if (!raw || typeof raw !== 'object') {
        return createDefaultDataTableDisplay()
    }
    const fontSizePx = (raw as Record<string, unknown>).fontSizePx
    if (typeof fontSizePx !== 'number' || !Number.isFinite(fontSizePx)) {
        return createDefaultDataTableDisplay()
    }
    return { fontSizePx: clampFontSize(fontSizePx) }
}

export function dataTableRowHeight(fontSizePx: number): number {
    return Math.min(40, Math.max(24, fontSizePx + DATA_TABLE_ROW_EXTRA_PX))
}

export function dataTableHeaderHeight(fontSizePx: number): number {
    return dataTableRowHeight(fontSizePx)
}

export function dataTableHeightForRow(fontSizePx: number): number {
    return dataTableRowHeight(fontSizePx)
}

export function dataTableCellPaddingY(fontSizePx: number): string {
    const rowHeight = dataTableRowHeight(fontSizePx)
    const content = fontSizePx + 8
    const pad = (rowHeight - content) / 2
    return `${Math.max(2, pad)}px`
}

export function dataTableCellPadding(fontSizePx: number): string {
    return `${dataTableCellPaddingY(fontSizePx)} ${DATA_TABLE_CELL_PADDING_X}`
}

/** 覆盖 Naive UI DataTable 主题变量 */
export function dataTableThemeOverrides(fontSizePx: number) {
    const padding = dataTableCellPadding(fontSizePx)
    return {
        tdPaddingSmall: padding,
        thPaddingSmall: padding,
        tdPaddingMedium: padding,
        thPaddingMedium: padding,
        fontSizeSmall: `${fontSizePx}px`,
        fontSizeMedium: `${fontSizePx}px`,
        lineHeight: '1.25'
    }
}

/** 供根节点 :style 绑定的 CSS 变量 */
export function dataTableCssVars(
    settings: DataTableDisplaySettings
): Record<string, string> {
    const { fontSizePx } = settings
    const rowHeight = dataTableRowHeight(fontSizePx)
    return {
        '--app-data-table-font-size': `${fontSizePx}px`,
        '--vdt-row-height': `${rowHeight}px`,
        '--vdt-header-height': `${dataTableHeaderHeight(fontSizePx)}px`,
        '--vdt-cell-padding': dataTableCellPadding(fontSizePx),
        '--vdt-font-size': `${fontSizePx}px`
    }
}
