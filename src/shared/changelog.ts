/** 单条更新日志小节（对应 Keep a Changelog 的 ### 标题） */
export interface ChangelogSection {
  /** 展示用标题，如「新增」「变更」 */
  title: string
  items: string[]
}

/** 一个版本的更新记录 */
export interface ChangelogRelease {
  version: string
  /** ISO 日期 YYYY-MM-DD */
  date: string
  sections: ChangelogSection[]
}

/**
 * 应用更新日志（与根目录 CHANGELOG.md 保持同步）
 * 关于页按版本号分块展示，块标题为「版本号 + 日期」
 */
export const CHANGELOG_RELEASES: readonly ChangelogRelease[] = [
  {
    version: '1.0.0',
    date: '2026-05-26',
    sections: [
      {
        title: '新增',
        items: [
          '音乐解码：集成 unlock-music 解密能力，支持网易云、QQ 音乐等加密格式批量解密',
          '音乐解码说明：解码页提供「下载与解密说明」帮助弹窗',
          '文件列表音频信息：源文件页与解码页列表支持比特率、时长、采样率、标签等列；可在「设置 → 文件列表列」中配置显示项',
          '文件过滤规则：扫描与目录浏览时按名称跳过指定文件/文件夹',
          '设置界面：主题（浅色/深色）、音乐解码浏览目录、文件列表列、名称过滤等',
          '源文件管理：目录树浏览、新建/重命名/删除文件夹、删除选中音频、同级 LRC 显示',
          '布局：侧栏与表格高度随窗口尺寸更新；默认窗口宽高比 2:1'
        ]
      },
      {
        title: '变更',
        items: [
          '解密页待解码队列与文件列表区域高度优化',
          '目录树：结构变化后保留展开状态；子文件夹少于 10 个时默认展开',
          '列表「状态」「平台」「同级 LRC」等列内容居中显示'
        ]
      },
      {
        title: '修复',
        items: [
          '删除多余 LRC 文件时的错误',
          '文件管理中删除子文件夹时渲染进程误用 Node path 导致报错的问题'
        ]
      }
    ]
  },
  {
    version: '0.2.0',
    date: '2026-05-25',
    sections: [
      {
        title: '新增',
        items: [
          'LRC 与音频匹配预览、批量复制歌词到新界面（Vue 3 + Naive UI）',
          '扫描结果分 Tab 展示（全部 / 已匹配 / 可复制 / 待选源等）'
        ]
      }
    ]
  },
  {
    version: '0.1.0',
    date: '2026-05-25',
    sections: [
      {
        title: '新增',
        items: [
          'Electron + electron-vite 工程骨架',
          '初始仓库与 Node.js 命令行版脚本'
        ]
      }
    ]
  }
]
