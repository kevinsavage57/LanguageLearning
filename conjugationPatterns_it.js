export const CONJUGATION_PATTERNS = {
  are: {
    present: {
      stemType: "stem",
      endings: { io: "o", tu: "i", lui: "a", noi: "iamo", voi: "ate", loro: "ano" }
    },
    passato_prossimo: {
      stemType: "passato_prossimo",
      endings: { io: "", tu: "", lui: "", noi: "", voi: "", loro: "" }
    },
    imperfetto: {
      stemType: "stem",
      endings: { io: "avo", tu: "avi", lui: "ava", noi: "avamo", voi: "avate", loro: "avano" }
    },
    futuro: {
      stemType: "futuro",
      endings: { io: "erò", tu: "erai", lui: "erà", noi: "eremo", voi: "erete", loro: "eranno" }
    },
    condizionale: {
      stemType: "futuro",
      endings: { io: "erei", tu: "eresti", lui: "erebbe", noi: "eremmo", voi: "ereste", loro: "erebbero" }
    },
    congiuntivo_presente: {
      stemType: "stem",
      endings: { io: "i", tu: "i", lui: "i", noi: "iamo", voi: "iate", loro: "ino" }
    },
    imperativo: {
      stemType: "imperativo",
      endings: { tu: "", lei: "", noi: "", voi: "", loro: "" }
    }
  },

  ere: {
    present: {
      stemType: "stem",
      endings: { io: "o", tu: "i", lui: "e", noi: "iamo", voi: "ete", loro: "ono" }
    },
    passato_prossimo: {
      stemType: "passato_prossimo",
      endings: { io: "", tu: "", lui: "", noi: "", voi: "", loro: "" }
    },
    imperfetto: {
      stemType: "stem",
      endings: { io: "evo", tu: "evi", lui: "eva", noi: "evamo", voi: "evate", loro: "evano" }
    },
    futuro: {
      stemType: "futuro",
      endings: { io: "erò", tu: "erai", lui: "erà", noi: "eremo", voi: "erete", loro: "eranno" }
    },
    condizionale: {
      stemType: "futuro",
      endings: { io: "erei", tu: "eresti", lui: "erebbe", noi: "eremmo", voi: "ereste", loro: "erebbero" }
    },
    congiuntivo_presente: {
      stemType: "stem",
      endings: { io: "a", tu: "a", lui: "a", noi: "iamo", voi: "iate", loro: "ano" }
    },
    imperativo: {
      stemType: "imperativo",
      endings: { tu: "", lei: "", noi: "", voi: "", loro: "" }
    }
  },

  ire: {
    present: {
      stemType: "stem",
      endings: { io: "o", tu: "i", lui: "e", noi: "iamo", voi: "ite", loro: "ono" }
    },
    passato_prossimo: {
      stemType: "passato_prossimo",
      endings: { io: "", tu: "", lui: "", noi: "", voi: "", loro: "" }
    },
    imperfetto: {
      stemType: "stem",
      endings: { io: "ivo", tu: "ivi", lui: "iva", noi: "ivamo", voi: "ivate", loro: "ivano" }
    },
    futuro: {
      stemType: "futuro",
      endings: { io: "irò", tu: "irai", lui: "irà", noi: "iremo", voi: "irete", loro: "iranno" }
    },
    condizionale: {
      stemType: "futuro",
      endings: { io: "irei", tu: "iresti", lui: "irebbe", noi: "iremmo", voi: "ireste", loro: "irebbero" }
    },
    congiuntivo_presente: {
      stemType: "stem",
      endings: { io: "a", tu: "a", lui: "a", noi: "iamo", voi: "iate", loro: "ano" }
    },
    imperativo: {
      stemType: "imperativo",
      endings: { tu: "", lei: "", noi: "", voi: "", loro: "" }
    }
  },

  // -ire verbs that insert -isc- for all singular + loro (e.g. finire, capire)
  ire_isc: {
    present: {
      stemType: "stem_isc",
      endings: { io: "isco", tu: "isci", lui: "isce", noi: "iamo", voi: "ite", loro: "iscono" }
    },
    passato_prossimo: {
      stemType: "passato_prossimo",
      endings: { io: "", tu: "", lui: "", noi: "", voi: "", loro: "" }
    },
    imperfetto: {
      stemType: "stem",
      endings: { io: "ivo", tu: "ivi", lui: "iva", noi: "ivamo", voi: "ivate", loro: "ivano" }
    },
    futuro: {
      stemType: "futuro",
      endings: { io: "irò", tu: "irai", lui: "irà", noi: "iremo", voi: "irete", loro: "iranno" }
    },
    condizionale: {
      stemType: "futuro",
      endings: { io: "irei", tu: "iresti", lui: "irebbe", noi: "iremmo", voi: "ireste", loro: "irebbero" }
    },
    congiuntivo_presente: {
      stemType: "stem_isc",
      endings: { io: "isca", tu: "isca", lui: "isca", noi: "iamo", voi: "iate", loro: "iscano" }
    },
    imperativo: {
      stemType: "imperativo",
      endings: { tu: "", lei: "", noi: "", voi: "", loro: "" }
    }
  }
};
