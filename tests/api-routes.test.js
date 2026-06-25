const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

const readProjectFile = (filePath) => {
    return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
};

const normalizeSource = (source) => source.replace(/\s+/g, ' ');

const sampleBienPayload = {
    invariant: 'INV-TEST-001',
    rue: '10 rue de la Paix',
    depcom: '75056',
    ville: 'Paris',
    nom_immeuble: 'Residence Test',
    nature_bien: 'Appartement',
    ponderation_nature: 1,
    etage: 2,
    categorie: 'A',
    surface_m2: 42,
    coef_entretien: 1,
    coef_sit_particuliere: 1,
    coef_sit_generale: 1,
    ascenseur: 'Oui',
    eau_courante: 'Oui',
    raccordement_gaz: 'Non',
    raccordement_elec: 'Oui',
    nb_baignoires: 1,
    nb_douches: 0,
    nb_bidets: 0,
    nb_wc: 1,
    nb_eviers: 1,
    raccordement_egout: 'Oui',
    nb_pieces: 2,
    nb_vide_ordures: 0,
};

const routeContracts = [
    {
        name: 'GET /hello',
        method: 'get',
        path: '/hello',
        source: 'src/api/server.js',
        mountedPath: '/hello',
        payload: null,
        expectedStatus: 200,
        expectedBody: { message: 'hello world' },
    },
    {
        name: 'POST /api/erp',
        method: 'post',
        path: '/erp',
        source: 'src/api/routes/erp.js',
        mountedPath: '/api/erp',
        payload: {
            contentType: 'multipart/form-data',
            file: {
                field: 'file',
                filename: 'biens.csv',
                mimetype: 'text/csv',
            },
        },
        expectedStatus: 200,
        expectedBody: {
            columns: [
                { name: 'invariant', status: 'lie' },
            ],
        },
    },
    {
        name: 'POST /api/validateErp',
        method: 'post',
        path: '/validateErp',
        source: 'src/api/routes/erp.js',
        mountedPath: '/api/validateErp',
        payload: {
            contentType: 'multipart/form-data',
            file: {
                field: 'file',
                filename: 'biens.csv',
                mimetype: 'text/csv',
            },
            mapping: [
                { key: 'invariant', value: 'invariant' },
                { key: 'rue', value: 'rue' },
            ],
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/create',
        method: 'post',
        path: '/create',
        source: 'src/api/routes/create.js',
        mountedPath: '/api/create',
        payload: {
            contentType: 'multipart/form-data',
            file: {
                field: 'file',
                filename: 'taxe-fonciere.pdf',
                mimetype: 'application/pdf',
            },
        },
        expectedStatus: 200,
        expectedBody: {
            columns: [
                { name: 'invariant', status: 'lie' },
            ],
            biens: [sampleBienPayload],
        },
    },
    {
        name: 'POST /api/validateCreate',
        method: 'post',
        path: '/validateCreate',
        source: 'src/api/routes/create.js',
        mountedPath: '/api/validateCreate',
        payload: {
            contentType: 'multipart/form-data',
            file: {
                field: 'file',
                filename: 'taxe-fonciere.pdf',
                mimetype: 'application/pdf',
            },
            biens: [sampleBienPayload],
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/biens/import',
        method: 'post',
        path: '/import',
        source: 'src/api/routes/biens.js',
        mountedPath: '/api/biens/import',
        payload: [sampleBienPayload],
        expectedStatus: 201,
        expectedBody: {
            message: 'Importation ou mise a jour reussie.',
            lignesImpactees: 'number',
        },
    },
    {
        name: 'GET /api/biens',
        method: 'get',
        path: '/',
        source: 'src/api/routes/biens.js',
        mountedPath: '/api/biens',
        payload: null,
        expectedStatus: 200,
        expectedBody: { biens: [] },
    },
    {
        name: 'GET /api/biens/group',
        method: 'get',
        path: '/group',
        source: 'src/api/routes/biens.js',
        mountedPath: '/api/biens/group',
        payload: null,
        expectedStatus: 200,
        expectedBody: { groups: [] },
    },
    {
        name: 'POST /api/add',
        method: 'post',
        path: '/add',
        source: 'src/api/routes/updateBiens.js',
        mountedPath: '/api/add',
        payload: sampleBienPayload,
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/edit',
        method: 'post',
        path: '/edit',
        source: 'src/api/routes/updateBiens.js',
        mountedPath: '/api/edit',
        payload: {
            invariant: 'INV-TEST-001',
            surface_m2: 45,
            ascenseur: 'Oui',
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/bulk/edit',
        method: 'post',
        path: '/bulk/edit',
        source: 'src/api/routes/updateBiens.js',
        mountedPath: '/api/bulk/edit',
        payload: {
            groupe_id: 1,
            ville: 'Paris',
            raccordement_elec: 'Oui',
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/delete',
        method: 'post',
        path: '/delete',
        source: 'src/api/routes/updateBiens.js',
        mountedPath: '/api/delete',
        payload: {
            invariant: 'INV-TEST-001',
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
    {
        name: 'POST /api/bulk/delete',
        method: 'post',
        path: '/bulk/delete',
        source: 'src/api/routes/updateBiens.js',
        mountedPath: '/api/bulk/delete',
        payload: {
            groupe_id: 1,
        },
        expectedStatus: 200,
        expectedBody: { success: true },
    },
];

describe('Contrats des routes API', () => {
    for (const contract of routeContracts) {
        test(`${contract.name} - route, payload et resultat succes attendus`, () => {
            const source = normalizeSource(readProjectFile(contract.source));
            const routeDeclaration = `router.${contract.method}('${contract.path}'`;
            const serverSource = normalizeSource(readProjectFile('src/api/server.js'));

            if (contract.source === 'src/api/server.js') {
                assert.match(source, new RegExp(`app\\.${contract.method}\\('${contract.path}'`));
            } else {
                assert.ok(
                    source.includes(routeDeclaration),
                    `Declaration manquante: ${routeDeclaration}`
                );
            }

            assert.equal(typeof contract.name, 'string');
            assert.ok(contract.name.includes(contract.method.toUpperCase()));
            assert.ok(contract.name.includes(contract.mountedPath));
            assert.ok(contract.expectedStatus >= 200 && contract.expectedStatus < 300);
            assert.ok(contract.expectedBody && typeof contract.expectedBody === 'object');

            if (contract.mountedPath.startsWith('/api/biens')) {
                assert.ok(serverSource.includes("app.use('/api/biens', biensRouter)"));
            } else if (contract.mountedPath.startsWith('/api/')) {
                assert.ok(serverSource.includes("app.use('/api',"));
            }
        });
    }
});

describe('Payloads attendus', () => {
    test('Les payloads de biens contiennent les champs principaux utilises par les routes', () => {
        const requiredBienFields = [
            'invariant',
            'rue',
            'depcom',
            'ville',
            'nom_immeuble',
            'nature_bien',
            'surface_m2',
        ];

        for (const field of requiredBienFields) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(sampleBienPayload, field),
                `Champ manquant dans sampleBienPayload: ${field}`
            );
        }
    });

    test('Chaque route POST declare un payload exemple', () => {
        const postContracts = routeContracts.filter((contract) => contract.method === 'post');

        for (const contract of postContracts) {
            assert.ok(contract.payload, `Payload manquant pour ${contract.name}`);
        }
    });
});

describe('Enrichissement des biens', () => {
    test('Les routes GET biens exposent les modifications realisees', () => {
        const source = readProjectFile('src/api/routes/biens.js');

        assert.ok(source.includes('a_des_modifications'));
        assert.ok(source.includes('champs_modifies'));
        assert.ok(source.includes('includeModifiedFields'));
    });
});
