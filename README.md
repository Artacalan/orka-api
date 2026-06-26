# orka_api

API Express pour importer, consulter, modifier et optimiser des biens fiscaux stockes dans MySQL.

## Installation

```bash
npm install
```

## Configuration

Copier `.env.example` vers `.env`, puis renseigner les variables suivantes :

```env
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
PORT=3000
```

`PORT` est optionnel. Si absent, l'API ecoute sur `3000`.

## Scripts

```bash
npm start          # lance l'API
npm run dev        # lance l'API avec reload natif Node
npm run db:init    # cree/verifie les tables MySQL
npm run db:clear   # vide les tables de donnees
npm run test:routes
```

## Conventions API

Base locale par defaut :

```text
http://localhost:3000
```

Formats supportes :

- JSON : `Content-Type: application/json`
- CSV : `multipart/form-data`, champ fichier `file`, mimetype `text/csv`
- PDF : `multipart/form-data`, champ fichier `file`, mimetype `application/pdf`
- Fichiers d'optimisation : `multipart/form-data`, champs fichiers libres, taille max `10 Mo` par fichier

Les booleens metier acceptent `true`, `1`, `"1"` ou `"Oui"` pour `1`. Toute autre valeur devient `0`.

## Modele bien fiscal

Un bien fiscal est stocke dans `biens_fiscaux`.

```json
{
  "invariant": "INV-001",
  "groupe_id": 1,
  "rue": "10 rue de la Paix",
  "depcom": "75056",
  "ville": "Paris",
  "nom_immeuble": "Residence Test",
  "nature_bien": "Appartement",
  "ponderation_nature": 1,
  "etage": 2,
  "categorie": "A",
  "surface_m2": 42,
  "coef_entretien": 1,
  "coef_sit_particuliere": 1,
  "coef_sit_generale": 1,
  "ascenseur": 1,
  "eau_courante": 1,
  "raccordement_gaz": 0,
  "raccordement_elec": 1,
  "nb_baignoires": 1,
  "nb_douches": 0,
  "nb_bidets": 0,
  "nb_wc": 1,
  "nb_eviers": 1,
  "raccordement_egout": 1,
  "nb_pieces": 2,
  "nb_vide_ordures": 0,
  "valeur_calculee": null
}
```

Les groupes sont stockes dans `biens_groupes`. Un groupe est identifie par la combinaison `rue`, `depcom`, `ville`, `nature_bien`. Lors d'un import ou d'une creation, l'API reutilise le groupe existant ou en cree un nouveau.

Les anciennes valeurs sont archivees dans `biens_fiscaux_old` pour les operations `edit`, `delete` et `erp_update`.

## Champs modifiables

Les routes d'edition ignorent les champs inconnus et n'acceptent que :

```text
rue, depcom, ville, nom_immeuble, nature_bien,
ponderation_nature, etage, categorie, surface_m2,
coef_entretien, coef_sit_particuliere, coef_sit_generale,
ascenseur, eau_courante, raccordement_gaz, raccordement_elec,
nb_baignoires, nb_douches, nb_bidets, nb_wc, nb_eviers,
raccordement_egout, nb_pieces, nb_vide_ordures
```

## Routes

### GET /hello

Route de test.

Payload attendu : aucun.

Traitement : retourne une reponse fixe.

Reponse `200` :

```json
{
  "message": "hello world"
}
```

### POST /api/erp

Analyse les colonnes d'un CSV ERP et indique si chaque colonne correspond a une colonne de `biens_fiscaux`.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `file` | CSV | oui | Fichier CSV avec en-tetes |

Traitement :

1. Verifie qu'un fichier CSV est fourni.
2. Parse le CSV avec les en-tetes en colonnes.
3. Lit les colonnes de `biens_fiscaux`, hors `groupe_id`.
4. Compare les noms de colonnes en ignorant la casse et les espaces.

Reponse `200` :

```json
{
  "columns": [
    {
      "name": "invariant",
      "status": "lié"
    },
    {
      "name": "colonne_externe",
      "status": "non lié"
    }
  ]
}
```

Erreurs :

- `400` si aucun CSV n'est fourni : `{ "error": "Aucun fichier CSV fourni" }`
- `500` si le parsing ou la base echoue : `{ "error": "message technique" }`

### POST /api/validateErp

Importe ou met a jour les lignes d'un CSV ERP selon un mapping explicite.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `file` | CSV | oui | Fichier CSV a importer |
| `mapping` | JSON string | oui | Tableau `{ key, value }`, ou `key` est la colonne CSV et `value` la colonne `biens_fiscaux` |

Exemple de `mapping` :

```json
[
  { "key": "id_local", "value": "invariant" },
  { "key": "adresse", "value": "rue" },
  { "key": "surface", "value": "surface_m2" }
]
```

Traitement :

