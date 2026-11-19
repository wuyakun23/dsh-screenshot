window.__ModuleLoader__.load({
  id: 'dsh-screenshot',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'plugin.screenshot'
    const CAPTURE_ENDPOINT = 'api/dsh-screenshot/capture'
    const SETTINGS_ENDPOINT = 'api/dsh-screenshot/settings'

    const DICT = {
      zh: {
        'button.title': '截图（Ctrl+Shift+S）',
        'button.label': '截图',
        'preview.title': '截图预览',
        'preview.alt': '屏幕截图',
        'capturing': '正在截图…',
        'copy': '复制图片',
        'copied': '已复制',
        'download': '下载 PNG',
        'retake': '重新截图',
        'done': '完成',
        'close': '关闭',
        'setting.minimize': '截图时最小化 Harness',
        'setting.title': '截图',
        'setting.desc': '在输入框左侧显示截图按钮，快捷键 Ctrl+Shift+S；截图时可以先最小化 Harness 窗口，再在整屏上框选区域。',
        'mode.minimize': '截图前已最小化',
        'mode.keep': '窗口保持不变',
        'error.title': '截图失败',
        'retry': '重试',
        'tool.rect': '矩形线框',
        'tool.line': '直线',
        'tool.pen': '画笔',
        'tool.undo': '撤销',
        'tool.clear': '清空',
        'tool.color': '颜色',
        'tool.width': '粗细',
        'edit.hint': '在图上拖动标注；Shift 画水平/竖直线',
      },
      en: {
        'button.title': 'Take a screenshot (Ctrl+Shift+S)',
        'button.label': 'Screenshot',
        'preview.title': 'Screenshot preview',
        'preview.alt': 'Screen capture',
        'capturing': 'Capturing…',
        'copy': 'Copy image',
        'copied': 'Copied',
        'download': 'Download PNG',
        'retake': 'Retake',
        'done': 'Done',
        'close': 'Close',
        'setting.minimize': 'Minimize Harness while capturing',
        'setting.title': 'Screenshot',
        'setting.desc': 'Shows a screenshot button in the composer; press Ctrl+Shift+S to capture. The Harness window can be minimized while you pick a region on the full screen.',
        'mode.minimize': 'Harness minimized',
        'mode.keep': 'Window kept in place',
        'error.title': 'Screenshot failed',
        'retry': 'Retry',
        'tool.rect': 'Rectangle',
        'tool.line': 'Line',
        'tool.pen': 'Pen',
        'tool.undo': 'Undo',
        'tool.clear': 'Clear',
        'tool.color': 'Color',
        'tool.width': 'Width',
        'edit.hint': 'Drag on the image to annotate; hold Shift for horizontal/vertical lines',
      },
    }

    const TOOL_COLORS = ['#e5484d', '#f76b15', '#ffb224', '#30a46c', '#0091ff', '#8e4ec6', '#1a1523', '#ffffff']
    const TOOL_RATIOS = [0.004, 0.008, 0.014]

    const CSS = `
.dsh-shot-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,color .12s}
.dsh-shot-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-shot-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-shot-btn:disabled{cursor:default;opacity:1}
.dsh-shot-btn svg{width:16px;height:16px;display:block}
.dsh-shot-blur{animation:dsh-shot-blur 1.1s ease-in-out infinite}
@keyframes dsh-shot-blur{0%,100%{opacity:1}50%{opacity:.35}}
.dsh-shot-backdrop{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.38);pointer-events:auto}
.dsh-shot-panel{display:flex;flex-direction:column;width:min(100%,1100px);max-height:100%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}
.dsh-shot-panel--small{width:auto;min-width:230px;align-items:center;gap:12px;padding:22px 26px}
.dsh-shot-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-shot-heading{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-shot-title{font-size:14px;font-weight:600}
.dsh-shot-meta{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-shot-tools{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dsh-shot-group{display:flex;align-items:center;gap:6px;padding-right:10px;border-right:1px solid var(--dsw-alias-border-l1)}
.dsh-shot-group--last{border-right:0;padding-right:0}
.dsh-shot-tool{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-shot-tool:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-shot-tool[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.dsh-shot-tool svg{width:16px;height:16px;display:block}
.dsh-shot-color{width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);cursor:pointer}
.dsh-shot-color[data-on="true"]{box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay),0 0 0 4px var(--dsw-alias-brand-primary)}
.dsh-shot-width{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:6px;border:1px solid transparent;background:transparent;cursor:pointer}
.dsh-shot-width[data-on="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-shot-width i{display:block;border-radius:50%;background:var(--dsw-alias-label-primary)}
.dsh-shot-textbtn{height:26px;padding:0 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.dsh-shot-textbtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-shot-textbtn:disabled{opacity:.4;cursor:default}
.dsh-shot-panel--editor{height:100%;max-height:100%}
.dsh-shot-body{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px 16px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsh-shot-canvaswrap{position:relative;flex:none;max-width:100%;max-height:100%}
.dsh-shot-canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;border-radius:6px;background:var(--dsw-alias-bg-base)}
.dsh-shot-canvas--draw{touch-action:none;cursor:crosshair;background:transparent}
.dsh-shot-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dsh-shot-setting{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsh-shot-setting-label{cursor:pointer;user-select:none}
.dsh-shot-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-state-idle-primary);cursor:pointer;transition:background .15s}
.dsh-shot-switch[data-on="true"]{background:var(--dsw-alias-brand-primary)}
.dsh-shot-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-shot-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
.dsh-shot-switch[data-on="true"]::after{transform:translateX(14px)}
.dsh-shot-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
.dsh-shot-action{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;transition:border-color .12s,background .12s}
.dsh-shot-action:hover{border-color:var(--dsw-alias-border-l2)}
.dsh-shot-action--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.dsh-shot-action--primary:hover{filter:brightness(1.06)}
.dsh-shot-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-shot-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-shot-icon svg{width:15px;height:15px;display:block}
.dsh-shot-hint{font-size:12px;color:var(--dsw-alias-state-success-primary)}
.dsh-shot-error{font-size:13px;color:var(--dsw-alias-state-error-primary);max-width:520px;line-height:1.5;word-break:break-word}
.dsh-shot-caption{font-size:13px;color:var(--dsw-alias-label-primary)}
.dsh-shot-spinner{width:26px;height:26px;border-radius:50%;border:2.5px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:dsh-shot-spin .8s linear infinite}
@keyframes dsh-shot-spin{to{transform:rotate(360deg)}}
.dsh-shot-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dsh-shot-rowText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px}
.dsh-shot-rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dsh-shot-rowDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
`

    const store = {
      state: {
        status: 'idle',
        shot: null,
        error: '',
        minimize: true,
        copied: false,
      },
      listeners: new Set(),
      get() {
        return store.state
      },
      set(patch) {
        store.state = { ...store.state, ...patch }
        for (const listener of [...store.listeners]) listener()
      },
      subscribe(listener) {
        store.listeners.add(listener)
        return () => {
          store.listeners.delete(listener)
        }
      },
    }

    const EMPTY_LOCALE = Object.freeze({ active: 'en', revision: 0 })
    let localeFace = null

    function subscribeLocale(listener) {
      if (localeFace === null) return () => {}
      return localeFace.subscribe(listener)
    }
    function localeSnapshot() {
      return localeFace === null ? EMPTY_LOCALE : localeFace.getSnapshot()
    }

    function useT() {
      React.useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot)
      if (localeFace === null) return (key) => DICT.en[key] ?? key
      const translate = localeFace.bind(NS)
      return (key) => translate(key)
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
      return response.json()
    }

    async function captureNow() {
      const { minimize } = store.get()
      const lang = localeSnapshot().active === 'zh' ? 'zh' : 'en'
      store.set({ status: 'capturing', error: '', copied: false })
      try {
        const payload = await postJson(CAPTURE_ENDPOINT, { mode: minimize ? 'minimize' : 'keep', lang })
        if (payload !== null && typeof payload === 'object' && payload.ok === true) {
          if (payload.cancelled === true) {
            store.set({ status: 'idle', error: '', copied: false })
            return
          }
          store.set({ status: 'preview', shot: payload })
          if (payload.variant === 'keep' || payload.variant === 'clear') setMinimize(payload.variant === 'clear')
          return
        }
        throw new Error(payload?.error ?? 'capture failed')
      } catch (error) {
        store.set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    }

    async function loadSettings() {
      try {
        const payload = await postJson(SETTINGS_ENDPOINT, {})
        if (typeof payload?.minimize === 'boolean') store.set({ minimize: payload.minimize })
      } catch {
        /* keep the default; the toggle retries on the next write */
      }
    }

    function setMinimize(next) {
      store.set({ minimize: next })
      postJson(SETTINGS_ENDPOINT, { minimize: next }).catch(() => {})
    }

    function closePreview() {
      store.set({ status: 'idle', shot: null, error: '', copied: false })
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
      return `${bytes} B`
    }

    function paintOp(ctx, op) {
      ctx.save()
      ctx.strokeStyle = op.color
      ctx.fillStyle = op.color
      ctx.lineWidth = op.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (op.type === 'rect') {
        ctx.strokeRect(op.x, op.y, op.w, op.h)
      } else if (op.type === 'line') {
        ctx.beginPath()
        ctx.moveTo(op.x1, op.y1)
        ctx.lineTo(op.x2, op.y2)
        ctx.stroke()
      } else if (op.type === 'pen') {
        const points = op.points
        if (points.length === 1) {
          ctx.beginPath()
          ctx.arc(points[0][0], points[0][1], Math.max(1, op.width / 2), 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(points[0][0], points[0][1])
          for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1])
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    function Styles() {
      return h('style', { 'data-dsh-screenshot': '' }, CSS)
    }

    function CameraIcon(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          ...props,
        },
        h('path', {
          d: 'M4 8.8A2.8 2.8 0 0 1 6.8 6h1.05a1 1 0 0 0 .84-.46l.69-1.08A1.4 1.4 0 0 1 10.56 4h2.88a1.4 1.4 0 0 1 1.18.62l.69 1.08a1 1 0 0 0 .84.46h1.05A2.8 2.8 0 0 1 20 8.8v8A2.8 2.8 0 0 1 17.2 19.6H6.8A2.8 2.8 0 0 1 4 16.8z',
        }),
        h('circle', { cx: 12, cy: 12.6, r: 3.25 }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M6 6l12 12M18 6L6 18' }),
      )
    }

    function RectIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 4, y: 5.5, width: 16, height: 13, rx: 1.5 }),
      )
    }

    function LineIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 20L20 4' }),
      )
    }

    function PenIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 20l4.2-1 9.3-9.3a2.1 2.1 0 0 0-3-3L5.2 16z' }),
        h('path', { d: 'M13.6 5.9l3 3' }),
      )
    }

    function ScreenshotButton() {
      const state = React.useSyncExternalStore(store.subscribe, store.get, store.get)
      const t = useT()
      const busy = state.status === 'capturing'
      return h(
        React.Fragment,
        null,
        h(Styles),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-shot-btn',
            title: t('button.title'),
            'aria-label': t('button.title'),
            'aria-busy': busy ? 'true' : 'false',
            disabled: busy,
            onClick: () => {
              if (!busy) void captureNow()
            },
          },
          h(CameraIcon),
        ),
      )
    }

    function PreviewStage({ state, t }) {
      const shot = state.shot
      const baseRef = React.useRef(null)
      const drawRef = React.useRef(null)
      const imageRef = React.useRef(null)
      const opsRef = React.useRef([])
      const dragRef = React.useRef(null)
      const [tool, setTool] = React.useState('rect')
      const [color, setColor] = React.useState(TOOL_COLORS[0])
      const [widthIndex, setWidthIndex] = React.useState(1)
      const [opCount, setOpCount] = React.useState(0)
      const [ready, setReady] = React.useState(false)
      const bodyRef = React.useRef(null)
      const [viewSize, setViewSize] = React.useState(null)
      const measure = React.useCallback(() => {
        const body = bodyRef.current
        if (body === null) return
        const availableWidth = Math.max(160, body.clientWidth - 24)
        const availableHeight = Math.max(120, body.clientHeight - 24)
        const scale = Math.min(availableWidth / shot.width, availableHeight / shot.height, 1)
        setViewSize({ width: Math.round(shot.width * scale), height: Math.round(shot.height * scale) })
      }, [shot.width, shot.height])
      React.useEffect(() => {
        measure()
        const onResize = () => measure()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [measure])
      const width = Math.max(2, Math.round(Math.min(shot.width, shot.height) * TOOL_RATIOS[widthIndex]))

      const redraw = React.useCallback(() => {
        const canvas = drawRef.current
        if (canvas === null) return
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, canvas.width, canvas.height)
        for (const op of opsRef.current) paintOp(context, op)
        const drag = dragRef.current
        if (drag !== null && drag.preview !== undefined) paintOp(context, drag.preview)
      }, [])

      React.useEffect(() => {
        let cancelled = false
        const image = new Image()
        image.onload = () => {
          if (cancelled) return
          imageRef.current = image
          const base = baseRef.current
          const draw = drawRef.current
          if (base !== null) {
            base.width = shot.width
            base.height = shot.height
            const context = base.getContext('2d')
            context.clearRect(0, 0, base.width, base.height)
            context.drawImage(image, 0, 0, shot.width, shot.height)
          }
          if (draw !== null) {
            draw.width = shot.width
            draw.height = shot.height
          }
          setReady(true)
          window.requestAnimationFrame(() => measure())
        }
        image.src = shot.dataUrl
        return () => {
          cancelled = true
        }
      }, [shot.dataUrl, shot.width, shot.height])

      const pointFromEvent = (event) => {
        const canvas = drawRef.current
        const rect = canvas.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * canvas.width
        const y = ((event.clientY - rect.top) / rect.height) * canvas.height
        return {
          x: Math.max(0, Math.min(canvas.width, x)),
          y: Math.max(0, Math.min(canvas.height, y)),
        }
      }

      const onPointerDown = (event) => {
        if (!ready || event.button !== 0) return
        event.preventDefault()
        const canvas = drawRef.current
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          /* older browsers */
        }
        const point = pointFromEvent(event)
        if (tool === 'pen') {
          const pen = { type: 'pen', points: [[point.x, point.y]], color, width }
          dragRef.current = { pointerId: event.pointerId, pen, last: point }
          paintOp(canvas.getContext('2d'), pen)
          return
        }
        const preview =
          tool === 'rect'
            ? { type: 'rect', x: point.x, y: point.y, w: 0, h: 0, color, width }
            : { type: 'line', x1: point.x, y1: point.y, x2: point.x, y2: point.y, color, width }
        dragRef.current = { pointerId: event.pointerId, start: point, preview }
        redraw()
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.pointerId !== event.pointerId) return
        const point = pointFromEvent(event)
        if (drag.pen !== undefined) {
          const last = drag.last
          const dx = point.x - last.x
          const dy = point.y - last.y
          if (dx * dx + dy * dy < 1) return
          drag.pen.points.push([point.x, point.y])
          drag.last = point
          const context = drawRef.current.getContext('2d')
          context.save()
          context.strokeStyle = drag.pen.color
          context.lineWidth = drag.pen.width
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.beginPath()
          context.moveTo(last.x, last.y)
          context.lineTo(point.x, point.y)
          context.stroke()
          context.restore()
          return
        }
        const start = drag.start
        if (drag.preview.type === 'rect') {
          drag.preview = {
            ...drag.preview,
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            w: Math.abs(point.x - start.x),
            h: Math.abs(point.y - start.y),
          }
        } else {
          let end = point
          if (event.shiftKey) {
            end = Math.abs(point.x - start.x) >= Math.abs(point.y - start.y)
              ? { x: point.x, y: start.y }
              : { x: start.x, y: point.y }
          }
          drag.preview = { ...drag.preview, x2: end.x, y2: end.y }
        }
        redraw()
      }

      const finishDrag = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.pointerId !== event.pointerId) return
        dragRef.current = null
        const canvas = drawRef.current
        try {
          canvas.releasePointerCapture(event.pointerId)
        } catch {
          /* ignore */
        }
        if (drag.pen !== undefined) {
          if (drag.pen.points.length > 0) {
            opsRef.current = [...opsRef.current, drag.pen]
            setOpCount(opsRef.current.length)
          }
          redraw()
          return
        }
        const preview = drag.preview
        let op = null
        if (preview.type === 'rect') {
          if (preview.w >= 3 && preview.h >= 3) op = preview
        } else if (Math.abs(preview.x2 - preview.x1) + Math.abs(preview.y2 - preview.y1) >= 3) {
          op = preview
        }
        if (op !== null) {
          opsRef.current = [...opsRef.current, op]
          setOpCount(opsRef.current.length)
        }
        redraw()
      }

      const compose = () => {
        const canvas = document.createElement('canvas')
        canvas.width = shot.width
        canvas.height = shot.height
        const context = canvas.getContext('2d')
        if (imageRef.current !== null) context.drawImage(imageRef.current, 0, 0, shot.width, shot.height)
        if (drawRef.current !== null) context.drawImage(drawRef.current, 0, 0)
        return canvas
      }

      const copyImage = async () => {
        try {
          const canvas = compose()
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
          if (blob === null) throw new Error('empty image')
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          store.set({ copied: true, error: '' })
          setTimeout(() => {
            if (store.get().copied) store.set({ copied: false })
          }, 1800)
        } catch (error) {
          store.set({ copied: false, error: `复制失败：${error instanceof Error ? error.message : String(error)}` })
        }
      }

      const download = () => {
        const anchor = document.createElement('a')
        anchor.href = compose().toDataURL('image/png')
        const now = new Date()
        const pad = (value) => String(value).padStart(2, '0')
        anchor.download = `screenshot-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      }

      const undo = () => {
        if (opsRef.current.length === 0) return
        opsRef.current = opsRef.current.slice(0, -1)
        setOpCount(opsRef.current.length)
        redraw()
      }

      const clear = () => {
        if (opsRef.current.length === 0) return
        opsRef.current = []
        setOpCount(0)
        redraw()
      }

      const meta = [
        `${shot.width} × ${shot.height}`,
        formatBytes(shot.bytes),
        shot.variant === 'clear' || (shot.variant === undefined && shot.mode === 'minimize') ? t('mode.minimize') : t('mode.keep'),
        t('edit.hint'),
      ]
        .filter((part) => part !== '')
        .join(' · ')

      return h(
        React.Fragment,
        null,
        h(Styles),
        h(
          'div',
          { className: 'dsh-shot-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) closePreview() } },
          h(
            'div',
            { className: 'dsh-shot-panel dsh-shot-panel--editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('preview.title') },
            h(
              'header',
              { className: 'dsh-shot-head' },
              h(
                'div',
                { className: 'dsh-shot-heading' },
                h('span', { className: 'dsh-shot-title' }, t('preview.title')),
                h('span', { className: 'dsh-shot-meta' }, meta),
              ),
              h('button', { type: 'button', className: 'dsh-shot-icon', onClick: closePreview, 'aria-label': t('close'), title: t('close') }, h(CloseIcon)),
            ),
            h(
              'div',
              { className: 'dsh-shot-tools' },
              h(
                'div',
                { className: 'dsh-shot-group' },
                h('button', {
                  type: 'button',
                  className: 'dsh-shot-tool',
                  'aria-pressed': tool === 'rect' ? 'true' : 'false',
                  'aria-label': t('tool.rect'),
                  title: t('tool.rect'),
                  onClick: () => setTool('rect'),
                }, h(RectIcon)),
                h('button', {
                  type: 'button',
                  className: 'dsh-shot-tool',
                  'aria-pressed': tool === 'line' ? 'true' : 'false',
                  'aria-label': t('tool.line'),
                  title: t('tool.line'),
                  onClick: () => setTool('line'),
                }, h(LineIcon)),
                h('button', {
                  type: 'button',
                  className: 'dsh-shot-tool',
                  'aria-pressed': tool === 'pen' ? 'true' : 'false',
                  'aria-label': t('tool.pen'),
                  title: t('tool.pen'),
                  onClick: () => setTool('pen'),
                }, h(PenIcon)),
              ),
              h(
                'div',
                { className: 'dsh-shot-group', role: 'group', 'aria-label': t('tool.color') },
                ...TOOL_COLORS.map((value) =>
                  h('button', {
                    key: value,
                    type: 'button',
                    className: 'dsh-shot-color',
                    style: { background: value },
                    'data-on': color === value ? 'true' : 'false',
                    'aria-label': value,
                    title: value,
                    onClick: () => setColor(value),
                  }),
                ),
              ),
              h(
                'div',
                { className: 'dsh-shot-group', role: 'group', 'aria-label': t('tool.width') },
                ...[0, 1, 2].map((index) =>
                  h('button', {
                    key: index,
                    type: 'button',
                    className: 'dsh-shot-width',
                    'data-on': widthIndex === index ? 'true' : 'false',
                    title: t('tool.width'),
                    'aria-label': `${t('tool.width')} ${index + 1}`,
                    onClick: () => setWidthIndex(index),
                  }, h('i', { style: { width: `${6 + index * 4}px`, height: `${6 + index * 4}px` } })),
                ),
              ),
              h(
                'div',
                { className: 'dsh-shot-group dsh-shot-group--last' },
                h('button', {
                  type: 'button',
                  className: 'dsh-shot-textbtn',
                  disabled: opCount === 0,
                  onClick: undo,
                }, t('tool.undo')),
                h('button', {
                  type: 'button',
                  className: 'dsh-shot-textbtn',
                  disabled: opCount === 0,
                  onClick: clear,
                }, t('tool.clear')),
              ),
            ),
            h(
              'div',
              { className: 'dsh-shot-body', ref: bodyRef },
              h(
                'div',
                {
                  className: 'dsh-shot-canvaswrap',
                  style: viewSize === null ? undefined : { width: viewSize.width + 'px', height: viewSize.height + 'px' },
                },
                h('canvas', { ref: baseRef, className: 'dsh-shot-canvas' }),
                h('canvas', {
                  ref: drawRef,
                  className: 'dsh-shot-canvas dsh-shot-canvas--draw',
                  onPointerDown,
                  onPointerMove,
                  onPointerUp: finishDrag,
                  onPointerCancel: finishDrag,
                }),
              ),
            ),
            h(
              'footer',
              { className: 'dsh-shot-foot' },

              h(
                'div',
                { className: 'dsh-shot-actions' },
                state.error !== '' ? h('span', { className: 'dsh-shot-error' }, state.error) : null,
                state.copied ? h('span', { className: 'dsh-shot-hint' }, t('copied')) : null,
                h('button', { type: 'button', className: 'dsh-shot-action', onClick: () => { void captureNow() } }, t('retake')),
                h('button', { type: 'button', className: 'dsh-shot-action', onClick: () => { void copyImage() } }, t('copy')),
                h('button', { type: 'button', className: 'dsh-shot-action', onClick: download }, t('download')),
                h('button', { type: 'button', className: 'dsh-shot-action dsh-shot-action--primary', onClick: closePreview }, t('done')),
              ),
            ),
          ),
        ),
      )
    }

    function PreviewOverlay() {
      const state = React.useSyncExternalStore(store.subscribe, store.get, store.get)
      const t = useT()
      const [slowCapturing, setSlowCapturing] = React.useState(false)
      React.useEffect(() => {
        if (state.status !== 'capturing') {
          setSlowCapturing(false)
          return undefined
        }
        const timer = setTimeout(() => setSlowCapturing(true), 1200)
        return () => clearTimeout(timer)
      }, [state.status])
      React.useEffect(() => {
        if (state.status === 'idle') return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closePreview()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.status])
      if (state.status === 'idle') return null
      if (state.status === 'capturing') {
        // Never paint a page overlay before the grab: the Harness frame is captured
        // right after the request arrives, so anything drawn here would end up in it.
        if (!slowCapturing) return null
        return h(
          React.Fragment,
          null,
          h(Styles),
          h(
            'div',
            { className: 'dsh-shot-backdrop' },
            h(
              'div',
              { className: 'dsh-shot-panel dsh-shot-panel--small', role: 'status' },
              h('div', { className: 'dsh-shot-spinner' }),
              h('div', { className: 'dsh-shot-caption' }, t('capturing')),
            ),
          ),
        )
      }
      if (state.status === 'error') {
        return h(
          React.Fragment,
          null,
          h(Styles),
          h(
            'div',
            { className: 'dsh-shot-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) closePreview() } },
            h(
              'div',
              { className: 'dsh-shot-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('error.title') },
              h(
                'header',
                { className: 'dsh-shot-head' },
                h('div', { className: 'dsh-shot-heading' }, h('span', { className: 'dsh-shot-title' }, t('error.title'))),
                h('button', { type: 'button', className: 'dsh-shot-icon', onClick: closePreview, 'aria-label': t('close'), title: t('close') }, h(CloseIcon)),
              ),
              h('div', { className: 'dsh-shot-foot' },
                h('div', { className: 'dsh-shot-error' }, state.error === '' ? t('error.title') : state.error),
                h('div', { className: 'dsh-shot-actions' },
                  h('button', { type: 'button', className: 'dsh-shot-action', onClick: () => { void captureNow() } }, t('retry')),
                  h('button', { type: 'button', className: 'dsh-shot-action dsh-shot-action--primary', onClick: closePreview }, t('done')),
                ),
              ),
            ),
          ),
        )
      }
      return h(PreviewStage, { state, t })
    }

    function ScreenshotSettingRow() {
      const state = React.useSyncExternalStore(store.subscribe, store.get, store.get)
      const t = useT()
      return h(
        React.Fragment,
        null,
        h(Styles),
        h(
          'div',
          { className: 'dsh-shot-row' },
          h(
            'div',
            { className: 'dsh-shot-rowText' },
            h('div', { className: 'dsh-shot-rowTitle' }, t('setting.title')),
            h('div', { className: 'dsh-shot-rowDesc' }, t('setting.desc')),
          ),
          h('button', {
            type: 'button',
            role: 'switch',
            className: 'dsh-shot-switch',
            'data-on': state.minimize ? 'true' : 'false',
            'aria-checked': state.minimize ? 'true' : 'false',
            'aria-label': t('setting.minimize'),
            title: t('setting.minimize'),
            onClick: () => setMinimize(!state.minimize),
          }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeFace = ctx.locale
        ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-screenshot: dictionaries')
        const label = () => DICT[localeSnapshot().active === 'zh' ? 'zh' : 'en']['button.label']
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'dsh-screenshot.button', order: 20, label },
            ScreenshotButton,
          ),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-screenshot.preview', order: 120 }, PreviewOverlay),
        )
        ctx.slots.inject('settings.general.item', () =>
          ctx.slots.register({ name: 'settings.general.item', id: 'dsh-screenshot.setting', order: 30, label }, ScreenshotSettingRow),
        )
        void loadSettings()
        ctx.effect(() => {
          const onKeyDown = (event) => {
            if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return
            if (event.key !== 's' && event.key !== 'S') return
            if (store.get().status !== 'idle') return
            event.preventDefault()
            event.stopPropagation()
            void captureNow()
          }
          window.addEventListener('keydown', onKeyDown, true)
          return () => window.removeEventListener('keydown', onKeyDown, true)
        }, 'dsh-screenshot: shortcut')

      },
    }
  },
})







