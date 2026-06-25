const { PDFParse } = require('pdf-parse')

const NATURES_BIEN = [
  'DEPENDANCE BATIE ISOLEE',
  'DEPENDANCE BATIE',
  'MAISON',
  'APPARTEMENT',
  'LOCAL COMMERCIAL',
  'LOCAL PROFESSIONNEL',
]

const normalizeText = (value) => {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

const toLines = (text) => {
  return text
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean)
}

const parseDecimal = (value) => {
  if (value === undefined || value === null || value === '') return null

  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(',', '.')

  const number = Number(normalized)
  return Number.isNaN(number) ? null : number
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy()
  }
}

function extractInvariant(lines) {
  const candidates = lines
    .map((line) => line.match(/^(\d{7,12})(?:\s+[A-Z])?$/))
    .filter(Boolean)
    .map((match) => match[1])

  return candidates[0] ?? null
}

function extractAddress(lines) {
  const cityIndex = lines.findIndex((line) => /^\d{5}\s+[A-ZÀ-Ý][A-ZÀ-Ý '\-]+$/.test(line))
  if (cityIndex === -1) {
    return { rue: null, depcom: null, ville: null }
  }

  const cityMatch = lines[cityIndex].match(/^(\d{5})\s+(.+)$/)
  const addressCandidates = lines
    .slice(0, cityIndex)
    .filter((line) => /^\d{1,5}\s+/.test(line) && !/^\d+\s+[A-ZÀ-Ý]+\/.+/.test(line))

  return {
    rue: addressCandidates.at(-1) ?? null,
    depcom: cityMatch?.[1] ?? null,
    ville: cityMatch?.[2] ?? null,
  }
}

function extractNatureAndCategory(lines) {
  for (const line of lines) {
    const nature = NATURES_BIEN.find((candidate) => line.includes(candidate))
    if (!nature) continue

    const suffix = line.slice(line.indexOf(nature) + nature.length).trim()
    const tokens = suffix.split(/\s+/).filter(Boolean)
    const oneLetterTokens = tokens.filter((token) => /^[A-Z]$/.test(token))

    return {
      nature_bien: nature,
      categorie: oneLetterTokens[1] ?? oneLetterTokens[0] ?? null,
    }
  }

  return { nature_bien: null, categorie: null }
}

function extractSurface(lines) {
  const relevantLines = lines.filter((line) => !/^\d{7,12}(?:\s+[A-Z])?$/.test(line))
  const editionIndex = relevantLines.findIndex((line) => line.includes('EDITION'))
  const tail = editionIndex === -1 ? relevantLines.slice(-8) : relevantLines.slice(Math.max(0, editionIndex - 8), editionIndex)
  const numbers = tail
    .flatMap((line) => Array.from(line.matchAll(/\b\d{1,5}(?:\s*,\s*\d{1,2})?\b/g), (match) => parseDecimal(match[0])))
    .filter((number) => number !== null && number > 0 && number <= 10000)

  if (numbers.length === 0) return null

  const repeated = numbers.findLast((number, index) => numbers.indexOf(number) !== index)
  return repeated ?? numbers.at(-1)
}

function parseTaxeFonciereText(text) {
  const lines = toLines(text)
  const address = extractAddress(lines)
  const natureAndCategory = extractNatureAndCategory(lines)

  return {
    invariant: extractInvariant(lines),
    rue: address.rue,
    depcom: address.depcom,
    ville: address.ville,
    nom_immeuble: null,
    nature_bien: natureAndCategory.nature_bien,
    ponderation_nature: null,
    etage: null,
    categorie: natureAndCategory.categorie,
    surface_m2: extractSurface(lines),
    coef_entretien: null,
    coef_sit_particuliere: null,
    coef_sit_generale: null,
    ascenseur: null,
    eau_courante: null,
    raccordement_gaz: null,
    raccordement_elec: null,
    nb_baignoires: null,
    nb_douches: null,
    nb_bidets: null,
    nb_wc: null,
    nb_eviers: null,
    raccordement_egout: null,
    nb_pieces: null,
    nb_vide_ordures: null,
  }
}

async function parseTaxeFoncierePdf(buffer) {
  const text = await extractPdfText(buffer)
  return {
    rows: [parseTaxeFonciereText(text)],
    text,
  }
}

module.exports = { parseTaxeFoncierePdf, parseTaxeFonciereText }
