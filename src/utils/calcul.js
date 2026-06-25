function calculerValeur(bien) {
    if (!bien.surface_m2 || !bien.ponderation_nature) return null;

    const base = parseFloat(bien.surface_m2) * parseFloat(bien.ponderation_nature);
    const ce  = parseFloat(bien.coef_entretien        ?? 1);
    const csp = parseFloat(bien.coef_sit_particuliere ?? 1);
    const csg = parseFloat(bien.coef_sit_generale     ?? 1);

    return parseFloat((base * ce * csp * csg).toFixed(2));
}

module.exports = { calculerValeur };
