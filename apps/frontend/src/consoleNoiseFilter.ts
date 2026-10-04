/* eslint-disable no-console -- This module intentionally filters known third-party development messages. */

const REACT_DEVTOOLS_MESSAGE = 'Download the React DevTools for a better development experience'
const PIXI_INTERACTION_WARNING = 'renderer.plugins.interaction has been deprecated'

if (import.meta.env.DEV) {
  const originalInfo = console.info.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalGroupCollapsed = console.groupCollapsed.bind(console)
  const originalGroupEnd = console.groupEnd.bind(console)

  let suppressPixiWarningGroup = false

  console.info = (...args: unknown[]) => {
    if (args.some((value) => String(value).includes(REACT_DEVTOOLS_MESSAGE))) return
    originalInfo(...args)
  }

  console.warn = (...args: unknown[]) => {
    if (suppressPixiWarningGroup) return
    if (args.some((value) => String(value).includes(PIXI_INTERACTION_WARNING))) return
    originalWarn(...args)
  }

  console.groupCollapsed = (...args: unknown[]) => {
    suppressPixiWarningGroup = args.some((value) => String(value).includes(PIXI_INTERACTION_WARNING))
    if (!suppressPixiWarningGroup) originalGroupCollapsed(...args)
  }

  console.groupEnd = () => {
    if (suppressPixiWarningGroup) {
      suppressPixiWarningGroup = false
      return
    }
    originalGroupEnd()
  }
}
