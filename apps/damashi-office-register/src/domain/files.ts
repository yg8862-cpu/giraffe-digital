import type { ExtractionMode } from "./types"

export type ReadResult = {
  text: string
  extraction: ExtractionMode
  note: string
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function recognize(blob: Blob, onStatus: (message: string) => void): Promise<string> {
  onStatus("正在识别图片文字，首次会下载中文语言包…")
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("chi_sim+eng", 1, {
    logger: (message) => {
      if (message.status) onStatus(`识别：${message.status}`)
    },
  })
  try {
    const result = await withTimeout(worker.recognize(blob), 45000)
    return result.data.text ?? ""
  } finally {
    await worker.terminate()
  }
}

async function pdfText(data: ArrayBuffer, onStatus: (message: string) => void): Promise<{ text: string; blobs: Blob[] }> {
  onStatus("正在读取 PDF 文字…")
  const pdfjs = await import("pdfjs-dist")
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data }).promise
  let text = ""
  const blobs: Blob[] = []
  const pages = Math.min(doc.numPages, 8)
  for (let index = 1; index <= pages; index++) {
    const page = await doc.getPage(index)
    const content = await page.getTextContent()
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n"
  }
  if (text.replace(/\s/g, "").length < 20) {
    onStatus("PDF 没有可选文字，改为识别前两页…")
    const imagePages = Math.min(doc.numPages, 2)
    for (let index = 1; index <= imagePages; index++) {
      const page = await doc.getPage(index)
      const viewport = page.getViewport({ scale: 1.6 })
      const canvas = document.createElement("canvas")
      canvas.width = Math.min(Math.floor(viewport.width), 1800)
      const scale = canvas.width / viewport.width
      const fitted = page.getViewport({ scale: 1.6 * scale })
      canvas.height = Math.floor(fitted.height)
      const context = canvas.getContext("2d")
      if (!context) continue
      const task = page.render({ canvasContext: context, viewport: fitted })
      await task.promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (blob) blobs.push(blob)
    }
  }
  return { text, blobs }
}

export async function readUpload(files: File[], onStatus: (message: string) => void): Promise<ReadResult> {
  const chunks: string[] = []
  const notes: string[] = []
  let sawPdfText = false
  let sawImage = false
  let sawRendered = false
  for (const file of files) {
    const header = `\n===== 文件：${file.name} =====\n`
    if (file.size > 20 * 1024 * 1024) {
      notes.push(`${file.name} 超过 20MB，跳过自动识别，请手工填写。`)
      continue
    }
    if (/hei[cf]$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif") {
      notes.push(`${file.name} 是 HEIC，试用版不能直接识别。请改成 JPG 或 PDF，也可以先手工填写。`)
      continue
    }
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pdf = await pdfText(await file.arrayBuffer(), onStatus)
        if (pdf.text.replace(/\s/g, "").length >= 20) {
          sawPdfText = true
          chunks.push(header + pdf.text)
        }
        for (const blob of pdf.blobs) {
          const text = await recognize(blob, onStatus)
          if (text.trim()) {
            sawRendered = true
            chunks.push(header + text)
          }
        }
        continue
      }
      if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
        const text = await recognize(file, onStatus)
        sawImage = true
        if (text.trim()) chunks.push(header + text)
        else notes.push(`${file.name} 没有识别出文字。`)
        continue
      }
      notes.push(`${file.name} 不是 PDF 或图片，请手工填写。`)
    } catch {
      notes.push(`${file.name} 读取失败，请手工填写。`)
    }
  }
  const text = chunks.join("\n").trim()
  let extraction: ExtractionMode = "未能自动识别"
  if (sawPdfText) extraction = "PDF文本"
  else if (sawRendered) extraction = "PDF转图识别"
  else if (sawImage && text) extraction = "图片识别"
  if (!text) notes.push("没有读出可用文字。未知项请保持待核，不要填 0。")
  return { text, extraction, note: notes.join(" ") }
}
