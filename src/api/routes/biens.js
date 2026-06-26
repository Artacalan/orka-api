const express = require('express');
const pool = require('../../db/pool');
const { getLatestOptimizationsByGroupIds } = require('../../db/services/optimize.db.service');

const router = express.Router();

const parseBoolean = (val) => {
    if (val === 'Oui' || val === '1' || val === 1 || val === true) return 1;
    return 0;
};

const normalizeValue = (val) => {
    if (val === undefined || val === null) {
        return null;
    }

    if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    return val;
};

const BOOLEAN_FIELDS = new Set([
    'ascenseur', 'eau_courante', 'raccordement_gaz', 'raccordement_elec', 'raccordement_egout'
]);

const NUMERIC_FIELDS = new Set([
    'groupe_id', 'ponderation_nature', 'etage', 'surface_m2', 'coef_entretien',
    'coef_sit_particuliere', 'coef_sit_generale', 'nb_baignoires', 'nb_douches',
    'nb_bidets', 'nb_wc', 'nb_eviers', 'nb_pieces', 'nb_vide_ordures', 'valeur_calculee'
]);

const TARIFS_PAR_CHAMP = Object.freeze({
    rue: 4,
    depcom: 7,
    ville: 5,
    nom_immeuble: 6,
    nature_bien: 8,
    ponderation_nature: 11,
    etage: 9,
    categorie: 12,
    surface_m2: 15,
    coef_entretien: 10,
    coef_sit_particuliere: 13,
    coef_sit_generale: 14,
    ascenseur: 35,
    eau_courante: 32,
    raccordement_gaz: 29,
    raccordement_elec: 31,
    nb_baignoires: 17,
    nb_douches: 16,
    nb_bidets: 18,
    nb_wc: 19,
    nb_eviers: 20,
    raccordement_egout: 33,
    nb_pieces: 22,
    nb_vide_ordures: 21,
    valeur_calculee: 1,
});

const IGNORED_CHANGE_FIELDS = new Set(['invariant']);

const parseArchivedData = (data) => {
    if (!data) return null;
    if (typeof data === 'object') return data;

    try {
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
};

const normalizeComparableValue = (field, value) => {
    if (value === undefined || value === null) return null;
    if (BOOLEAN_FIELDS.has(field)) return parseBoolean(value);
    if (NUMERIC_FIELDS.has(field) && value !== '') {
        const numericValue = Number(value);
        return Number.isNaN(numericValue) ? value : numericValue;
    }
    return value;
};

const toNumberIfPossible = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
};

const computeTariffDifference = (field, oldValue, newValue) => {
    const tarif = TARIFS_PAR_CHAMP[field];
    if (tarif === undefined) return 0;

    const numericOld = toNumberIfPossible(oldValue);
    const numericNew = toNumberIfPossible(newValue);

    if (numericOld !== null && numericNew !== null) {
        return Number(((numericNew - numericOld) * tarif).toFixed(2));
    }

    if (oldValue === newValue) return 0;

    if ((oldValue === null || oldValue === '') && (newValue !== null && newValue !== '')) {
        return tarif;
    }

    if ((newValue === null || newValue === '') && (oldValue !== null && oldValue !== '')) {
        return -tarif;
    }

    return tarif;
};

const getModifiedFields = (currentRow, archivedRow) => {
    if (!archivedRow) return [];

    return Object.keys(currentRow)
        .filter((field) => !IGNORED_CHANGE_FIELDS.has(field))
        .filter((field) => Object.prototype.hasOwnProperty.call(archivedRow, field))
        .filter((field) => {
            return normalizeComparableValue(field, currentRow[field])
                !== normalizeComparableValue(field, archivedRow[field]);
        });
};

const getChangesByInvariant = async (biens) => {
    if (biens.length === 0) return new Map();

    const invariants = biens.map((bien) => bien.invariant).filter(Boolean);
    if (invariants.length === 0) return new Map();

    const [snapshots] = await pool.query(
        `
            SELECT invariant, donnees
            FROM biens_fiscaux_old
            WHERE operation IN ('edit', 'erp_update')
              AND invariant IN (?)
            ORDER BY invariant, created_at DESC, id DESC
        `,
        [invariants]
    );

    const latestSnapshots = new Map();
    for (const snapshot of snapshots) {
        if (!latestSnapshots.has(snapshot.invariant)) {
            latestSnapshots.set(snapshot.invariant, parseArchivedData(snapshot.donnees));
        }
    }

    return new Map(
        biens.map((bien) => {
            const champsModifies = getModifiedFields(bien, latestSnapshots.get(bien.invariant));
            return [
                bien.invariant,
                {
                    a_des_modifications: champsModifies.length > 0,
                    champs_modifies: champsModifies,
                },
            ];
        })
    );
};

