"use client"

import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist"
import * as React from "react"

type PdfjsModule = typeof import("pdfjs-dist")

let pdfjsPromise: Promise<PdfjsModule> | null = null

// pdf.js plus its worker is well over a megabyte, and only matters once a PDF
// is actually attached — so it is pulled in on demand rather than bundled into
// the initial load. Renders page images ourselves instead of handing the file
// to an <iframe>: the browsers' built-in viewers are not stylable, paint their
// own toolbar and scrollbar over whatever box they are given, and on Android
// are absent entirely, leaving the preview blank.
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
    return pdfjs
  })

  return pdfjsPromise
}

export interface PdfDocumentState {
  doc: PDFDocumentProxy | null
  numPages: number
  status: "loading" | "ready" | "error"
}

export function usePdfDocument(file: File): PdfDocumentState {
  const [state, setState] = React.useState<PdfDocumentState>({
    doc: null,
    numPages: 0,
    status: "loading",
  })

  React.useEffect(() => {
    let cancelled = false
    // Teardown goes through the loading task, which owns both the worker
    // transport and the document it resolved to.
    let task: ReturnType<PdfjsModule["getDocument"]> | null = null

    setState({ doc: null, numPages: 0, status: "loading" })

    void (async () => {
      try {
        const [pdfjs, data] = await Promise.all([
          loadPdfjs(),
          file.arrayBuffer(),
        ])
        if (cancelled) return

        // Reads the bytes per document rather than sharing one buffer: pdf.js
        // takes ownership of what it is handed and detaches it.
        task = pdfjs.getDocument({ data: new Uint8Array(data) })
        const loaded = await task.promise
        if (cancelled) return

        setState({ doc: loaded, numPages: loaded.numPages, status: "ready" })
      } catch {
        if (!cancelled) setState({ doc: null, numPages: 0, status: "error" })
      }
    })()

    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [file])

  return state
}

interface PdfPageCanvasProps {
  doc: PDFDocumentProxy | null
  pageNumber: number
  /**
   * Canvas backing-store width in pixels. CSS decides the displayed size, so
   * this is purely how much detail gets rendered.
   */
  renderWidth: number
  className?: string
  label: string
}

export function PdfPageCanvas({
  doc,
  pageNumber,
  renderWidth,
  className,
  label,
}: PdfPageCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    let cancelled = false
    let task: RenderTask | null = null

    void (async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return

      const unscaled = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: renderWidth / unscaled.width })

      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)

      task = page.render({ canvas, viewport })
      try {
        await task.promise
      } catch {
        // Rejects when the cleanup below cancels an in-flight render, which is
        // the expected path whenever the page or render size changes.
      }
    })()

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, renderWidth])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={label}
    />
  )
}

/**
 * Available space for a page, tracked so the fit-to-view scale can be
 * recomputed when the dialog is resized or the device rotated.
 */
export function useElementSize() {
  // A callback ref rather than a plain one: the element being measured lives
  // inside a dialog that is unmounted while closed, so the observer has to
  // attach whenever it appears, not once on mount.
  const [element, setElement] = React.useState<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })

  React.useEffect(() => {
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  return [setElement, size] as const
}

interface PdfPageViewProps {
  doc: PDFDocumentProxy | null
  pageNumber: number
  /** Space the page is fitted into, in CSS pixels. */
  fitWidth: number
  fitHeight: number
  /** Multiplier on top of the fit-to-view scale, where 1 shows the whole page. */
  zoom: number
  label: string
}

/**
 * A page rendered to canvas with pdf.js' text layer over it — transparent spans
 * placed over the glyphs they correspond to, which is what makes the text
 * selectable. Selection is why nothing here intercepts drag: panning is left to
 * the scroll container this sits in, so dragging selects text as it would on
 * any other page.
 */
export function PdfPageView({
  doc,
  pageNumber,
  fitWidth,
  fitHeight,
  zoom,
  label,
}: PdfPageViewProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const textLayerRef = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState<{
    width: number
    height: number
    scale: number
  } | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const textContainer = textLayerRef.current
    if (!doc || !canvas || !textContainer) return
    if (fitWidth <= 0 || fitHeight <= 0) return

    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null

    void (async () => {
      const [pdfjs, page] = await Promise.all([
        loadPdfjs(),
        doc.getPage(pageNumber),
      ])
      if (cancelled) return

      const unscaled = page.getViewport({ scale: 1 })
      const scale =
        Math.min(fitWidth / unscaled.width, fitHeight / unscaled.height) * zoom
      const viewport = page.getViewport({ scale })

      // The canvas is laid out at CSS size but painted at device resolution, so
      // text stays sharp on high-DPI screens and when zoomed in.
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(viewport.width * ratio)
      canvas.height = Math.round(viewport.height * ratio)
      setSize({ width: viewport.width, height: viewport.height, scale })

      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })

      try {
        await renderTask.promise
      } catch {
        return
      }
      if (cancelled) return

      textContainer.replaceChildren()
      textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textContainer,
        viewport,
      })
      await textLayer.render()
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [doc, pageNumber, fitWidth, fitHeight, zoom])

  return (
    <div
      className="relative shrink-0 bg-white shadow-sm"
      style={
        {
          width: size?.width,
          height: size?.height,
          // pdf.js derives the text spans' font size and offsets from this, so
          // it has to match the scale the canvas was rendered at.
          "--total-scale-factor": size?.scale,
        } as React.CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block h-full w-full"
      />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  )
}

