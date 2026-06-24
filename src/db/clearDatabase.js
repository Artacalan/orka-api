const pool = require('./pool');

async function clearDatabase() {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    try {
        await pool.query('TRUNCATE TABLE biens_fiscaux');
        await pool.query('TRUNCATE TABLE biens_groupes');
    } finally {
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
}

async function run() {
    try {
        await clearDatabase();
        console.log("Base de donnees videe : les tables 'biens_fiscaux' et 'biens_groupes' ont ete reinitialisees.");
        process.exit(0);
    } catch (error) {
        console.error("Erreur critique lors du vidage de la base de donnees :", error);
        process.exit(1);
    }
}

run();
