import { parseFile } from 'music-metadata'
import fs from 'fs'
import path from 'path'

const defaultDir = 'D:\\music-lossless\\录音'

async function main(): Promise<void> {
    const arg = process.argv[2]
    let file = arg
    if (!file) {
        const entry = fs.readdirSync(defaultDir).find((n) => /\.m4a$/i.test(n))
        if (!entry) throw new Error('no m4a in 录音 folder')
        file = path.join(defaultDir, entry)
    }

    const meta = await parseFile(file, { duration: false, skipCovers: true })
    console.log({
        file,
        codec: meta.format.codec,
        codecProfile: meta.format.codecProfile,
        container: meta.format.container,
        bitrate: meta.format.bitrate,
        sampleRate: meta.format.sampleRate,
        numberOfChannels: meta.format.numberOfChannels
    })
}

main().catch(console.error)
