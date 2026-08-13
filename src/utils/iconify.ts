import { addIcon } from '@iconify/vue'
import { localIcons } from '@/generated/iconRegistry'

/** Register only the glyphs referenced by this theme; no runtime CDN fallback. */
export function setupIconify(): void {
  for (const [name, icon] of Object.entries(localIcons))
    addIcon(name, icon)
}
