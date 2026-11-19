import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import type { MarkType } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { MarkdownNode } from '@milkdown/kit/transformer'
import { $markSchema, $prose, $remark } from '@milkdown/kit/utils'

export type TextColorName = 'red' | 'green' | 'blue' | 'yellow'

export const TEXT_COLOR_FALLBACK_HEX: Record<TextColorName, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  red: '#dc2626',
  yellow: '#ca8a04',
}

const SHORTCUT_CODE_TO_COLOR: Record<string, TextColorName> = {
  KeyB: 'blue',
  KeyG: 'green',
  KeyR: 'red',
  KeyY: 'yellow',
}

const CLEAR_COLOR_SHORTCUT_CODE = 'KeyC'
const OPEN_SPAN_TAG_PATTERN = /^<span\b(?<attrs>[^>]*)(?<!\/)>$/i
const DATA_COLOR_ATTR_PATTERN = /\bdata-color\s*=\s*(?:"(?<dq>[^"]+)"|'(?<sq>[^']+)')/i
const CLOSE_SPAN_TAG_PATTERN = /^<\/span\s*>$/i

interface ColorSpanFrame {
  kind: 'color'
  color: TextColorName
  openNode: MarkdownNode
  children: MarkdownNode[]
}

interface PlainSpanFrame {
  kind: 'plain'
  openNode: MarkdownNode
  children: MarkdownNode[]
}

type SpanFrame = ColorSpanFrame | PlainSpanFrame

interface StringifyTracker {
  current: () => Record<string, unknown>
  move: (value: string) => string
}

interface StringifyState {
  containerPhrasing: (node: MarkdownNode, info: Record<string, unknown>) => string
  createTracker: (info: Record<string, unknown>) => StringifyTracker
  enter: (constructName: string) => () => void
}

type StringifyArgs = [
  node: MarkdownNode,
  parent: MarkdownNode | undefined,
  state: StringifyState,
  info: Record<string, unknown>,
]

export function isTextColorName(value: unknown): value is TextColorName {
  return value === 'red' || value === 'green' || value === 'blue' || value === 'yellow'
}

export function buildTextColorOpenTag(color: TextColorName): string {
  return `<span data-color="${color}" style="color: ${TEXT_COLOR_FALLBACK_HEX[color]}">`
}

function parseOpenSpanTag(htmlValue: string): {
  color: TextColorName | undefined
  isSpan: boolean
} {
  const match = OPEN_SPAN_TAG_PATTERN.exec(htmlValue.trim())
  if (!match) {
    return { color: undefined, isSpan: false }
  }
  const attrs = match.groups?.attrs ?? ''
  const colorMatch = DATA_COLOR_ATTR_PATTERN.exec(attrs)
  const rawColor = colorMatch?.groups?.dq ?? colorMatch?.groups?.sq
  if (isTextColorName(rawColor)) {
    return { color: rawColor, isSpan: true }
  }
  return { color: undefined, isSpan: true }
}

function isCloseSpanTag(htmlValue: string): boolean {
  return CLOSE_SPAN_TAG_PATTERN.test(htmlValue.trim())
}

function pushToCurrentTarget(
  stack: SpanFrame[],
  output: MarkdownNode[],
  ...nodes: MarkdownNode[]
): void {
  const target = stack.at(-1)?.children ?? output
  target.push(...nodes)
}

function flushUnclosedFrames(stack: SpanFrame[], output: MarkdownNode[]): void {
  while (stack.length > 0) {
    const unclosed = stack.pop()
    if (!unclosed) {
      break
    }
    pushToCurrentTarget(stack, output, unclosed.openNode, ...unclosed.children)
  }
}

function handleHtmlNode(child: MarkdownNode, stack: SpanFrame[], output: MarkdownNode[]): boolean {
  if (typeof child.value !== 'string') {
    return false
  }
  if (isCloseSpanTag(child.value) && stack.length > 0) {
    const frame = stack.pop()
    if (!frame) {
      return false
    }
    if (frame.kind === 'color') {
      pushToCurrentTarget(stack, output, {
        children: frame.children,
        color: frame.color,
        type: 'textColor',
      })
    } else {
      pushToCurrentTarget(stack, output, frame.openNode, ...frame.children, child)
    }
    return true
  }

  const parsed = parseOpenSpanTag(child.value)
  if (!parsed.isSpan) {
    return false
  }
  if (parsed.color) {
    stack.push({ children: [], color: parsed.color, kind: 'color', openNode: child })
    return true
  }
  if (stack.length > 0) {
    stack.push({ children: [], kind: 'plain', openNode: child })
    return true
  }
  return false
}

export function foldTextColorSpans(node: MarkdownNode): void {
  if (!Array.isArray(node.children)) {
    return
  }
  const output: MarkdownNode[] = []
  const stack: SpanFrame[] = []

  for (const child of node.children) {
    foldTextColorSpans(child)
    if (child.type !== 'html' || !handleHtmlNode(child, stack, output)) {
      pushToCurrentTarget(stack, output, child)
    }
  }

  flushUnclosedFrames(stack, output)
  node.children = output
}

