/**
 * @file Controller pour les routes ERP
 */

const { parseData } = require('../../../services/csv.service')
const { getBiensFiscauxColumns, upsertRowsWithArchive } = require('../../db/services/erp.db.service')

/**
 * POST /api/erp
 * multipart/form-data : file (CSV)
 *
 * Compare les colonnes du CSV avec celles de la table biens_fiscaux.
 * Réponse :
 * {
 *    columns: [{
 *      name, status: 'lié' ou 'non lié'
 *    }]
 * }
 */
async function analyzeErp(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier CSV fourni' })
    }

    const { columns: csvColumns } = parseData(req.file.buffer)
    const dbColumns = await getBiensFiscauxColumns()

    const dbSet = new Set(dbColumns.map(c => c.toLowerCase().trim()))

    const columns = csvColumns.map(col => ({
      name: col,
      status: dbSet.has(col.toLowerCase().trim()) ? 'lié' : 'non lié',
    }))

    return res.status(200).json({ columns })
  } catch (err) {
    console.error('[analyzeErp]', err)
    res.status(500).json({ error: err.message })
  }
}

/**
 * POST /api/validateErp
 *
 * Lie les colonnes du CSV aux colonnes de biens_fiscaux et insère ou met à jour les données.
 * En cas de mise à jour, les anciennes valeurs sont archivées dans biens_fiscaux_old.
 */
async function validateErp(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier CSV fourni' })
    }

    let mapping

    try {
      mapping = JSON.parse(req.body.mapping)
    } catch {
      return res.status(400).json({ error: 'Le champ "mapping" doit être un JSON valide' })
    }

    if (!Array.isArray(mapping) || mapping.length === 0) {
      return res.status(400).json({ error: 'Le mapping doit être un tableau non vide [{ key, value }]' })
    }

    const { rows } = parseData(req.file.buffer)
    console.log("[validateErp] rows", rows)

    await upsertRowsWithArchive(rows, mapping)

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[validateErp]', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { analyzeErp, validateErp }