1. Verifie le CSV.
2. Parse `mapping`.
3. Parse les lignes du CSV.
4. Construit chaque ligne cible avec le mapping.
5. Convertit les colonnes booleennes (`ascenseur`, `eau_courante`, `raccordement_gaz`, `raccordement_elec`, `raccordement_egout`).
6. Cree ou reutilise un groupe selon `rue`, `depcom`, `ville`, `nature_bien`.
7. Si `invariant` existe deja, archive l'ancienne ligne dans `biens_fiscaux_old` avec `operation = "erp_update"`, puis met a jour.
8. Sinon, insere une nouvelle ligne.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si aucun CSV n'est fourni.
- `400` si `mapping` n'est pas un JSON valide.
- `400` si `mapping` n'est pas un tableau non vide.
- `500` en cas d'erreur de parsing ou de base.

### POST /api/create

Analyse un PDF de taxe fonciere et extrait les champs utilisables pour creer des biens.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `file` | PDF | oui | PDF de taxe fonciere |

Traitement :

1. Verifie qu'un PDF est fourni.
2. Extrait le texte du PDF.
3. Tente d'extraire `invariant`, adresse, code commune, ville, nature du bien, categorie et surface.
4. Compare les champs extraits avec les colonnes de `biens_fiscaux`.

Reponse `200` :

```json
{
  "columns": [
    {
      "name": "invariant",
      "status": "lié",
      "value": "123456789"
    },
    {
      "name": "etage",
      "status": "non renseigné",
      "value": null
    }
  ],
  "biens": [
    {
      "invariant": "123456789",
      "rue": "10 RUE DE LA PAIX",
      "depcom": "75056",
      "ville": "PARIS",
      "nom_immeuble": null,
      "nature_bien": "APPARTEMENT",
      "surface_m2": 42
    }
  ]
}
```

Erreurs :

- `400` si aucun PDF n'est fourni.
- `500` si l'analyse du PDF ou la base echoue.

### POST /api/validateCreate

Valide et importe des biens issus d'un PDF, ou des biens corriges envoyes par le client.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `file` | PDF | non si `biens` est fourni | PDF a analyser puis importer |
| `biens` | JSON string | non | Tableau de biens corriges ou confirmes |

Exemple de `biens` :

```json
[
  {
    "invariant": "123456789",
    "rue": "10 RUE DE LA PAIX",
    "depcom": "75056",
    "ville": "PARIS",
    "nature_bien": "APPARTEMENT",
    "surface_m2": 42
  }
]
```

Traitement :

1. Si `biens` est fourni, l'utilise comme source.
2. Sinon, analyse le PDF comme `/api/create`.
3. Verifie que chaque bien contient un `invariant`.
4. Construit automatiquement un mapping identite avec les champs reconnus par `biens_fiscaux`.
5. Insere ou met a jour via le meme traitement que `/api/validateErp`.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si ni PDF ni `biens` valide n'est fourni.
- `400` si `biens` n'est pas un tableau JSON non vide.
- `400` si un bien n'a pas d'`invariant`.
- `400` si aucun champ n'est reconnu pour `biens_fiscaux`.
- `500` en cas d'erreur technique.

### POST /api/biens/import

Importe en masse des biens fiscaux au format JSON.

Payload attendu : `application/json`, tableau non vide de biens.

```json
[
  {
    "invariant": "INV-001",
    "rue": "10 rue de la Paix",
    "depcom": "75056",
    "ville": "Paris",
    "nom_immeuble": "Residence Test",
    "nature_bien": "Appartement",
    "surface_m2": 42,
    "ascenseur": "Oui",
    "eau_courante": "Oui",
    "raccordement_gaz": "Non",
    "raccordement_elec": "Oui",
    "raccordement_egout": "Oui",
    "nb_pieces": 2
  }
]
```

Traitement :

1. Verifie que le body est un tableau non vide.
2. Pour chaque ligne, cree ou reutilise un groupe.
3. Insere dans `biens_fiscaux`.
4. Si l'`invariant` existe deja, met a jour la ligne avec `ON DUPLICATE KEY UPDATE`.

Reponse `201` :

```json
{
  "message": "Importation ou mise a jour reussie.",
  "lignesImpactees": 1
}
```

Erreurs :

- `400` si le body n'est pas un tableau non vide.
- `500` en cas d'erreur de base.

### GET /api/biens

Liste tous les biens.

Payload attendu : aucun.

Traitement :

1. Lit tous les biens, tries par `invariant`.
2. Recupere la derniere optimisation de chaque groupe.
3. Compare chaque bien avec sa derniere archive `edit` ou `erp_update`.
4. Ajoute des champs calcules de presentation.

Reponse `200` :

