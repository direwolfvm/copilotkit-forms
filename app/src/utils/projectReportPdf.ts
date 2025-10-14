import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { ProjectFormData } from "../schema/projectSchema"
import type { PermittingChecklistItem } from "../components/PermittingChecklistSection"
import type { PortalProgressState } from "./projectPersistence"

export type ProjectReportPdfInput = {
  project: ProjectFormData
  permittingChecklist: PermittingChecklistItem[]
  portalProgress: PortalProgressState
  generatedAt: Date
}

const PAGE_MARGIN = 48
const LINE_HEIGHT = 18
const SMALL_GAP = 8
const SECTION_GAP = 28
const SUBSECTION_GAP = 18
const LABEL_COLUMN_WIDTH = 140

export async function createProjectReportPdf({
  project,
  permittingChecklist,
  portalProgress,
  generatedAt
}: ProjectReportPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage()
  let { width: pageWidth, height: pageHeight } = page.getSize()
  let cursorY = pageHeight - PAGE_MARGIN

  const addPage = () => {
    page = pdf.addPage()
    const dimensions = page.getSize()
    pageWidth = dimensions.width
    pageHeight = dimensions.height
    cursorY = pageHeight - PAGE_MARGIN
  }

  const ensureSpace = (required: number) => {
    if (cursorY - required <= PAGE_MARGIN) {
      addPage()
    }
  }

  const drawDivider = () => {
    ensureSpace(SMALL_GAP)
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: cursorY - 2,
      width: pageWidth - PAGE_MARGIN * 2,
      height: 1,
      color: rgb(0.85, 0.85, 0.85)
    })
    cursorY -= SMALL_GAP
  }

  const drawHeading = (text: string) => {
    ensureSpace(SECTION_GAP)
    page.drawText(text, {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 18,
      font: boldFont
    })
    cursorY -= SECTION_GAP - SMALL_GAP
    drawDivider()
  }

  const drawSubheading = (text: string) => {
    ensureSpace(SUBSECTION_GAP)
    page.drawText(text, {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 14,
      font: boldFont
    })
    cursorY -= SUBSECTION_GAP
  }

  const drawParagraph = (text: string, fontSize = 12, indent = 0) => {
    const availableWidth = pageWidth - PAGE_MARGIN * 2 - indent
    const lines = wrapText(text, regularFont, fontSize, availableWidth)
    const lineHeight = Math.max(LINE_HEIGHT, fontSize + 4)
    for (const line of lines) {
      ensureSpace(lineHeight)
      page.drawText(line, {
        x: PAGE_MARGIN + indent,
        y: cursorY,
        size: fontSize,
        font: regularFont
      })
      cursorY -= lineHeight
    }
    cursorY -= SMALL_GAP
  }

  const drawKeyValue = (label: string, value: string) => {
    const labelText = `${label}:`
    const valueLines = wrapText(
      value,
      regularFont,
      12,
      pageWidth - PAGE_MARGIN * 2 - LABEL_COLUMN_WIDTH
    )
    valueLines.forEach((line, index) => {
      ensureSpace(LINE_HEIGHT)
      if (index === 0) {
        page.drawText(labelText, {
          x: PAGE_MARGIN,
          y: cursorY,
          size: 12,
          font: boldFont
        })
      }
      page.drawText(line, {
        x: PAGE_MARGIN + LABEL_COLUMN_WIDTH,
        y: cursorY,
        size: 12,
        font: regularFont
      })
      cursorY -= LINE_HEIGHT
    })
    cursorY -= SMALL_GAP
  }

  const drawLabeledParagraph = (label: string, value: string) => {
    ensureSpace(LINE_HEIGHT)
    page.drawText(`${label}:`, {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 12,
      font: boldFont
    })
    cursorY -= LINE_HEIGHT
    drawParagraph(value)
  }

  const drawBulletedText = (text: string, indent = 0) => {
    const bulletX = PAGE_MARGIN + indent
    const textIndent = 16
    const lines = wrapText(
      text,
      regularFont,
      12,
      pageWidth - PAGE_MARGIN * 2 - indent - textIndent
    )
    lines.forEach((line, index) => {
      ensureSpace(LINE_HEIGHT)
      if (index === 0) {
        page.drawText("•", {
          x: bulletX,
          y: cursorY,
          size: 12,
          font: regularFont
        })
      }
      page.drawText(line, {
        x: bulletX + textIndent,
        y: cursorY,
        size: 12,
        font: regularFont
      })
      cursorY -= LINE_HEIGHT
    })
    cursorY -= SMALL_GAP
  }

  drawHeading("Project summary report")
  drawParagraph(`Generated ${generatedAt.toLocaleString()}`)

  drawSubheading("Project overview")
  drawKeyValue("Title", renderValue(project.title))
  drawKeyValue("Identifier", renderValue(project.id))
  drawKeyValue("Sector", renderValue(project.sector))
  drawKeyValue("Lead agency", renderValue(project.lead_agency))
  drawKeyValue("Sponsor", renderValue(project.sponsor))

  drawLabeledParagraph("Description", renderValue(project.description))

  drawSubheading("Location")
  drawLabeledParagraph("Narrative", renderValue(project.location_text))
  if (typeof project.location_lat === "number" && typeof project.location_lon === "number") {
    drawLabeledParagraph(
      "Coordinates",
      `${project.location_lat.toFixed(6)}, ${project.location_lon.toFixed(6)}`
    )
  }

  if (project.sponsor_contact) {
    const contact = project.sponsor_contact
    if (
      contact.name ||
      contact.organization ||
      contact.email ||
      contact.phone
    ) {
      drawSubheading("Sponsor contact")
      if (contact.name) {
        drawLabeledParagraph("Name", contact.name)
      }
      if (contact.organization) {
        drawLabeledParagraph("Organization", contact.organization)
      }
      if (contact.email) {
        drawLabeledParagraph("Email", contact.email)
      }
      if (contact.phone) {
        drawLabeledParagraph("Phone", contact.phone)
      }
    }
  }

  drawSubheading("Pre-screening status")
  const preScreeningStatus = determinePreScreeningStatus(portalProgress)
  drawLabeledParagraph("Status", preScreeningStatus.status)
  if (preScreeningStatus.detail) {
    drawParagraph(preScreeningStatus.detail)
  }

  drawSubheading("Permitting checklist")
  if (permittingChecklist.length === 0) {
    drawParagraph("No checklist items recorded.")
  } else {
    const completed = permittingChecklist.filter((item) => item.completed).length
    drawParagraph(`${completed} of ${permittingChecklist.length} items completed.`)
    for (const item of permittingChecklist) {
      const prefix = item.completed ? "[x]" : "[ ]"
      drawBulletedText(`${prefix} ${item.label}`)
      if (item.notes) {
        drawParagraph(`Notes: ${item.notes}`, 12, 32)
      }
    }
  }

  return pdf.save()
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not provided"
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "Not provided"
  }
  return String(value)
}

