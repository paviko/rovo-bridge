import {isComposerVisible} from '../utils'
import {insertPathsAsChips} from './chips'

export function routeInsertPaths(paths: string[]): void {
  if (isComposerVisible()) {
    insertPathsAsChips(paths)
  } else {
    try { (window as any).__insertPaths_direct(paths) } catch {}
  }
}
