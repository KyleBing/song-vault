import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseFile } from 'music-metadata'
import { WriteMetaToOgg } from '../src/unlock-music/decrypt/utils'
import { parseOggPages } from '../src/unlock-music/decrypt/oggRewrite'

async function main(): Promise<void> {
    const sourceArg = process.argv[2]
    const source =
        sourceArg ??
        'D:\\music-lossless\\QQ音乐\\SeVen_13 - Limitless (原版).ogg'

    if (!fs.existsSync(source)) {
        console.error('Source not found:', source)
        process.exit(1)
    }

    const original = fs.readFileSync(source)
    const parsedBefore = await parseFile(source, {
        skipCovers: true,
        duration: false
    })

    console.log('Before:', {
        title: parsedBefore.common.title,
        artist: parsedBefore.common.artist,
        pages: parseOggPages(original).length
    })

    const tagged = WriteMetaToOgg(
        original,
        {
            title: 'OGG Write Test Title',
            artists: ['Test Artist A', 'Test Artist B']
        },
        parsedBefore,
        true
    )

    const tmp = path.join(
        os.tmpdir(),
        `songvault-ogg-test-${Date.now()}.ogg`
    )
    fs.writeFileSync(tmp, tagged)

    const parsedAfter = await parseFile(tmp, {
        skipCovers: true,
        duration: false
    })

    console.log('After:', {
        title: parsedAfter.common.title,
        artist: parsedAfter.common.artist,
        artists: parsedAfter.common.artists,
        pages: parseOggPages(tagged).length
    })

    console.log('Temp file:', tmp)

    if (parsedAfter.common.title !== 'OGG Write Test Title') {
        throw new Error('Title mismatch after write')
    }

    console.log('OK')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