function determinePreScreeningStatus(progress: PortalProgressState): {
  status: string
  detail?: string
} {
  const { preScreening } = progress
  if (preScreening.completedAt) {
    const detail = formatDateDetail("Decision payload submitted", preScreening.completedAt)
    return { status: "Complete", detail }
  }
  if (preScreening.initiatedAt) {
    const detail = formatDateDetail("In progress", preScreening.initiatedAt)
    return { status: "In progress", detail }
  }
  return { status: "Not started" }
}

function formatDateDetail(prefix: string, iso: string): string | undefined {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) {
    return prefix
  }
  return `${prefix} on ${new Date(parsed).toLocaleDateString()}`
}

function wrapText(
  text: string,
  font: import("pdf-lib").PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text) {
    return [""]
  }

  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(candidate, fontSize)
    if (width <= maxWidth) {
      currentLine = candidate
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        lines.push(...splitLongWord(word, font, fontSize, maxWidth))
        currentLine = ""
      } else {
        currentLine = word
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : [""]
}

function splitLongWord(
  word: string,
  font: import("pdf-lib").PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const characters = [...word]
  const segments: string[] = []
  let segment = ""
  for (const char of characters) {
    const candidate = segment + char
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      segment = candidate
    } else {
      if (segment) {
        segments.push(segment)
      }
      segment = char
    }
  }
  if (segment) {
    segments.push(segment)
  }
  return segments
}
