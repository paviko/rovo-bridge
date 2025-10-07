# Drop & Chips mechanism (frontend UI)

This document summarizes how file drop and chip rendering work in the web UI for further refinements.

Source implementation:
- `web-ui/src/main.ts` (bootstraps `./ui/bootstrap`)
- `web-ui/src/ui/bootstrap/`: Main application startup and integration.
- `web-ui/src/ui/composer/`: Rich input editor and its components.
- `web-ui/src/ui/dnd.ts`: Drag-and-drop handling and routing.
- `web-ui/src/ui/chips.ts`: Chip UI management for the chip bar.
- `web-ui/src/ui/segments.ts`: Terminal viewport scanning for tokens.
- `web-ui/src/ui/websocket.ts`: Backend communication.
- `web-ui/src/ui/state.ts`: Shared application state.

Built assets are embedded under: `backend/internal/httpapi/ui/`

## Scope
- Drag-and-drop absolute paths into the terminal.
- Programmatic insert via `window.__insertPaths(paths)`.
- Lightweight chip UI (no counters) showing dropped files.
- Stateless viewport scan to detect tokens and remove when they disappear.

## Core data structures
- `fileRegistry: Map<string, FileChipInfo>`
  - `FileChipInfo = { chipEl, checkEl, permanent, wasPermanent, checkedSinceIterStart }`
  - Tracks the chip element, its checkbox, and its state for the current editing iteration.
- `segments: Map<number, Segment>`
  - Segment = `{ id, path, text, marker: null, startX?, endX?, endLineOffset? }`.
  - Represents a token we expect to see in the terminal viewport.
- `segmentsByPath: Map<string, number>`
  - Ensures a single registered scan per path (no duplicates).

## Key helpers and functions
- `addChips(paths)`
  - Creates chip UI for new paths, returns a space-separated string of quoted paths.
- `ensureWriteParsedWatcher()`
  - Installs a `term.onWriteParsed` watcher that scans the visible viewport for each segment’s token.
  - If found: updates segment geometry (`startX`, `endX`, `endLineOffset`).
  - If not found: removes the segment immediately.
- `removeChipAndRegistration(path)`
  - Removes the chip and any associated `segments`/`segmentsByPath` entry.
- `removeSegment(id)`
  - Removes a single segment and calls `removeChipAndRegistration(seg.path)`.

## Drag & Drop flow
1. User drops files on the UI.
2. If the composer is visible, the drop event is routed to it. Otherwise, it's handled by the terminal drop zone.
3. `extractPathsFromDrop` gets file paths from the event.
4. `routeInsertPaths(paths)` (from `composer/route.ts`) is called.
5. If the composer is visible, `insertPathsAsChips` adds chips directly to the editor.
6. If the composer is hidden, the traditional flow is used: `addChips` is called for the chip bar, segments are registered, and `sendTextToStdin` sends the paths to the terminal.

## Programmatic insert (`window.__insertPaths(paths)`) flow
- The global `__insertPaths` function now calls `routeInsertPaths`.
- This centralizes the logic: if the composer is visible, paths are inserted as chips into the editor. If not, they are sent to the terminal as before.
- This ensures consistent behavior for all path insertion actions (context menus, etc.).

## Viewport scan details
- The watcher uses terminal buffer coordinates:
  - Viewport top = `top = Math.max(0, baseY - (term.rows - 1))`.
  - Reads with `readBufferRange(top + vy, x, top + endY, endX)`.
  - Computes wrap with `computeEndPosition()` for contiguous substring matching across wrapped lines.
- On every write tick:
  - Compute a box-aware range (see "Box-aware range computation" below).
  - If the range is not found: aggressively remove all segments (also removes chip/registration) and skip scanning for that tick.
  - If the range is found: scan only within that vertical range; when a token matches there, update geometry; otherwise remove the segment immediately.
  - **Composer Integration**: If the composer is visible, the scan is patched. A segment is considered "found" and is not removed if a chip for its path exists in the composer, even if the token isn't visible in the terminal. This preserves the chip's registration while the user is editing.

### Box-aware range computation
- Step 0 (anchor): from the bottom of the visible viewport, find the first line that starts with a non-whitespace character. This is the bottom anchor.
- Step 1 (end): within the 10-line window ending at the anchor, find the first line from the bottom that starts with `╰─`. This is the end line for search. If none is found, the range is invalid.
- Step 2 (start + cursor): from the end line upward, mark `inputCursorFound` if a line starts with `│ >`. Continue up until a line starts with `╭─` and ends with `─╮` and the inner characters are only `─`. This is the start line. Do not search other `╭─`.
- Step 3 (validate): the range is valid only if `inputCursorFound` is true. The vertical scan range is `[startVy..endVy]` within the viewport.

## What to use (Do’s)
- Use `segmentsByPath` to prevent duplicate registrations for the same path.
- Use `addChips(paths)` to render chips and build outgoing text.
- Always call `ensureWriteParsedWatcher()` before sending text.
- Quote file paths with `quotePath()` to be shell-safe on all platforms.
- Convert dropped absolute paths to relative within `boot.cwd` via `toRelativeIfWithin()` to keep prompts compact.

## What to avoid (Don’ts)
- Don’t rely on fixed coordinates, cursor position, or persistent marker ranges for location.
- Don’t re-register scans for a path already present in `segmentsByPath`.
- Don’t maintain counters or grace delays for disappearance; removal is immediate.
- Don’t assume Unix-only paths; keep Windows quoting and normalization in mind.
- Don’t scan the scrollback; scan only the visible viewport using the computed `top`.

## Extensibility tips
- To add a chip “close” button: call `removeChipAndRegistration(path)`.
- To add new insertion sources: follow the programmatic insert flow and dedupe with `segmentsByPath`.
- To optimize scanning under heavy output:
  - Already restricted by box-aware range; the bottom search window is 10 lines from the anchor. Consider making this window size configurable if needed.
  - Batch pre-read lines into a string cache for that tick to reduce `readBufferRange` calls.

## Edge cases
- Mixed path separators (Windows vs Unix): `normalizePath()` and `quotePath()` cover this.
- Out-of-scope paths (outside `boot.cwd`): collect into `outOfScope` and `showToast()`.
- Re-dropping an already tracked file: chip is reused and scan is not re-registered, but the path text still gets sent unless you filter it explicitly in `addChips()`.

## Minimal integration checklist
- [ ] Use `addChips(paths)` and send its returned text via `sendTextToStdin()`.
- [ ] For each new path, register a segment only if `!segmentsByPath.has(path)`.
- [ ] Ensure the watcher is installed (`ensureWriteParsedWatcher()`).
- [ ] On any manual removal, call `removeChipAndRegistration(path)`.