function clampZoom(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function touchDistance(touches: TouchList) {
  const [a, b] = [touches[0], touches[1]]
  if (!a || !b) return 0
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

interface PdfViewportProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  minZoom?: number
  maxZoom?: number
  children: React.ReactNode
}

/**
 * Scrolling viewport for a page, with pinch-to-zoom on touch.
 *
 * A pinch only applies a CSS transform while the fingers are down and commits
 * the real zoom on release: re-rendering the page through pdf.js on every touch
 * move would mean a full rasterise per frame. The scroll position is restored
 * afterwards against the point the fingers were over, so the page does not jump
 * to somewhere else the moment the gesture ends.
 */
export function PdfViewport({
  zoom,
  onZoomChange,
  minZoom = 1,
  maxZoom = 4,
  children,
}: PdfViewportProps) {
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null)
  const pageBoxRef = React.useRef<HTMLDivElement>(null)
  const [gesture, setGesture] = React.useState<{
    scale: number
    originX: number
    originY: number
  } | null>(null)

  // The listeners below are attached once, so anything they need from render
  // has to reach them through a ref rather than a closure.
  const zoomRef = React.useRef(zoom)
  zoomRef.current = zoom

  // Set when a pinch commits, consumed once the page has re-rendered at its new
  // size — the only point at which the target scroll offsets exist. Measured
  // against the page's own box rather than the scroll content, whose auto
  // margins collapse as the page grows and would drag the anchor with them.
  const pendingAnchor = React.useRef<{
    fractionX: number
    fractionY: number
    pointerX: number
    pointerY: number
  } | null>(null)

  React.useEffect(() => {
    if (!scroller) return

    let startDistance = 0
    let startZoom = 1
    let targetZoom = 0
    let anchor: {
      fractionX: number
      fractionY: number
      pointerX: number
      pointerY: number
    } | null = null

    function onTouchStart(event: TouchEvent) {
      const pageBox = pageBoxRef.current
      if (!scroller || !pageBox || event.touches.length !== 2) return

      const [a, b] = [event.touches[0], event.touches[1]]
      if (!a || !b) return

      const midX = (a.clientX + b.clientX) / 2
      const midY = (a.clientY + b.clientY) / 2
      const scrollerRect = scroller.getBoundingClientRect()
      const pageRect = pageBox.getBoundingClientRect()

      startDistance = touchDistance(event.touches)
      startZoom = zoomRef.current
      targetZoom = startZoom
      anchor = {
        fractionX: clampZoom((midX - pageRect.left) / pageRect.width, 0, 1),
        fractionY: clampZoom((midY - pageRect.top) / pageRect.height, 0, 1),
        pointerX: midX - scrollerRect.left,
        pointerY: midY - scrollerRect.top,
      }

      setGesture({
        scale: 1,
        originX: midX - pageRect.left,
        originY: midY - pageRect.top,
      })
    }

    function onTouchMove(event: TouchEvent) {
      if (!startDistance || !anchor || event.touches.length !== 2) return

      // Holds onto the gesture: left alone, the browser reads the second finger
      // as a two-finger scroll and pans instead of letting us zoom.
      event.preventDefault()

      targetZoom = clampZoom(
        (touchDistance(event.touches) / startDistance) * startZoom,
        minZoom,
        maxZoom,
      )
      setGesture((current) =>
        current ? { ...current, scale: targetZoom / startZoom } : current,
      )
    }

    function onTouchEnd(event: TouchEvent) {
      if (!startDistance || !anchor) return
      if (event.touches.length >= 2) return

      const settled = targetZoom
      if (settled !== startZoom) pendingAnchor.current = anchor

      startDistance = 0
      anchor = null
      setGesture(null)

      if (settled !== startZoom) onZoomChange(settled)
    }

    scroller.addEventListener("touchstart", onTouchStart, { passive: true })
    scroller.addEventListener("touchmove", onTouchMove, { passive: false })
    scroller.addEventListener("touchend", onTouchEnd)
    scroller.addEventListener("touchcancel", onTouchEnd)

    return () => {
      scroller.removeEventListener("touchstart", onTouchStart)
      scroller.removeEventListener("touchmove", onTouchMove)
      scroller.removeEventListener("touchend", onTouchEnd)
      scroller.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [scroller, minZoom, maxZoom, onZoomChange])

  React.useEffect(() => {
    const pageBox = pageBoxRef.current
    if (!scroller || !pageBox) return

    const observer = new ResizeObserver(() => {
      const target = pendingAnchor.current
      if (!target) return
      pendingAnchor.current = null

      // Nudges the scroll by however far the anchored point has drifted from
      // the fingers, so the spot being pinched stays put across the re-render.
      const scrollerRect = scroller.getBoundingClientRect()
      const pageRect = pageBox.getBoundingClientRect()

      scroller.scrollLeft +=
        pageRect.left -
        scrollerRect.left +
        target.fractionX * pageRect.width -
        target.pointerX
      scroller.scrollTop +=
        pageRect.top -
        scrollerRect.top +
        target.fractionY * pageRect.height -
        target.pointerY
    })
    observer.observe(pageBox)

    return () => observer.disconnect()
  }, [scroller])

  return (
    <div
      ref={setScroller}
      className="h-full w-full touch-pan-x touch-pan-y overflow-auto overscroll-contain"
    >
      <div className="flex min-h-full min-w-full">
        <div
          ref={pageBoxRef}
          className="m-auto"
          style={
            gesture
              ? {
                  transform: `scale(${gesture.scale})`,
                  transformOrigin: `${gesture.originX}px ${gesture.originY}px`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
