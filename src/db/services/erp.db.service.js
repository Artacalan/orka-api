/**
 * @file Accès BDD pour les routes ERP
 */

const pool = require('../pool')

const BOOLEAN_COLUMNS = new Set([
  'ascenseur', 'eau_courante', 'raccordement_gaz',
  'raccordement_elec', 'raccordement_egout',
])

const toBoolean = (val) => {
  if (val === 'Oui' || val === '1' || val === 1 || val === true) return 1
  return 0
}

/**
 * Récupère les colonnes de la table biens_fiscaux
 * depuis information_schema
 */
async function getBiensFiscauxColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'biens_fiscaux'
     AND COLUMN_NAME <> 'groupe_id'
     ORDER BY ORDINAL_POSITION`
  )
  return rows.map(r => r.COLUMN_NAME)
}

/**
 * Récupère ou crée un groupe dans biens_groupes.
 * Retourne l'id du groupe.
 */
async function getOrCreateGroup(connection, mappedRow) {
  console.log("[getOrCreateGroup] mappedRow", mappedRow)
  const { rue, depcom, ville, nature_bien, nom_immeuble } = mappedRow

  const [existing] = await connection.query(
    `SELECT id FROM biens_groupes
     WHERE rue <=> ? AND depcom <=> ? AND ville <=> ? AND nature_bien <=> ?
     LIMIT 1`,
    [rue ?? null, depcom ?? null, ville ?? null, nature_bien ?? null]
  )

  if (existing.length > 0) return existing[0].id

  const [result] = await connection.query(
    `INSERT INTO biens_groupes (rue, depcom, ville, nom_immeuble, nature_bien)
     VALUES (?, ?, ?, ?, ?)`,
    [rue ?? null, depcom ?? null, ville ?? null, nom_immeuble ?? null, nature_bien ?? null]
  )

  return result.insertId
}

/**
 * Insère ou met à jour les lignes du CSV dans biens_fiscaux.
 * Crée le groupe associé si nécessaire.
 * Si une ligne avec le même invariant existe déjà, l'ancienne est archivée
 * dans biens_fiscaux_old avant la mise à jour.
 */
async function upsertRowsWithArchive(rows, mapping) {
  const connection = await pool.getConnection()

  console.log("[upsertRowsWithArchive] rows", rows)
  console.log("[upsertRowsWithArchive] mapping", mapping)

  try {
    await connection.beginTransaction()

    for (const row of rows) {
      const mappedRow = {}
      for (const { key, value } of mapping) {
        if (key && value) {
          const raw = row[key] ?? null
          mappedRow[value] = BOOLEAN_COLUMNS.has(value) ? toBoolean(raw) : raw
        }
      }

      // Gestion du groupe
      mappedRow['groupe_id'] = await getOrCreateGroup(connection, mappedRow)

      const invariant = mappedRow['invariant']

      if (invariant) {
        const [existing] = await connection.query(
          'SELECT * FROM biens_fiscaux WHERE invariant = ?',
          [invariant]
        )

        if (existing.length > 0) {
          const oldRow = existing[0]

          await connection.query(
            'INSERT INTO biens_fiscaux_old (invariant, operation, donnees) VALUES (?, ?, ?)',
            [invariant, 'erp_update', JSON.stringify(oldRow)]
          )

          const setCols = Object.keys(mappedRow).filter(c => c !== 'invariant')
          const setClause = setCols.map(c => `\`${c}\` = ?`).join(', ')
          const setVals = setCols.map(c => mappedRow[c])

          await connection.query(
            `UPDATE biens_fiscaux SET ${setClause} WHERE invariant = ?`,
            [...setVals, invariant]
          )
          continue
        }
      }

      // Nouvelle ligne
      const columns= Object.keys(mappedRow)
      const values = Object.values(mappedRow)
      const placeholders = columns.map(() => '?').join(', ')

      await connection.query(
        `INSERT INTO biens_fiscaux (${columns.map(c => `\`${c}\``).join(', ')})
         VALUES (${placeholders})`,
        values
      )
    }

    await connection.commit()
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}

module.exports = { getBiensFiscauxColumns, upsertRowsWithArchive }