const getLatestSnapshotsForInvariants = async (invariants) => {
    if (!Array.isArray(invariants) || invariants.length === 0) return new Map();

    const [snapshots] = await pool.query(
        `
            SELECT invariant, donnees
            FROM biens_fiscaux_old
            WHERE operation IN ('edit', 'erp_update')
              AND invariant IN (?)
            ORDER BY invariant, created_at DESC, id DESC
        `,
        [invariants]
    );

    const latestSnapshots = new Map();
    for (const snapshot of snapshots) {
        if (!latestSnapshots.has(snapshot.invariant)) {
            latestSnapshots.set(snapshot.invariant, parseArchivedData(snapshot.donnees));
        }
    }

    return latestSnapshots;
};

async function getOrCreateGroup(connection, ligne) {
    const rue = normalizeValue(ligne.rue);
    const depcom = normalizeValue(ligne.depcom);
    const ville = normalizeValue(ligne.ville);
    const natureBien = normalizeValue(ligne.nature_bien);
    const nomImmeuble = normalizeValue(ligne.nom_immeuble);

    const [existingRows] = await connection.query(
        `
            SELECT id
            FROM biens_groupes
            WHERE rue <=> ?
              AND depcom <=> ?
              AND ville <=> ?
              AND nature_bien <=> ?
            LIMIT 1
        `,
        [rue, depcom, ville, natureBien]
    );

    if (existingRows.length > 0) {
        return existingRows[0].id;
    }

    const [insertResult] = await connection.query(
        `
            INSERT INTO biens_groupes (
                rue, depcom, ville, nom_immeuble, nature_bien
            ) VALUES (?, ?, ?, ?, ?)
        `,
        [rue, depcom, ville, nomImmeuble, natureBien]
    );

    return insertResult.insertId;
}

