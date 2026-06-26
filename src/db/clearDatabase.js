const pool = require('./pool');

async function clearDatabase() {
    const [tables] = await pool.query(
        `
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `
    );

    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    try {
        for (const { TABLE_NAME } of tables) {
            await pool.query(`TRUNCATE TABLE \`${TABLE_NAME.replace(/`/g, '``')}\``);
        }
    } finally {
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
}

async function run() {
    try {
        await clearDatabase();
        console.log('Base de donnees videe : toutes les tables de la base courante ont ete reinitialisees.');
        process.exit(0);
    } catch (error) {
        console.error("Erreur critique lors du vidage de la base de donnees :", error);
        process.exit(1);
    }
}

module.exports = clearDatabase;

if (require.main === module) {
    run();
}
