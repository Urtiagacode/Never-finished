import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());

app.use(
  express.json({
    limit: "15mb",
  })
);

// ============================================
// SERVIR LE JEU
// ============================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ============================================
// GEMINI
// ============================================

const apiKey =
  process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "❌ GEMINI_API_KEY introuvable dans .env"
  );
} else {
  console.log(
    "✅ GEMINI_API_KEY trouvée"
  );
}

const ai = new GoogleGenAI({
  apiKey,
});

// ============================================
// ATTENDRE
// ============================================

function attendre(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// ============================================
// DÉTECTER UNE ERREUR 503
// ============================================

function estErreur503(error) {
  const message =
    error?.message?.toLowerCase() || "";

  const status =
    error?.status ||
    error?.code ||
    "";

  return (
    Number(status) === 503 ||
    message.includes("503") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("unavailable") ||
    message.includes("service unavailable")
  );
}

// ============================================
// APPEL GEMINI AVEC RETRY
// ============================================

async function analyserAvecGemini(
  base64Image,
  mimeType
) {
  const modele =
    "gemini-3.7-flash";

  const MAX_TENTATIVES = 3;

  let derniereErreur = null;

  for (
    let tentative = 1;
    tentative <= MAX_TENTATIVES;
    tentative++
  ) {
    try {
      console.log(
        `🤖 Gemini — tentative ${tentative}/${MAX_TENTATIVES}`
      );

      const response =
        await ai.models.generateContent({
          model: modele,

          contents: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },

            {
              text: `
Tu es le système de reconnaissance automobile de Cars Index.

Analyse l'image et identifie la voiture principale visible.

Identifie :

- marque
- modèle
- génération
- année

Utilise les éléments visuels disponibles :
- phares
- feux arrière
- calandre
- carrosserie
- proportions
- jantes
- logo
- détails spécifiques du modèle

S'il y a plusieurs véhicules, identifie uniquement
le véhicule principal.

N'invente pas une information lorsque l'image
ne permet pas de l'identifier suffisamment.

Dans ce cas, utilise "Inconnu".

La confiance doit être un nombre entre 0 et 100.

Réponds uniquement avec le JSON demandé.
              `,
            },
          ],

          config: {
            responseMimeType:
              "application/json",

            responseSchema: {
              type: Type.OBJECT,

              properties: {
                marque: {
                  type: Type.STRING,
                },

                modele: {
                  type: Type.STRING,
                },

                generation: {
                  type: Type.STRING,
                },

                annee: {
                  type: Type.STRING,
                },

                confiance: {
                  type: Type.NUMBER,
                },
              },

              required: [
                "marque",
                "modele",
                "generation",
                "annee",
                "confiance",
              ],
            },
          },
        });

      const texte =
        response.text;

      if (!texte) {
        throw new Error(
          "Gemini a renvoyé une réponse vide."
        );
      }

      const voiture =
        JSON.parse(texte);

      console.log(
        `✅ Réponse obtenue avec ${modele}`
      );

      return voiture;

    } catch (error) {
      derniereErreur = error;

      console.error(
        `❌ Erreur Gemini tentative ${tentative}/${MAX_TENTATIVES}:`,
        error?.message || error
      );

      if (!estErreur503(error)) {
        throw error;
      }

      if (
        tentative <
        MAX_TENTATIVES
      ) {
        const delai =
          tentative * 3000;
 
        console.log(
          `⏳ Gemini indisponible (503). Nouvelle tentative dans ${delai / 1000}s...`
        );

        await attendre(delai);
      }
    }
  }

  const erreur503 =
    new Error(
      "Gemini est temporairement indisponible (503). Réessaie dans quelques instants."
    );

  erreur503.status = 503;

  throw erreur503;
}


// ============================================
// TEST SERVEUR
// ============================================

app.get(
  "/api-test",
  (req, res) => {
    res.json({
      ok: true,
      serveur: "Cars Index",
      geminiKey: !!apiKey,
    });
  }
);

// ============================================
// ANALYSE VOITURE
// ============================================

app.post(
  "/analyser-voiture",
  async (req, res) => {
    try {
      console.log("");
      console.log(
        "===================================="
      );
      console.log(
        "📸 NOUVELLE ANALYSE"
      );
      console.log(
        "===================================="
      );

      const { image } =
        req.body;

      if (!image) {
        return res.status(400).json({
          erreur:
            "Aucune image reçue",
        });
      }

      if (!apiKey) {
        return res.status(500).json({
          erreur:
            "GEMINI_API_KEY absente du serveur",
        });
      }

      console.log(
        "✅ Image reçue"
      );

      console.log(
        "📏 Taille :",
        image.length
      );

      // ========================================
      // TYPE MIME
      // ========================================

      const match =
        image.match(
          /^data:(image\/[\w.+-]+);base64,/
        );

      const mimeType =
        match
          ? match[1]
          : "image/jpeg";

      // ========================================
      // BASE64
      // ========================================

      const base64Image =
        image.replace(
          /^data:image\/[\w.+-]+;base64,/,
          ""
        );

      console.log(
        "🖼️ MIME :",
        mimeType
      );

      console.log(
        "🤖 Analyse Gemini..."
      );

      // ========================================
      // GEMINI + RETRY 503
      // ========================================

      const voiture =
        await analyserAvecGemini(
          base64Image,
          mimeType
        );

      // ========================================
      // RÉSULTAT
      // ========================================

      console.log(
        "🚗 VOITURE DÉTECTÉE :",
        voiture
      );

      console.log(
        "===================================="
      );

      res.json(
        voiture
      );

    } catch (error) {
      console.error("");
      console.error(
        "===================================="
      );
      console.error(
        "❌ ERREUR ANALYSE"
      );
      console.error(
        "===================================="
      );

      console.error(
        error?.message ||
        error
      );

      console.error(
        "===================================="
      );

      // ========================================
      // ERREUR 503
      // ========================================

      if (estErreur503(error)) {
        return res.status(503).json({
          erreur:
            "Gemini est temporairement indisponible. Réessaie dans quelques secondes.",
          code: 503,
        });
      }

      // ========================================
      // AUTRE ERREUR
      // ========================================

      return res.status(500).json({
        erreur:
          error?.message ||
          "Erreur lors de l'analyse de la voiture",
      });
    }
  }
);

// ============================================
// AJOUT VOITURE
// ============================================

app.post(
  "/ajouter-voiture",
  (req, res) => {
    console.log(
      "🚗 Voiture reçue :",
      req.body
    );

    res.json({
      success: true,
      message:
        "Voiture reçue",
    });
  }
);

// ============================================
// LANCEMENT
// ============================================

app.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "🚗 CARS INDEX"
    );
    console.log(
      "===================================="
    );
    console.log(
      `✅ Jeu : http://localhost:${PORT}`
    );
    console.log(
      "🤖 API : /analyser-voiture"
    );
    console.log(
      "🩺 Test : /api-test"
    );
    console.log(
      "===================================="
    );
    console.log("");
  }
);

