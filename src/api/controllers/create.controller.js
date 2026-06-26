/**
 * @file Controller pour les routes de creation depuis PDF taxe fonciere
 */

const { parseTaxeFoncierePdf } = require('../../../services/pdfTaxeFonciere.service')
const { getBiensFiscauxColumns, upsertRowsWithArchive } = require('../../db/services/erp.db.service')

const isFilled = (value) => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

const buildIdentityMapping = (rows, dbColumns) => {
  const dbSet = new Set(dbColumns)
  const rowKeys = new Set(rows.flatMap((row) => Object.keys(row)))

  return Array.from(rowKeys)
    .filter((key) => dbSet.has(key))
    .map((key) => ({ key, value: key }))
}

const parseRowsFromRequest = async (req) => {
  if (req.body?.biens) {
    try {
      const biens = JSON.parse(req.body.biens)
      if (!Array.isArray(biens) || biens.length === 0) {
        throw new Error()
      }
      return biens
    } catch {
      const error = new Error('Le champ "biens" doit être un JSON valide et non vide')
      error.statusCode = 400
      throw error
    }
  }

  if (!req.file) {
    const error = new Error('Aucun fichier PDF fourni')
    error.statusCode = 400
    throw error
  }

  const { rows } = await parseTaxeFoncierePdf(req.file.buffer)
  return rows
}

/**
 * POST /api/create
 * multipart/form-data : file (PDF)
 *
 * Extrait les informations lisibles d'une fiche de taxe fonciere
 * et indique quels champs peuvent alimenter biens_fiscaux.
 */
async function analyzeCreate(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier PDF fourni' })
    }

    const { rows } = await parseTaxeFoncierePdf(req.file.buffer)
    const [row] = rows
    const dbColumns = await getBiensFiscauxColumns()
    const columns = dbColumns.map((column) => ({
      name: column,
      status: isFilled(row[column]) ? 'lié' : 'non renseigné',
      value: row[column] ?? null,
    }))

    return res.status(200).json({ columns, biens: rows })
  } catch (err) {
    console.error('[analyzeCreate]', err)
    res.status(500).json({ error: err.message })
  }
}

/**
 * POST /api/validateCreate
 *
 * Insere ou met a jour les biens extraits d'un PDF. Le client peut aussi
 * envoyer un champ multipart "biens" pour valider des donnees corrigees.
 */
async function validateCreate(req, res) {
  try {
    const rows = await parseRowsFromRequest(req)
    const invalidRows = rows.filter((row) => !isFilled(row.invariant))
    if (invalidRows.length > 0) {
      return res.status(400).json({ error: 'Chaque bien doit contenir un invariant' })
    }

    const dbColumns = await getBiensFiscauxColumns()
    const mapping = buildIdentityMapping(rows, dbColumns)
    if (mapping.length === 0) {
      return res.status(400).json({ error: 'Aucun champ reconnu pour biens_fiscaux' })
    }

    await upsertRowsWithArchive(rows, mapping)

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[validateCreate]', err)
    res.status(err.statusCode ?? 500).json({ error: err.message })
  }
}

module.exports = { analyzeCreate, validateCreate }
