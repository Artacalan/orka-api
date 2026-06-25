/*
 * @file Gestion de l'upload de fichiers
 * */

const multer = require('multer')

const storage = multer.memoryStorage()

const csvUpload = multer({
  storage,
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== "text/csv") {
      return callback(new Error("Le fichier n'est pas sur le bon format. Adaptez-le au format .csv"))
    }
    callback(null, true)
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
})

const pdfUpload = multer({
  storage,
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new Error("Le fichier n'est pas sur le bon format. Adaptez-le au format .pdf"))
    }
    callback(null, true)
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
})

module.exports = csvUpload
module.exports.pdf = pdfUpload
