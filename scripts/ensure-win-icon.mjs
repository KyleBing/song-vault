import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import resizeImg from 'resize-img'
import toIco from 'to-ico'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const pngPath = join(rootDir, 'build', 'icon.png')
const icoPath = join(rootDir, 'build', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]

if (!existsSync(pngPath)) {
    throw new Error(`Missing Windows icon source: ${pngPath}`)
}

const png = readFileSync(pngPath)
const resizedPngs = await Promise.all(
    sizes.map((size) => resizeImg(png, { width: size, height: size }))
)
const ico = await toIco(resizedPngs)
writeFileSync(icoPath, ico)
