import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { rcedit } from 'rcedit'

/** Windows 打包时手动写入 exe 图标（绕过 winCodeSign 符号链接权限问题） */
export default async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') {
        return
    }

    const buildResourcesDir = context.packager.buildResourcesDir
    const iconPath = join(buildResourcesDir, 'icon.ico')
    const exePath = join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.exe`
    )

    if (!existsSync(iconPath)) {
        throw new Error(
            `Missing ${iconPath}. Run "node scripts/ensure-win-icon.mjs" before packing.`
        )
    }
    if (!existsSync(exePath)) {
        throw new Error(`Windows executable not found: ${exePath}`)
    }

    await rcedit(exePath, { icon: iconPath })
}