```json
{
  "biens": [
    {
      "invariant": "INV-001",
      "groupe_id": 1,
      "rue": "10 rue de la Paix",
      "ville": "Paris",
      "nom": "Residence Test",
      "adresse": "10 rue de la Paix 75056 Paris",
      "optimization": {
        "id": 3,
        "group_id": 1,
        "commentaire": "Optimisation demandee",
        "statut": "en_cours",
        "fichiers": [],
        "created_at": "2026-01-01T10:00:00.000Z",
        "updated_at": "2026-01-01T10:00:00.000Z"
      },
      "statut_optimisation": "en_cours",
      "en_optimisation": true,
      "a_des_modifications": true
    }
  ]
}
```

Erreurs :

- `500` en cas d'erreur de base.

### GET /api/biens/group

Liste tous les groupes avec leurs biens.

Payload attendu : aucun.

Traitement :

1. Lit tous les groupes, tries par `id`.
2. Recupere la derniere optimisation de chaque groupe.
3. Pour chaque groupe, lit les biens associes.
4. Enrichit les biens comme dans `/api/biens`.

Reponse `200` :

```json
{
  "groups": [
    {
      "id": 1,
      "nom": "Residence Test",
      "rue": "10 rue de la Paix",
      "depcom": "75056",
      "ville": "Paris",
      "nature_bien": "Appartement",
      "adresse": "10 rue de la Paix 75056 Paris",
      "optimization": null,
      "statut_optimisation": null,
      "en_optimisation": false,
      "biens": []
    }
  ]
}
```

Erreurs :

- `500` en cas d'erreur de base.

### GET /api/biens/:invariant

Recupere un bien par son invariant.

Payload attendu : aucun.

Traitement :

1. Recherche le bien par `invariant`.
2. Recupere la derniere optimisation du groupe.
3. Compare avec la derniere archive `edit` ou `erp_update`.
4. Ajoute `champs_modifies` en plus de `a_des_modifications`.

Reponse `200` :

```json
{
  "bien": {
    "invariant": "INV-001",
    "groupe_id": 1,
    "rue": "10 rue de la Paix",
    "nom": "Residence Test",
    "adresse": "10 rue de la Paix 75056 Paris",
    "optimization": null,
    "statut_optimisation": null,
    "en_optimisation": false,
    "a_des_modifications": true,
    "champs_modifies": ["surface_m2", "ascenseur"]
  }
}
```

Erreurs :

- `404` si le bien est introuvable : `{ "error": "Bien non trouve." }`
- `500` en cas d'erreur de base.

### GET /api/biens/group/:id

Recupere un groupe par son id avec ses biens.

Payload attendu : aucun.

Traitement :

1. Recherche le groupe par `id`.
2. Lit les biens du groupe.
3. Recupere la derniere optimisation.
4. Enrichit les biens avec `a_des_modifications` et `champs_modifies`.

Reponse `200` :

```json
{
  "group": {
    "id": 1,
    "nom": "Residence Test",
    "rue": "10 rue de la Paix",
    "depcom": "75056",
    "ville": "Paris",
    "nature_bien": "Appartement",
    "adresse": "10 rue de la Paix 75056 Paris",
    "optimization": null,
    "statut_optimisation": null,
    "en_optimisation": false,
    "biens": []
  }
}
```

Erreurs :

- `404` si le groupe est introuvable : `{ "error": "Groupe non trouve." }`
- `500` en cas d'erreur de base.

### POST /api/add

Ajoute un bien.

Payload attendu : `application/json`, objet bien. `invariant` est obligatoire.

```json
{
  "invariant": "INV-001",
  "rue": "10 rue de la Paix",
  "depcom": "75056",
  "ville": "Paris",
  "nom_immeuble": "Residence Test",
  "nature_bien": "Appartement",
  "surface_m2": 42,
  "ascenseur": "Oui"
}
```

Traitement :

1. Verifie `invariant`.
2. Cree ou reutilise le groupe.
3. Insere le bien dans `biens_fiscaux`.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si `invariant` est absent.
- `500` en cas d'erreur de base, notamment invariant deja existant.

### POST /api/edit

Modifie un bien existant.

Payload attendu : `application/json`, `invariant` et au moins un champ modifiable.

```json
{
  "invariant": "INV-001",
  "surface_m2": 45,
  "ascenseur": "Oui"
}
```

Traitement :

1. Verifie `invariant`.
2. Filtre les champs non modifiables.
3. Recherche le bien.
4. Archive l'ancienne ligne dans `biens_fiscaux_old` avec `operation = "edit"`.
5. Met a jour les champs fournis.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si `invariant` est absent.
- `400` si aucun champ valide n'est fourni.
- `404` si le bien est introuvable.
- `500` en cas d'erreur de base.

### POST /api/bulk/edit

Modifie tous les biens d'un groupe.

Payload attendu : `application/json`, `groupe_id` et au moins un champ modifiable.

