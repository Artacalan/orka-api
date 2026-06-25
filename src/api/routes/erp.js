/**
 * @file Routes ERP
 * POST /api/erp – analyse les colonnes du CSV vs biens_fiscaux
 * POST /api/validateErp – importe les données avec mapping
 */

const express = require('express')
const router  = express.Router()
const upload  = require('./middlewares/upload.middleware')
const { analyzeErp, validateErp } = require('../controllers/erp.controller')

router.post('/erp', upload.single('file'), analyzeErp)
router.post('/validateErp', upload.single('file'), validateErp)

module.exports = router