router.post('/import', async (req, res) => {
    const lignes = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
        return res.status(400).json({ error: 'Le format de donnees est invalide ou vide.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const query = `
            INSERT INTO biens_fiscaux (
                invariant, groupe_id, rue, depcom, ville, nom_immeuble, nature_bien,
                ponderation_nature, etage, categorie, surface_m2, coef_entretien,
                coef_sit_particuliere, coef_sit_generale, ascenseur, eau_courante,
                raccordement_gaz, raccordement_elec, nb_baignoires, nb_douches,
                nb_bidets, nb_wc, nb_eviers, raccordement_egout, nb_pieces, nb_vide_ordures
            ) VALUES ?
            ON DUPLICATE KEY UPDATE
                groupe_id=VALUES(groupe_id),
                rue=VALUES(rue), depcom=VALUES(depcom), ville=VALUES(ville),
                nom_immeuble=VALUES(nom_immeuble), nature_bien=VALUES(nature_bien),
                ponderation_nature=VALUES(ponderation_nature), etage=VALUES(etage),
                categorie=VALUES(categorie), surface_m2=VALUES(surface_m2),
                coef_entretien=VALUES(coef_entretien), coef_sit_particuliere=VALUES(coef_sit_particuliere),
                coef_sit_generale=VALUES(coef_sit_generale), ascenseur=VALUES(ascenseur),
                eau_courante=VALUES(eau_courante), raccordement_gaz=VALUES(raccordement_gaz),
                raccordement_elec=VALUES(raccordement_elec), nb_baignoires=VALUES(nb_baignoires),
                nb_douches=VALUES(nb_douches), nb_bidets=VALUES(nb_bidets), nb_wc=VALUES(nb_wc),
                nb_eviers=VALUES(nb_eviers), raccordement_egout=VALUES(raccordement_egout),
                nb_pieces=VALUES(nb_pieces), nb_vide_ordures=VALUES(nb_vide_ordures)
        `;

        const valeursAInserer = [];

        for (const ligne of lignes) {
            const groupeId = await getOrCreateGroup(connection, ligne);

            valeursAInserer.push([
                normalizeValue(ligne.invariant),
                groupeId,
                normalizeValue(ligne.rue),
                normalizeValue(ligne.depcom),
                normalizeValue(ligne.ville),
                normalizeValue(ligne.nom_immeuble),
                normalizeValue(ligne.nature_bien),
                ligne.ponderation_nature ?? null,
                ligne.etage ?? null,
                normalizeValue(ligne.categorie),
                ligne.surface_m2 ?? null,
                ligne.coef_entretien ?? null,
                ligne.coef_sit_particuliere ?? null,
                ligne.coef_sit_generale ?? null,
                parseBoolean(ligne.ascenseur),
                parseBoolean(ligne.eau_courante),
                parseBoolean(ligne.raccordement_gaz),
                parseBoolean(ligne.raccordement_elec),
                ligne.nb_baignoires || 0,
                ligne.nb_douches || 0,
                ligne.nb_bidets || 0,
                ligne.nb_wc || 0,
                ligne.nb_eviers || 0,
                parseBoolean(ligne.raccordement_egout),
                ligne.nb_pieces || 0,
                ligne.nb_vide_ordures || 0
            ]);
        }

        const [result] = await connection.query(query, [valeursAInserer]);
        await connection.commit();

        res.status(201).json({
            message: 'Importation ou mise a jour reussie.',
            lignesImpactees: result.affectedRows
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Erreur lors de l\'import :', error);
        res.status(500).json({ error: 'Une erreur est survenue lors de l\'integration en base de donnees.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

const formatBien = (row, changes = null, options = {}) => {
    const optimization = options.optimizationsByGroupId?.get(row.groupe_id) ?? null;
    const formatted = {
        ...row,
        nom: row.nom_immeuble ?? null,
        adresse: [row.rue, row.depcom, row.ville].filter(Boolean).join(' '),
        optimization,
        statut_optimisation: optimization?.statut ?? null,
        en_optimisation: optimization?.statut === 'en_cours',
    };

    if (changes) {
        formatted.a_des_modifications = changes.a_des_modifications;
        if (options.includeModifiedFields) {
            formatted.champs_modifies = changes.champs_modifies;
        }
    }

    return formatted;
};

const formatBiensWithChanges = async (biens, options = {}) => {
    const changesByInvariant = await getChangesByInvariant(biens);
    return biens.map((bien) => {
        return formatBien(bien, changesByInvariant.get(bien.invariant), options);
    });
};

// GET /api/biens
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM biens_fiscaux ORDER BY invariant');
        const groupIds = rows.map((row) => row.groupe_id).filter(Boolean);
        const optimizationsByGroupId = await getLatestOptimizationsByGroupIds(pool, groupIds);
        const biens = await formatBiensWithChanges(rows, { optimizationsByGroupId });
        return res.status(200).json({ biens });
    } catch (err) {
        console.error('[GET /biens]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/biens/group/:groupe_id/tarif-difference?champ=surface_m2
router.get('/group/:groupe_id/tarif-difference', async (req, res) => {
    const groupeId = req.params.groupe_id;
    const champ = req.query.champ;

    if (!champ) {
        return res.status(400).json({
            error: 'Le parametre champ est requis.',
            champsDisponibles: Object.keys(TARIFS_PAR_CHAMP),
        });
    }

    if (!Object.prototype.hasOwnProperty.call(TARIFS_PAR_CHAMP, champ)) {
        return res.status(400).json({
            error: `Champ non pris en charge pour la tarification: ${champ}`,
            champsDisponibles: Object.keys(TARIFS_PAR_CHAMP),
        });
    }

    try {
        const [biens] = await pool.query(
            'SELECT * FROM biens_fiscaux WHERE groupe_id = ? ORDER BY invariant',
            [groupeId]
        );

        if (biens.length === 0) {
            return res.status(404).json({ error: 'Groupe introuvable ou sans biens.' });
        }

        const invariants = biens.map((bien) => bien.invariant).filter(Boolean);
        const snapshotsByInvariant = await getLatestSnapshotsForInvariants(invariants);

        const differences = [];
        let differenceTotaleTarif = 0;

        for (const bien of biens) {
            const oldData = snapshotsByInvariant.get(bien.invariant);
            if (!oldData || !Object.prototype.hasOwnProperty.call(oldData, champ)) {
                continue;
            }

            const ancienneValeur = normalizeComparableValue(champ, oldData[champ]);
            const nouvelleValeur = normalizeComparableValue(champ, bien[champ]);

            if (ancienneValeur === nouvelleValeur) {
                continue;
            }

            const differenceTarif = computeTariffDifference(champ, ancienneValeur, nouvelleValeur);
            differenceTotaleTarif += differenceTarif;

            differences.push({
                invariant: bien.invariant,
                ancienne_valeur: ancienneValeur,
                nouvelle_valeur: nouvelleValeur,
                difference_tarif: Number(differenceTarif.toFixed(2)),
            });
        }

        return res.status(200).json({
            groupe_id: Number(groupeId),
            champ,
            tarif_unitaire: TARIFS_PAR_CHAMP[champ],
            biens_analyses: biens.length,
            biens_avec_difference: differences.length,
            difference_totale_tarif: Number(differenceTotaleTarif.toFixed(2)),
            differences,
        });
    } catch (err) {
        console.error('[GET /biens/group/:groupe_id/tarif-difference]', err);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/biens/group
router.get('/group', async (req, res) => {
    try {
        const [groups] = await pool.query(
            `SELECT id, nom_immeuble, rue, depcom, ville, nature_bien
             FROM biens_groupes
             ORDER BY id`
        );
        const optimizationsByGroupId = await getLatestOptimizationsByGroupIds(
            pool,
            groups.map((group) => group.id)
        );

        const groupsWithBiens = await Promise.all(
            groups.map(async (group) => {
                const optimization = optimizationsByGroupId.get(group.id) ?? null;
                const [biens] = await pool.query(
                    'SELECT * FROM biens_fiscaux WHERE groupe_id = ? ORDER BY invariant',
                    [group.id]
                );
                return {
                    id: group.id,
                    nom:   group.nom_immeuble,
                    rue: group.rue,
                    depcom: group.depcom,
                    ville: group.ville,
                    nature_bien: group.nature_bien,
                    adresse: [group.rue, group.depcom, group.ville].filter(Boolean).join(' '),
                    optimization,
                    statut_optimisation: optimization?.statut ?? null,
                    en_optimisation: optimization?.statut === 'en_cours',
                    biens: await formatBiensWithChanges(biens, { optimizationsByGroupId }),
                };
            })
        );

        return res.status(200).json({ groups: groupsWithBiens });
    } catch (err) {
        console.error('[GET /biens/group]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET/api/biens/:invariant
router.get('/:invariant', async (req, res) => {
    const { invariant } = req.params;

    try {
        const [rows] = await pool.query('SELECT * FROM biens_fiscaux WHERE invariant = ?', [invariant]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Bien non trouve.' });
        }

        const optimizationsByGroupId = await getLatestOptimizationsByGroupIds(
            pool,
            rows.map((row) => row.groupe_id)
        );
        const [bien] = await formatBiensWithChanges(rows, {
            includeModifiedFields: true,
            optimizationsByGroupId,
        });
        return res.status(200).json({ bien });
    } catch (err) {
        console.error(`[GET /biens/${invariant}]`, err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/biens/group/:id
router.get('/group/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [groupRows] = await pool.query(
            'SELECT * FROM biens_groupes WHERE id = ?',
            [id]
        );

        if (groupRows.length === 0) {
            return res.status(404).json({ error: 'Groupe non trouve.' });
        }

        const group = groupRows[0];

        const [biens] = await pool.query(
            'SELECT * FROM biens_fiscaux WHERE groupe_id = ? ORDER BY invariant',
            [id]
        );
        const optimizationsByGroupId = await getLatestOptimizationsByGroupIds(pool, [group.id]);
        const optimization = optimizationsByGroupId.get(group.id) ?? null;

        return res.status(200).json({
            group: {
                id: group.id,
                nom: group.nom_immeuble,
                rue: group.rue,
                depcom: group.depcom,
                ville: group.ville,
                nature_bien: group.nature_bien,
                adresse: [group.rue, group.depcom, group.ville].filter(Boolean).join(' '),
                optimization,
                statut_optimisation: optimization?.statut ?? null,
                en_optimisation: optimization?.statut === 'en_cours',
                biens: await formatBiensWithChanges(biens, {
                    includeModifiedFields: true,
                    optimizationsByGroupId,
                }),
            },
        });
    } catch (err) {
        console.error(`[GET /biens/group/${id}]`, err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
