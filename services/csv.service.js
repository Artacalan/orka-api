/**
 * @file Formatte les données .csv en tableau d'objkets
 * */

const { parse } = require("csv-parse/sync")

const parseData = (data) => {
  const res = parse(
    data, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }
  )

  if (!res.length) throw new Error("Le fichier est vide")

  const cols = Object.keys(res[0])
  console.log("[parseData] data", data)
  console.log("[parseData] res", res)
  console.log("[parseData] cols", cols)


  return {
    columns: cols,
    rows: res,
  }
}

module.exports = { parseData }
