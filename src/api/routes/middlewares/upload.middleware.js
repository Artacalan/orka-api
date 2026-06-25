/*
 * @file Gestion de l'upload d'un fichier .csv
 * */

const multer = require('multer')

const storage = multer.memoryStorage()

const upload = multer({
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

module.exports = upload
