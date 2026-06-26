const express = require('express');
const pool = require('../../db/pool');
const clearDatabase = require('../../db/clearDatabase');
const upload = require('./middlewares/upload.middleware');
const {
    buildFilesMetadata,
    createOptimization,
} = require('../../db/services/optimize.db.service');

const router = express.Router();

const BOOLEAN_FIELDS = new Set([
    'ascenseur', 'eau_courante', 'raccordement_gaz', 'raccordement_elec', 'raccordement_egout'
]);

const CHAMPS_MODIFIABLES = new Set([
    'rue', 'depcom', 'ville', 'nom_immeuble', 'nature_bien',
    'ponderation_nature', 'etage', 'categorie', 'surface_m2',
    'coef_entretien', 'coef_sit_particuliere', 'coef_sit_generale',
    'ascenseur', 'eau_courante', 'raccordement_gaz', 'raccordement_elec',
    'nb_baignoires', 'nb_douches', 'nb_bidets', 'nb_wc', 'nb_eviers',
    'raccordement_egout', 'nb_pieces', 'nb_vide_ordures'
]);

function normalizeValue(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return val;
}

function parseBoolean(val) {
    return (val === true || val === 'Oui' || val === '1' || val === 1) ? 1 : 0;
}

function normaliserValeur(champ, val) {
    if (val === null || val === undefined) return null;
    if (BOOLEAN_FIELDS.has(champ)) return parseBoolean(val);
    return val;
}

function filtrerPayload(body) {
    const filtered = {};
    for (const [key, val] of Object.entries(body)) {
        if (CHAMPS_MODIFIABLES.has(key)) {
            filtered[key] = normaliserValeur(key, val);
        }
    }
    return filtered;
}

function getGroupIdFromBody(body) {
    return body.group_id ?? body.groupe_id;
}

function getCommentaireFromBody(body) {
    return normalizeValue(body.commentaire ?? body.comment);
}

async function getOrCreateGroup(connection, bien) {
    const rue = normalizeValue(bien.rue);
    const depcom = normalizeValue(bien.depcom);
    const ville = normalizeValue(bien.ville);
    const natureBien = normalizeValue(bien.nature_bien);
    const nomImmeuble = normalizeValue(bien.nom_immeuble);

    const [existing] = await connection.query(
        `SELECT id FROM biens_groupes
         WHERE rue <=> ? AND depcom <=> ? AND ville <=> ? AND nature_bien <=> ?
         LIMIT 1`,
        [rue, depcom, ville, natureBien]
    );

    if (existing.length > 0) return existing[0].id;

    const [result] = await connection.query(
        `INSERT INTO biens_groupes (rue, depcom, ville, nom_immeuble, nature_bien)
         VALUES (?, ?, ?, ?, ?)`,
        [rue, depcom, ville, nomImmeuble, natureBien]
    );
    return result.insertId;
}

