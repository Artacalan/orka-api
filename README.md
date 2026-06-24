# orka_api

API Express separee de l'initialisation MySQL, avec regroupement des biens par adresse et type.

## Installation

```bash
npm install
```

## Configuration

1. Copier `.env.example` vers `.env`
2. Renseigner les variables MySQL

Variables attendues :

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `PORT` (optionnel, default: `3000`)

## Initialiser la BDD

```bash
npm run db:init
```

## Lancement API

```bash
npm start
```

Mode developpement (reload auto via watch natif Node) :

```bash
npm run dev
```

## Endpoint actuel

- `GET /hello`
- `POST /api/biens/import`

Reponse :

```json
{
  "message": "hello world"
}
```

Le endpoint d'import cree automatiquement un groupe dans `biens_groupes` quand l'adresse et le type sont nouveaux, puis rattache chaque bien a ce groupe via `groupe_id`.
# orka-api
