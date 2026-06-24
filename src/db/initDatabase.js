require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDatabase() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS biens_fiscaux (
            invariant VARCHAR(20) PRIMARY KEY,
            rue VARCHAR(255),
            depcom VARCHAR(5),
            ville VARCHAR(100),
            nom_immeuble VARCHAR(150),
            nature_bien VARCHAR(50),
            ponderation_nature DECIMAL(4,2),
            etage INT,
            categorie VARCHAR(10),
            surface_m2 DECIMAL(8,2),
            coef_entretien DECIMAL(5,2),
            coef_sit_particuliere DECIMAL(5,2),
            coef_sit_generale DECIMAL(5,2),
            ascenseur TINYINT(1),
            eau_courante TINYINT(1),
            raccordement_gaz TINYINT(1),
            raccordement_elec TINYINT(1),
            nb_baignoires INT,
            nb_douches INT,
            nb_bidets INT,
            nb_wc INT,
            nb_eviers INT,
            raccordement_egout TINYINT(1),
            nb_pieces INT,
            nb_vide_ordures INT
        );
    `;

    await pool.query(createTableQuery);
}

async function run() {
    try {
        await initDatabase();
        console.log("Base de donnees verifiee : La table 'biens_fiscaux' est prete.");
        process.exit(0);
    } catch (error) {
        console.error("Erreur critique lors de l'initialisation de la base de donnees :", error);
        process.exit(1);
    }
}

run();
