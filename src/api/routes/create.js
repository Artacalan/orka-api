/**
 * @file Routes creation depuis PDF taxe fonciere
 * POST /api/create - analyse le PDF et extrait les champs biens_fiscaux
 * POST /api/validateCreate - importe les donnees extraites ou corrigees
 */

const express = require('express')
const router = express.Router()
const upload = require('./middlewares/upload.middleware')
const { analyzeCreate, validateCreate } = require('../controllers/create.controller')

router.post('/create', upload.pdf.single('file'), analyzeCreate)
router.post('/validateCreate', upload.pdf.single('file'), validateCreate)

module.exports = router