router.post('/optimize', upload.anyFile.any(), async (req, res) => {
    const groupId = getGroupIdFromBody(req.body);
    if (!groupId) {
        return res.status(400).json({ success: false, error: 'group_id requis.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [groups] = await connection.query(
            'SELECT id FROM biens_groupes WHERE id = ?',
            [groupId]
        );

        if (groups.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Groupe introuvable.' });
        }

        const optimization = await createOptimization(connection, {
            groupId,
            commentaire: getCommentaireFromBody(req.body),
            fichiers: buildFilesMetadata(req.files),
        });

        await connection.commit();
        return res.status(200).json({ success: true, optimization });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur optimize :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors du passage du groupe en optimisation.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/bulk/optimize', upload.anyFile.any(), async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [groups] = await connection.query('SELECT id FROM biens_groupes ORDER BY id');
        if (groups.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Aucun groupe a optimiser.' });
        }

        const fichiers = buildFilesMetadata(req.files);
        const optimizations = [];

        for (const group of groups) {
            const optimization = await createOptimization(connection, {
                groupId: group.id,
                commentaire: getCommentaireFromBody(req.body),
                fichiers,
            });
            optimizations.push(optimization);
        }

        await connection.commit();
        return res.status(200).json({
            success: true,
            groupesImpactes: optimizations.length,
            optimizations,
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur bulk optimize :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors du passage des groupes en optimisation.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/add', async (req, res) => {
    const { invariant } = req.body;
    if (!invariant) {
        return res.status(400).json({ success: false, error: 'invariant requis.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const groupeId = await getOrCreateGroup(connection, req.body);

        await connection.query(
            `INSERT INTO biens_fiscaux (
                invariant, groupe_id, rue, depcom, ville, nom_immeuble, nature_bien,
                ponderation_nature, etage, categorie, surface_m2, coef_entretien,
                coef_sit_particuliere, coef_sit_generale, ascenseur, eau_courante,
                raccordement_gaz, raccordement_elec, nb_baignoires, nb_douches,
                nb_bidets, nb_wc, nb_eviers, raccordement_egout, nb_pieces, nb_vide_ordures
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalizeValue(invariant),
                groupeId,
                normalizeValue(req.body.rue),
                normalizeValue(req.body.depcom),
                normalizeValue(req.body.ville),
                normalizeValue(req.body.nom_immeuble),
                normalizeValue(req.body.nature_bien),
                req.body.ponderation_nature ?? null,
                req.body.etage ?? null,
                normalizeValue(req.body.categorie),
                req.body.surface_m2 ?? null,
                req.body.coef_entretien ?? null,
                req.body.coef_sit_particuliere ?? null,
                req.body.coef_sit_generale ?? null,
                parseBoolean(req.body.ascenseur),
                parseBoolean(req.body.eau_courante),
                parseBoolean(req.body.raccordement_gaz),
                parseBoolean(req.body.raccordement_elec),
                req.body.nb_baignoires || 0,
                req.body.nb_douches || 0,
                req.body.nb_bidets || 0,
                req.body.nb_wc || 0,
                req.body.nb_eviers || 0,
                parseBoolean(req.body.raccordement_egout),
                req.body.nb_pieces || 0,
                req.body.nb_vide_ordures || 0
            ]
        );

        await connection.commit();
        return res.status(200).json({ success: true });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur add bien :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors de l\'ajout du bien.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/edit', async (req, res) => {
    const { invariant, ...body } = req.body;
    if (!invariant) {
        return res.status(400).json({ success: false, error: 'invariant requis.' });
    }

    const payload = filtrerPayload(body);
    if (Object.keys(payload).length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun champ valide fourni.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT * FROM biens_fiscaux WHERE invariant = ?',
            [invariant]
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Bien introuvable.' });
        }

        await connection.query(
            'INSERT INTO biens_fiscaux_old (invariant, operation, donnees) VALUES (?, ?, ?)',
            [invariant, 'edit', JSON.stringify(rows[0])]
        );

        const setClauses = Object.keys(payload).map(k => `${k} = ?`).join(', ');
        await connection.query(
            `UPDATE biens_fiscaux SET ${setClauses} WHERE invariant = ?`,
            [...Object.values(payload), invariant]
        );

        await connection.commit();
        return res.status(200).json({ success: true });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur edit bien :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors de la modification du bien.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/bulk/edit', async (req, res) => {
    const { groupe_id, ...body } = req.body;
    if (!groupe_id) {
        return res.status(400).json({ success: false, error: 'groupe_id requis.' });
    }

    const payload = filtrerPayload(body);
    if (Object.keys(payload).length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun champ valide fourni.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [biens] = await connection.query(
            'SELECT * FROM biens_fiscaux WHERE groupe_id = ?',
            [groupe_id]
        );
        if (biens.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Groupe introuvable ou vide.' });
        }

        const snapshots = biens.map(b => [b.invariant, 'edit', JSON.stringify(b)]);
        await connection.query(
            'INSERT INTO biens_fiscaux_old (invariant, operation, donnees) VALUES ?',
            [snapshots]
        );

        const setClauses = Object.keys(payload).map(k => `${k} = ?`).join(', ');
        await connection.query(
            `UPDATE biens_fiscaux SET ${setClauses} WHERE groupe_id = ?`,
            [...Object.values(payload), groupe_id]
        );

        await connection.commit();
        return res.status(200).json({ success: true });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur bulk edit :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors de la modification du groupe.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/delete', async (req, res) => {
    const { invariant } = req.body;
    if (!invariant) {
        return res.status(400).json({ success: false, error: 'invariant requis.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT * FROM biens_fiscaux WHERE invariant = ?',
            [invariant]
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Bien introuvable.' });
        }

        await connection.query(
            'INSERT INTO biens_fiscaux_old (invariant, operation, donnees) VALUES (?, ?, ?)',
            [invariant, 'delete', JSON.stringify(rows[0])]
        );

        await connection.query('DELETE FROM biens_fiscaux WHERE invariant = ?', [invariant]);

        await connection.commit();
        return res.status(200).json({ success: true });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur delete bien :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors de la suppression du bien.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/bulk/delete', async (req, res) => {
    const { groupe_id } = req.body;
    if (!groupe_id) {
        return res.status(400).json({ success: false, error: 'groupe_id requis.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [biens] = await connection.query(
            'SELECT * FROM biens_fiscaux WHERE groupe_id = ?',
            [groupe_id]
        );
        if (biens.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Groupe introuvable ou vide.' });
        }

        const snapshots = biens.map(b => [b.invariant, 'delete', JSON.stringify(b)]);
        await connection.query(
            'INSERT INTO biens_fiscaux_old (invariant, operation, donnees) VALUES ?',
            [snapshots]
        );

        await connection.query('DELETE FROM biens_fiscaux WHERE groupe_id = ?', [groupe_id]);

        await connection.commit();
        return res.status(200).json({ success: true });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur bulk delete :', error);
        return res.status(500).json({ success: false, error: 'Erreur lors de la suppression du groupe.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/maintenance/clear-db', async (req, res) => {
    try {
        await clearDatabase();
        return res.status(200).json({
            success: true,
            message: 'Toutes les tables de la base courante ont ete videes.',
        });
    } catch (error) {
        console.error('Erreur clear-db :', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors du vidage complet de la base de donnees.',
        });
    }
});

module.exports = router;
