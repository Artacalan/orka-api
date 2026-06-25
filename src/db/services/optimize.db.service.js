const OPTIMIZATION_STATUS_IN_PROGRESS = 'en_cours';

const parseJsonValue = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const formatOptimization = (row) => {
    if (!row) return null;

    return {
        id: row.id,
        group_id: row.group_id,
        commentaire: row.commentaire,
        statut: row.statut,
        fichiers: parseJsonValue(row.fichiers, []),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
};

const buildFilesMetadata = (files = []) => {
    return files.map((file) => ({
        nom: file.originalname,
        mimetype: file.mimetype,
        taille: file.size,
    }));
};

const createOptimization = async (
    connection,
    { groupId, commentaire = null, fichiers = [], statut = OPTIMIZATION_STATUS_IN_PROGRESS }
) => {
    const [result] = await connection.query(
        `
            INSERT INTO \`optimize\` (group_id, commentaire, statut, fichiers)
            VALUES (?, ?, ?, ?)
        `,
        [groupId, commentaire, statut, JSON.stringify(fichiers)]
    );

    const [rows] = await connection.query(
        'SELECT * FROM `optimize` WHERE id = ?',
        [result.insertId]
    );

    return formatOptimization(rows[0]);
};

const getLatestOptimizationsByGroupIds = async (pool, groupIds) => {
    const ids = groupIds.filter(Boolean);
    if (ids.length === 0) return new Map();

    const [rows] = await pool.query(
        `
            SELECT *
            FROM \`optimize\`
            WHERE group_id IN (?)
            ORDER BY group_id, created_at DESC, id DESC
        `,
        [ids]
    );

    const optimizationsByGroupId = new Map();
    for (const row of rows) {
        if (!optimizationsByGroupId.has(row.group_id)) {
            optimizationsByGroupId.set(row.group_id, formatOptimization(row));
        }
    }

    return optimizationsByGroupId;
};

module.exports = {
    OPTIMIZATION_STATUS_IN_PROGRESS,
    buildFilesMetadata,
    createOptimization,
    getLatestOptimizationsByGroupIds,
};
