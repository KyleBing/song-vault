import { app, BrowserWindow, globalShortcut, Menu, type MenuItemConstructorOptions } from 'electron'
import { APP_NAVIGATE_CHANNEL, type AppNavigateTarget } from '../shared/appNavigate'

const NAV_SHORTCUTS: ReadonlyArray<readonly [string, AppNavigateTarget]> = [
  ['CommandOrControl+1', 'lrc'],
  ['CommandOrControl+2', 'decode'],
  ['CommandOrControl+3', 'library'],
  ['CommandOrControl+,', 'settings']
]

function focusedWebContents(): Electron.WebContents | undefined {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return win?.webContents
}

function navigateTo(view: AppNavigateTarget): void {
  focusedWebContents()?.send(APP_NAVIGATE_CHANNEL, view)
}

function helpSubmenu(isMac: boolean): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    {
      label: '解密说明',
      click: () => navigateTo('help')
    }
  ]
  if (!isMac) {
    items.push(
      { type: 'separator' },
      {
        label: '关于',
        click: () => navigateTo('about')
      }
    )
  }
  return items
}

/** 全局快捷键切换页面（顶部导航栏亦可点击） */
export function registerAppNavShortcuts(): void {
  for (const [accelerator, view] of NAV_SHORTCUTS) {
    globalShortcut.register(accelerator, () => {
      if (BrowserWindow.getFocusedWindow()) {
        navigateTo(view)
      }
    })
  }
}

/** 注册系统菜单（视图、退出等；页面入口在应用内顶栏） */
export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        {
          label: `关于 ${app.name}`,
          click: () => navigateTo('about')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: '视图',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  })

  const helpMenu = helpSubmenu(isMac)
  if (helpMenu.length > 0) {
    template.push({
      label: '帮助',
      submenu: helpMenu
    })
  }

  if (!isMac) {
    template.push({
      label: '文件',
      submenu: [{ role: 'quit' }]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
