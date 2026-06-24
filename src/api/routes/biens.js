const express = require('express');
const pool = require('../../db/pool');

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

module.exports = router;
