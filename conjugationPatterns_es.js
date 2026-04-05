export const CONJUGATION_PATTERNS = {
  ar: {
    // Indicative
    present: {
      stemType: "stem",
      endings: { yo: "o", tú: "as", él: "a", nosotros: "amos", vosotros: "áis", ellos: "an" }
    },
    preterite: {
      stemType: "stem",
      endings: { yo: "é", tú: "aste", él: "ó", nosotros: "amos", vosotros: "asteis", ellos: "aron" }
    },
    imperfect: {
      stemType: "stem",
      endings: { yo: "aba", tú: "abas", él: "aba", nosotros: "ábamos", vosotros: "abais", ellos: "aban" }
    },
    future: {
      stemType: "infinitive",
      endings: { yo: "é", tú: "ás", él: "á", nosotros: "emos", vosotros: "éis", ellos: "án" }
    },
    conditional: {
      stemType: "infinitive",
      endings: { yo: "ía", tú: "ías", él: "ía", nosotros: "íamos", vosotros: "íais", ellos: "ían" }
    },

    // Subjunctive (present): based on "yo" present indicative minus final "o"
    present_subjunctive: {
      stemType: "yo_present_minus_o",
      endings: { yo: "e", tú: "es", él: "e", nosotros: "emos", vosotros: "éis", ellos: "en" }
    },

    // Imperative
    imperative_affirmative: {
      stemType: "imperative_affirmative",
      endings: { tú: "", usted: "", nosotros: "", vosotros: "", ustedes: "" }
    },
    imperative_negative: {
      stemType: "present_subjunctive_full",
      endings: { tú: "no ", usted: "no ", nosotros: "no ", vosotros: "no ", ustedes: "no " }
    }
  },

  er: {
    present: {
      stemType: "stem",
      endings: { yo: "o", tú: "es", él: "e", nosotros: "emos", vosotros: "éis", ellos: "en" }
    },
    preterite: {
      stemType: "stem",
      endings: { yo: "í", tú: "iste", él: "ió", nosotros: "imos", vosotros: "isteis", ellos: "ieron" }
    },
    imperfect: {
      stemType: "stem",
      endings: { yo: "ía", tú: "ías", él: "ía", nosotros: "íamos", vosotros: "íais", ellos: "ían" }
    },
    future: {
      stemType: "infinitive",
      endings: { yo: "é", tú: "ás", él: "á", nosotros: "emos", vosotros: "éis", ellos: "án" }
    },
    conditional: {
      stemType: "infinitive",
      endings: { yo: "ía", tú: "ías", él: "ía", nosotros: "íamos", vosotros: "íais", ellos: "ían" }
    },

    present_subjunctive: {
      stemType: "yo_present_minus_o",
      endings: { yo: "a", tú: "as", él: "a", nosotros: "amos", vosotros: "áis", ellos: "an" }
    },

    imperative_affirmative: {
      stemType: "imperative_affirmative",
      endings: { tú: "", usted: "", nosotros: "", vosotros: "", ustedes: "" }
    },
    imperative_negative: {
      stemType: "present_subjunctive_full",
      endings: { tú: "no ", usted: "no ", nosotros: "no ", vosotros: "no ", ustedes: "no " }
    }
  },

  ir: {
    present: {
      stemType: "stem",
      endings: { yo: "o", tú: "es", él: "e", nosotros: "imos", vosotros: "ís", ellos: "en" }
    },
    preterite: {
      stemType: "stem",
      endings: { yo: "í", tú: "iste", él: "ió", nosotros: "imos", vosotros: "isteis", ellos: "ieron" }
    },
    imperfect: {
      stemType: "stem",
      endings: { yo: "ía", tú: "ías", él: "ía", nosotros: "íamos", vosotros: "íais", ellos: "ían" }
    },
    future: {
      stemType: "infinitive",
      endings: { yo: "é", tú: "ás", él: "á", nosotros: "emos", vosotros: "éis", ellos: "án" }
    },
    conditional: {
      stemType: "infinitive",
      endings: { yo: "ía", tú: "ías", él: "ía", nosotros: "íamos", vosotros: "íais", ellos: "ían" }
    },

    present_subjunctive: {
      stemType: "yo_present_minus_o",
      endings: { yo: "a", tú: "as", él: "a", nosotros: "amos", vosotros: "áis", ellos: "an" }
    },

    imperative_affirmative: {
      stemType: "imperative_affirmative",
      endings: { tú: "", usted: "", nosotros: "", vosotros: "", ustedes: "" }
    },
    imperative_negative: {
      stemType: "present_subjunctive_full",
      endings: { tú: "no ", usted: "no ", nosotros: "no ", vosotros: "no ", ustedes: "no " }
    }
  }
};
