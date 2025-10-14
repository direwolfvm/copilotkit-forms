import { PDFDocument, StandardFonts } from "pdf-lib"
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
const LINE_HEIGHT = 16
const SECTION_SPACING = 20
const SMALL_GAP = 8

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

  const drawHeading = (text: string) => {
    ensureSpace(24)
    page.drawText(text, {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 18,
      font: boldFont
    })
    cursorY -= SECTION_SPACING
  }

  const drawSubheading = (text: string) => {
    ensureSpace(18)
    page.drawText(text, {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 14,
      font: boldFont
    })
    cursorY -= SMALL_GAP
  }

  const drawParagraph = (text: string, fontSize = 12) => {
    const lines = wrapText(text, regularFont, fontSize, pageWidth - PAGE_MARGIN * 2)
    const lineHeight = Math.max(LINE_HEIGHT, fontSize + 4)
    for (const line of lines) {
      ensureSpace(lineHeight)
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: cursorY,
        size: fontSize,
        font: regularFont
      })
      cursorY -= lineHeight
    }
    cursorY += lineHeight
    cursorY -= SMALL_GAP
  }

  const drawKeyValue = (label: string, value: string) => {
    const valueLines = wrapText(value, regularFont, 12, pageWidth - PAGE_MARGIN * 2 - 90)
    valueLines.forEach((line, index) => {
      ensureSpace(LINE_HEIGHT)
      if (index === 0) {
        page.drawText(`${label}:`, {
          x: PAGE_MARGIN,
          y: cursorY,
          size: 12,
          font: boldFont
        })
      }
      page.drawText(line, {
        x: PAGE_MARGIN + 80,
        y: cursorY,
        size: 12,
        font: regularFont
      })
      cursorY -= LINE_HEIGHT
    })
    cursorY += LINE_HEIGHT
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

  drawParagraph(`Description: ${renderValue(project.description)}`)

  drawSubheading("Location")
  drawParagraph(`Narrative: ${renderValue(project.location_text)}`)
  if (typeof project.location_lat === "number" && typeof project.location_lon === "number") {
    drawParagraph(`Coordinates: ${project.location_lat}, ${project.location_lon}`)
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
        drawParagraph(`Name: ${contact.name}`)
      }
      if (contact.organization) {
        drawParagraph(`Organization: ${contact.organization}`)
      }
      if (contact.email) {
        drawParagraph(`Email: ${contact.email}`)
      }
      if (contact.phone) {
        drawParagraph(`Phone: ${contact.phone}`)
      }
    }
  }

  drawSubheading("Pre-screening status")
  const preScreeningStatus = determinePreScreeningStatus(portalProgress)
  drawParagraph(`Status: ${preScreeningStatus.status}`)
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
      const prefix = item.completed ? "• [x]" : "• [ ]"
      drawParagraph(`${prefix} ${item.label}`)
      if (item.notes) {
        drawParagraph(`   Notes: ${item.notes}`)
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