```json
{
  "groupe_id": 1,
  "ville": "Paris",
  "raccordement_elec": "Oui"
}
```

Traitement :

1. Verifie `groupe_id`.
2. Filtre les champs non modifiables.
3. Recherche les biens du groupe.
4. Archive chaque ancienne ligne dans `biens_fiscaux_old` avec `operation = "edit"`.
5. Met a jour tous les biens du groupe.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si `groupe_id` est absent.
- `400` si aucun champ valide n'est fourni.
- `404` si le groupe est introuvable ou vide.
- `500` en cas d'erreur de base.

### POST /api/delete

Supprime un bien.

Payload attendu : `application/json`

```json
{
  "invariant": "INV-001"
}
```

Traitement :

1. Verifie `invariant`.
2. Recherche le bien.
3. Archive la ligne dans `biens_fiscaux_old` avec `operation = "delete"`.
4. Supprime le bien de `biens_fiscaux`.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si `invariant` est absent.
- `404` si le bien est introuvable.
- `500` en cas d'erreur de base.

### POST /api/bulk/delete

Supprime tous les biens d'un groupe.

Payload attendu : `application/json`

```json
{
  "groupe_id": 1
}
```

Traitement :

1. Verifie `groupe_id`.
2. Recherche les biens du groupe.
3. Archive chaque bien dans `biens_fiscaux_old` avec `operation = "delete"`.
4. Supprime tous les biens du groupe.

Reponse `200` :

```json
{
  "success": true
}
```

Erreurs :

- `400` si `groupe_id` est absent.
- `404` si le groupe est introuvable ou vide.
- `500` en cas d'erreur de base.

### POST /api/optimize

Cree une demande d'optimisation pour un groupe.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `group_id` ou `groupe_id` | number/string | oui | Id du groupe |
| `commentaire` ou `comment` | string | non | Commentaire associe |
| fichiers libres | file[] | non | Pieces jointes, metadata seulement |

Traitement :

1. Verifie `group_id` ou `groupe_id`.
2. Verifie que le groupe existe.
3. Transforme les fichiers en metadata (`nom`, `mimetype`, `taille`). Les contenus ne sont pas stockes.
4. Insere une ligne dans `optimize` avec `statut = "en_cours"`.

Reponse `200` :

```json
{
  "success": true,
  "optimization": {
    "id": 1,
    "group_id": 1,
    "commentaire": "Optimisation demandee",
    "statut": "en_cours",
    "fichiers": [
      {
        "nom": "note.pdf",
        "mimetype": "application/pdf",
        "taille": 12345
      }
    ],
    "created_at": "2026-01-01T10:00:00.000Z",
    "updated_at": "2026-01-01T10:00:00.000Z"
  }
}
```

Erreurs :

- `400` si `group_id` est absent.
- `404` si le groupe est introuvable.
- `500` en cas d'erreur de base.

### POST /api/bulk/optimize

Cree une demande d'optimisation pour tous les groupes.

Payload attendu : `multipart/form-data`

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `commentaire` ou `comment` | string | non | Commentaire commun |
| fichiers libres | file[] | non | Pieces jointes communes, metadata seulement |

Traitement :

1. Lit tous les groupes.
2. Si aucun groupe n'existe, retourne `404`.
3. Transforme les fichiers en metadata.
4. Cree une optimisation `en_cours` pour chaque groupe.

Reponse `200` :

```json
{
  "success": true,
  "groupesImpactes": 2,
  "optimizations": [
    {
      "id": 1,
      "group_id": 1,
      "commentaire": "Optimisation globale",
      "statut": "en_cours",
      "fichiers": []
    },
    {
      "id": 2,
      "group_id": 2,
      "commentaire": "Optimisation globale",
      "statut": "en_cours",
      "fichiers": []
    }
  ]
}
```

Erreurs :

- `404` si aucun groupe n'existe.
- `500` en cas d'erreur de base.

## Notes sur les fichiers uploades

- Les uploads utilisent `multer` en memoire.
- Les CSV et PDF sont limites a `10 Mo`.
- `/api/erp` et `/api/validateErp` refusent les fichiers dont le mimetype n'est pas `text/csv`.
- `/api/create` et `/api/validateCreate` refusent les fichiers dont le mimetype n'est pas `application/pdf`.
- Les routes d'optimisation acceptent tout type de fichier, mais ne conservent que les metadata.

## Notes sur les modifications exposees

Les routes de lecture comparent les donnees actuelles avec la derniere archive `edit` ou `erp_update` de chaque `invariant`.

- `a_des_modifications`: `true` si au moins un champ differe.
- `champs_modifies`: liste des champs modifies, exposee seulement sur `GET /api/biens/:invariant` et `GET /api/biens/group/:id`.

Les champs booleens et numeriques sont normalises avant comparaison afin d'eviter les faux positifs entre `"1"` et `1`, par exemple.
