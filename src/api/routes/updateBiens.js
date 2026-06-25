const express = require('express');
const pool = require('../../db/pool');
const { calculerValeur } = require('../../utils/calcul');

const router = express.Router();

const CHAMPS_MODIFIABLES = new Set([
    'rue', 'depcom', 'ville', 'nom_immeuble', 'nature_bien',
    'ponderation_nature', 'etage', 'categorie', 'surface_m2',
    'coef_entretien', 'coef_sit_particuliere', 'coef_sit_generale',
    'ascenseur', 'eau_courante', 'raccordement_gaz', 'raccordement_elec',
    'nb_baignoires', 'nb_douches', 'nb_bidets', 'nb_wc', 'nb_eviers',
    'raccordement_egout', 'nb_pieces', 'nb_vide_ordures'
]);

const BOOLEAN_FIELDS = new Set([
    'ascenseur', 'eau_courante', 'raccordement_gaz', 'raccordement_elec', 'raccordement_egout'
]);

function normaliserValeur(champ, valeur) {
    if (valeur === null || valeur === undefined) return null;
    if (BOOLEAN_FIELDS.has(champ)) {
        return (valeur === true || valeur === 'Oui' || valeur === '1' || valeur === 1) ? 1 : 0;
    }
    return valeur;
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

function calculerDiff(actuel, payload) {
    const changements = [];
    for (const [champ, nouvelleValeur] of Object.entries(payload)) {
        const ancienneValeur = actuel[champ];

        const ancStr = ancienneValeur === null || ancienneValeur === undefined
            ? null : String(ancienneValeur);
        const nveStr = nouvelleValeur === null || nouvelleValeur === undefined
            ? null : String(nouvelleValeur);

        if (ancStr !== nveStr) {
            changements.push({ champ, ancienne_valeur: ancStr, nouvelle_valeur: nveStr });
        }
    }
    return changements;
}

// /groupe/:groupeId DOIT être déclaré avant /:invariant
router.put('/groupe/:groupeId', async (req, res) => {
    const { groupeId } = req.params;
    const filteredPayload = filtrerPayload(req.body);

    if (Object.keys(filteredPayload).length === 0) {
        return res.status(400).json({ error: 'Aucun champ valide fourni.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [biensActuels] = await connection.query(
            'SELECT * FROM biens_fiscaux WHERE groupe_id = ?',
            [groupeId]
        );

        if (biensActuels.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Groupe introuvable ou vide.' });
        }

        const tousChangements = [];
        for (const bien of biensActuels) {
            const changs = calculerDiff(bien, filteredPayload);
            for (const c of changs) {
                tousChangements.push({ invariant: bien.invariant, ...c });
            }
        }

        if (tousChangements.length === 0) {
            await connection.rollback();
            return res.status(200).json({ message: 'Aucune modification détectée.' });
        }

        const champsMisAJour = Object.keys(filteredPayload);
        const setClauses = champsMisAJour.map(k => `${k} = ?`).join(', ');
        const setValues = champsMisAJour.map(k => filteredPayload[k]);

        await connection.query(
            `UPDATE biens_fiscaux SET ${setClauses} WHERE groupe_id = ?`,
            [...setValues, groupeId]
        );

        const histValues = tousChangements.map(c => [
            c.invariant, c.champ, c.ancienne_valeur, c.nouvelle_valeur
        ]);
        await connection.query(
            'INSERT INTO biens_fiscaux_historique (invariant, champ, ancienne_valeur, nouvelle_valeur) VALUES ?',
            [histValues]
        );

        for (const bien of biensActuels) {
            const bienMisAJour = { ...bien, ...filteredPayload };
            const nouvelleValeur = calculerValeur(bienMisAJour);
            if (nouvelleValeur !== null) {
                await connection.query(
                    'UPDATE biens_fiscaux SET valeur_calculee = ? WHERE invariant = ?',
                    [nouvelleValeur, bien.invariant]
                );
            }
        }

        await connection.commit();

        return res.status(200).json({
            message: 'Groupe mis à jour.',
            groupeId: parseInt(groupeId),
            biensModifies: new Set(tousChangements.map(c => c.invariant)).size,
            champsModifies: champsMisAJour
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur update groupe :', error);
        return res.status(500).json({ error: 'Erreur lors de la mise à jour du groupe.' });
    } finally {
        if (connection) connection.release();
    }
});

router.put('/:invariant', async (req, res) => {
    const { invariant } = req.params;
    const filteredPayload = filtrerPayload(req.body);

    if (Object.keys(filteredPayload).length === 0) {
        return res.status(400).json({ error: 'Aucun champ valide fourni.' });
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
            return res.status(404).json({ error: 'Bien introuvable.' });
        }

        const bienActuel = rows[0];
        const changements = calculerDiff(bienActuel, filteredPayload);

        if (changements.length === 0) {
            await connection.rollback();
            return res.status(200).json({ message: 'Aucune modification détectée.' });
        }

        const setClauses = changements.map(c => `${c.champ} = ?`).join(', ');
        const setValues = changements.map(c => filteredPayload[c.champ]);

        await connection.query(
            `UPDATE biens_fiscaux SET ${setClauses} WHERE invariant = ?`,
            [...setValues, invariant]
        );

        const histValues = changements.map(c => [
            invariant, c.champ, c.ancienne_valeur, c.nouvelle_valeur
        ]);
        await connection.query(
            'INSERT INTO biens_fiscaux_historique (invariant, champ, ancienne_valeur, nouvelle_valeur) VALUES ?',
            [histValues]
        );

        const bienMisAJour = { ...bienActuel, ...filteredPayload };
        const nouvelleValeur = calculerValeur(bienMisAJour);
        if (nouvelleValeur !== null) {
            await connection.query(
                'UPDATE biens_fiscaux SET valeur_calculee = ? WHERE invariant = ?',
                [nouvelleValeur, invariant]
            );
        }

        await connection.commit();

        return res.status(200).json({
            message: 'Bien mis à jour.',
            invariant,
            modifications: changements,
            valeur_calculee: nouvelleValeur
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur update bien :', error);
        return res.status(500).json({ error: 'Erreur lors de la mise à jour du bien.' });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/:invariant/historique', async (req, res) => {
    const { invariant } = req.params;

    try {
        const [rows] = await pool.query(
            `SELECT id, champ, ancienne_valeur, nouvelle_valeur, modifie_at
             FROM biens_fiscaux_historique
             WHERE invariant = ?
             ORDER BY modifie_at DESC`,
            [invariant]
        );

        return res.status(200).json({
            invariant,
            historique: rows
        });

    } catch (error) {
        console.error('Erreur lecture historique :', error);
        return res.status(500).json({ error: 'Erreur lors de la lecture de l\'historique.' });
    }
});

module.exports = router;