function handleTextColorStringify(...args: StringifyArgs): string {
  const [node, , state, info] = args
  const { color } = node
  if (!isTextColorName(color)) {
    return state.containerPhrasing(node, info)
  }
  const exit = state.enter('textColor')
  const tracker = state.createTracker(info)
  const openPart = tracker.move(buildTextColorOpenTag(color))
  const inner = tracker.move(
    state.containerPhrasing(node, {
      after: '<',
      before: '>',
      ...tracker.current(),
    }),
  )
  const closePart = tracker.move('</span>')
  exit()
  if (inner === '') {
    return ''
  }
  return `${openPart}${inner}${closePart}`
}

export function configureTextColor(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({
    ...prev,
    handlers: {
      ...prev.handlers,
      textColor: handleTextColorStringify as never,
    },
  }))
}

export const remarkTextColorPlugin = $remark('remarkTextColor', () => () => (tree) => {
  foldTextColorSpans(tree as MarkdownNode)
})

export const textColorSchema = $markSchema('textColor', () => ({
  attrs: {
    color: {
      default: 'red',
      validate: 'string',
    },
  },
  excludes: 'textColor',
  inclusive: false,
  parseDOM: [
    {
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) {
          return false
        }
        const { color } = dom.dataset
        if (!isTextColorName(color)) {
          return false
        }
        return { color }
      },
      tag: 'span[data-color]',
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'textColor',
    runner: (state, node, markType) => {
      const { color } = node
      if (!isTextColorName(color)) {
        state.next(node.children)
        return
      }
      state.openMark(markType, { color })
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  priority: 40,
  toDOM: (mark) => {
    const { color: attrColor } = mark.attrs
    let color: TextColorName = 'red'
    if (isTextColorName(attrColor)) {
      color = attrColor
    }
    return ['span', { class: 'milkdown-text-color', 'data-color': color }, 0]
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => {
      const { color } = mark.attrs
      if (isTextColorName(color)) {
        state.withMark(mark, 'textColor', undefined, { color })
      }
    },
  },
}))

function inspectSelectionColor(
  view: EditorView,
  markType: MarkType,
  targetColor: TextColorName,
): { allMatchColor: boolean; hasMarkableText: boolean } {
  const { doc, selection } = view.state
  const { from, to } = selection
  let hasMarkableText = false
  let allMatchColor = true

  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!node.isText || !parent?.type.allowsMarkType(markType)) {
      return
    }
    hasMarkableText = true
    const hasTarget = node.marks.some(
      (mark) => mark.type === markType && mark.attrs.color === targetColor,
    )
    if (!hasTarget) {
      allMatchColor = false
    }
  })

  return { allMatchColor, hasMarkableText }
}

function toggleSelectionTextColor(
  view: EditorView,
  markType: MarkType,
  color: TextColorName,
): void {
  const { selection, tr } = view.state
  if (selection.empty) {
    return
  }
  const { allMatchColor, hasMarkableText } = inspectSelectionColor(view, markType, color)
  if (!hasMarkableText) {
    return
  }
  const { from, to } = selection
  if (allMatchColor) {
    view.dispatch(tr.removeMark(from, to, markType))
  } else {
    view.dispatch(tr.removeMark(from, to, markType).addMark(from, to, markType.create({ color })))
  }
}

function clearSelectionTextColor(view: EditorView, markType: MarkType): void {
  const { doc, selection, tr } = view.state
  if (selection.empty) {
    return
  }
  const { from, to } = selection
  if (doc.rangeHasMark(from, to, markType)) {
    view.dispatch(tr.removeMark(from, to, markType))
  }
}

function isPlainAltShortcut(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing
}

export const textColorShortcutPlugin = $prose((ctx) => {
  const pluginKey = new PluginKey('MILKDOWN_TEXT_COLOR_SHORTCUT')
  return new Plugin({
    key: pluginKey,
    props: {
      handleKeyDown: (view, event) => {
        if (!view.editable || !isPlainAltShortcut(event)) {
          return false
        }
        const isClear = event.code === CLEAR_COLOR_SHORTCUT_CODE
        const color = SHORTCUT_CODE_TO_COLOR[event.code]
        if (!isClear && !color) {
          return false
        }
        event.preventDefault()
        if (event.repeat) {
          return true
        }
        const markType = textColorSchema.type(ctx)
        if (isClear) {
          clearSelectionTextColor(view, markType)
        } else if (color) {
          toggleSelectionTextColor(view, markType, color)
        }
        return true
      },
    },
  })
})

export const textColorPlugins: MilkdownPlugin[] = [
  ...remarkTextColorPlugin,
  ...textColorSchema,
  textColorShortcutPlugin,
]
