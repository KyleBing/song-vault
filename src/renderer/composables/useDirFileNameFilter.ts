import { ref, type Ref } from 'vue'
import { fileNameMatchesFuzzyQuery } from '@shared/fileNameFuzzyMatch'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'

export function useDirFileNameFilter(): {
  fileNameFilter: Ref<string>
  filterByFileName: (items: DirAudioFileItem[]) => DirAudioFileItem[]
} {
  const fileNameFilter = ref('')

  function filterByFileName(items: DirAudioFileItem[]): DirAudioFileItem[] {
    const q = fileNameFilter.value
    if (!q.trim()) return items
    return items.filter((item) =>
      fileNameMatchesFuzzyQuery(item.fileName, q)
    )
  }

  return { fileNameFilter, filterByFileName }
}
