/* ============================================
   GARAGE INDEX — script.js
   Navigation + collection + duel + caméra
   ============================================ */

// Utilise automatiquement le même lien HTTPS
// que celui utilisé pour ouvrir Cars Index sur le téléphone.
const API_BASE_URL = window.location.origin;

let CARS = [];

/* ============================================
   CAMÉRA
   ============================================ */

let cameraStream = null;

function getCameraElements() {
  return {
    camera: document.getElementById("camera"),
    btnCapture: document.getElementById("btnCapture"),
    photoCanvas: document.getElementById("photoCanvas"),
    scanResult: document.getElementById("scanResult")
  };
}

async function startCamera() {
  const { camera } = getCameraElements();

  if (!camera) {
    console.error("Élément vidéo #camera introuvable.");
    return;
  }

  if (cameraStream) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {
          ideal: "environment"
        }
      },
      audio: false
    });

    camera.srcObject = cameraStream;

  } catch (error) {
    console.error("Erreur caméra :", error);

    alert(
      "Impossible d'accéder à la caméra. Vérifie les autorisations de ton navigateur."
    );
  }
}

function stopCamera() {
  const { camera } = getCameraElements();

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (camera) {
    camera.srcObject = null;
  }
}

function initCamera() {
  const {
    camera,
    btnCapture,
    photoCanvas,
    scanResult
  } = getCameraElements();

  if (!camera || !btnCapture || !photoCanvas) {
    console.warn(
      "Les éléments de caméra ne sont pas encore présents dans le HTML."
    );
    return;
  }

  btnCapture.addEventListener("click", () => {

    if (!camera.srcObject) {
      alert("La caméra n'est pas encore démarrée.");
      return;
    }

    if (!camera.videoWidth || !camera.videoHeight) {
      alert("La caméra est en cours de démarrage.");
      return;
    }

    const context = photoCanvas.getContext("2d");

    photoCanvas.width = camera.videoWidth;
    photoCanvas.height = camera.videoHeight;

    context.drawImage(
      camera,
      0,
      0,
      photoCanvas.width,
      photoCanvas.height
    );

    const image =
      photoCanvas.toDataURL("image/jpeg", 0.9);

    console.log("📸 Photo capturée");

    if (scanResult) {
      scanResult.hidden = false;

      scanResult.innerHTML = `
        <p>📸 Photo prise avec succès</p>

        <img
          src="${image}"
          alt="Photo capturée"
          style="
            width:100%;
            max-height:300px;
            object-fit:cover;
            border-radius:12px;
            margin-top:10px;
          "
        >

        <p style="margin-top:10px;">
          🔎 Analyse en cours...
        </p>
      `;
    }

    envoyerPhotoIA(image);
  });
}


/* ============================================
   ANALYSE IA (GEMINI)
   ============================================ */

async function envoyerPhotoIA(image) {

  const { scanResult } =
    getCameraElements();

  try {

    console.log(
      "📡 Envoi vers :",
      `${API_BASE_URL}/analyser-voiture`
    );

    const reponse =
      await fetch(
        `${API_BASE_URL}/analyser-voiture`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            image
          })
        }
      );

    console.log(
      "📡 Status serveur :",
      reponse.status
    );

    const texteReponse =
      await reponse.text();

    console.log(
      "📨 Réponse serveur :",
      texteReponse
    );

    let resultat;

    try {

      resultat =
        JSON.parse(
          texteReponse
        );

    } catch {

      throw new Error(
        `Le serveur a renvoyé une réponse invalide : ${texteReponse}`
      );

    }

    if (!reponse.ok) {

      throw new Error(
        resultat.erreur ||
        `Erreur HTTP ${reponse.status}`
      );

    }

    if (resultat.erreur) {
      throw new Error(
        resultat.erreur
      );
    }

    console.log(
      "🤖 Résultat IA :",
      resultat
    );

    if (
      !resultat.marque ||
      resultat.marque === "Inconnu"
    ) {

      if (scanResult) {

        scanResult.innerHTML += `
          <p style="margin-top:10px; color:var(--paper-dim);">
            😕 Voiture non identifiée par l'IA.
            Réessaie avec une photo plus nette.
          </p>
        `;

      }

      return;
    }

    const voiture =
      trouverOuCreerVoiture(
        resultat
      );

    await persisterVoiture(
      voiture
    );

    if (scanResult) {

      scanResult.innerHTML += `
        <p style="margin-top:10px;">
          ✅ Identifiée :
          <strong>
            ${voiture.marque}
            ${voiture.modele}
          </strong>

          ${
            resultat.annee
              ? `(${resultat.annee})`
              : ""
          }

          — confiance
          ${resultat.confiance ?? "?"}%
        </p>

        <p style="color:var(--paper-dim);">
          🚗 Voiture ajoutée à ton Index !
        </p>
      `;

    }

  } catch (error) {

    console.error(
      "❌ Erreur lors de l'analyse IA :",
      error
    );

    if (scanResult) {

      scanResult.innerHTML += `
        <p
          style="
            margin-top:10px;
            color:var(--paper-dim);
          "
        >
          ⚠️ Erreur pendant l'analyse.
        </p>

        <p
          style="
            margin-top:6px;
            color:var(--paper-dim);
            font-size:0.9em;
          "
        >
          ${error.message}
        </p>
      `;

    }

  }

}


/* ============================================
   TROUVER / CRÉER VOITURE
   ============================================ */

function trouverOuCreerVoiture(voitureIA) {

  const marque =
    (voitureIA.marque || "Inconnu")
      .trim();

  const modele =
    (voitureIA.modele || "Inconnu")
      .trim();

  let voiture =
    CARS.find(c =>
      c.marque.toLowerCase() ===
        marque.toLowerCase()
      &&
      c.modele.toLowerCase() ===
        modele.toLowerCase()
    );

  if (!voiture) {

    voiture = {

      id: "c" + Date.now(),

      marque,

      modele,

      generation:
        voitureIA.generation ||
        "—",

      annee:
        voitureIA.annee ||
        "—",

      categorie:
        "Non classée",

      points: 0,

      possedee: true,

      favori: false,

      objectif: false,

      moteur: "—",

      chevaux: "—",

      boite: "—",

      prix: "—"

    };

    CARS.push(voiture);

  } else {

    voiture.possedee = true;

  }

  return voiture;
}


/* ============================================
   SAUVEGARDE
   ============================================ */

async function persisterVoiture(voiture) {

  try {

    const reponse =
      await fetch(
        `${API_BASE_URL}/ajouter-voiture`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(voiture)
        }
      );

    console.log(
      "💾 Sauvegarde voiture :",
      reponse.status
    );

  } catch (error) {

    console.error(
      "Erreur de sauvegarde de la voiture :",
      error
    );

  }

}


/* ============================================
   TABLE DES AVANTAGES DE CATÉGORIE
   ============================================ */

const AVANTAGES = {
  Hypercar: "Supercar",
  Supercar: "Sport",
  Sport: "SUV",
  SUV: "Daily",
  Daily: "Hypercar"
};

const BONUS_AVANTAGE = 3;
const PV_DEPART = 50;


/* ============================================
   ÉTAT DU DUEL
   ============================================ */

const duelState = {
  pvJoueur: PV_DEPART,
  pvAdversaire: PV_DEPART,
  voitureChoisie: null,
  terminé: false
};

let GARAGE_ADVERSAIRE = [];


/* ============================================
   CHARGEMENT DES VOITURES
   ============================================ */

async function chargerCars() {

  const res =
    await fetch("cars.json");

  CARS =
    await res.json();

  CARS.forEach(c => {

    if (c.possedee === undefined) {
      c.possedee = false;
    }

    if (c.favori === undefined) {
      c.favori = false;
    }

    if (c.objectif === undefined) {
      c.objectif = false;
    }

    if (c.moteur === undefined) {
      c.moteur = "—";
    }

    if (c.chevaux === undefined) {
      c.chevaux = "—";
    }

    if (c.boite === undefined) {
      c.boite = "—";
    }

    if (c.prix === undefined) {
      c.prix = "—";
    }

  });

}


/* ============================================
   NAVIGATION ENTRE ÉCRANS
   ============================================ */

function afficherVue(nomVue) {

  if (nomVue !== "photo") {
    stopCamera();
  }

  document
    .querySelectorAll(".view")
    .forEach(v => {
      v.hidden =
        v.dataset.view !== nomVue;
    });

  document
    .querySelectorAll(".nav-btn")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.nav === nomVue
      );

    });

  document.getElementById(
    "appHeader"
  ).style.display =
    nomVue === "accueil"
      ? "none"
      : "flex";

  if (nomVue === "collection") {
    afficherCollection();
  }

  if (nomVue === "duel") {
    afficherDuel();
  }

  if (nomVue === "quetes") {
    afficherQuetes();
  }

  if (nomVue === "profil") {
    afficherProfil();
  }

  if (nomVue === "galerie") {
    afficherGalerie();
  }

  if (nomVue === "amis") {
    afficherAmis();
  }

  if (nomVue === "accueil") {
    afficherAccueil();
  }

  if (nomVue === "photo") {
    startCamera();
  }

  window.scrollTo(0, 0);
}


function initNavigation() {

  document
    .querySelectorAll("[data-nav]")
    .forEach(el => {

      el.addEventListener(
        "click",
        () => {
          afficherVue(
            el.dataset.nav
          );
        }
      );

    });

}


/* ============================================
   ACCUEIL
   ============================================ */

let indexCarrousel = 0;

function afficherAccueil() {

  document.getElementById(
    "amisCount"
  ).textContent =
    "0 connecté";

  rendreCarrousel();

  document.getElementById(
    "carouselNext"
  ).onclick = () => {

    indexCarrousel =
      (indexCarrousel + 1)
      % CARS.length;

    rendreCarrousel();
  };

}

function rendreCarrousel() {

  const zone =
    document.getElementById(
      "carCarousel"
    );

  zone
    .querySelectorAll(
      ".carousel-circle"
    )
    .forEach(
      el => el.remove()
    );

  if (CARS.length === 0) {
    return;
  }

  const gauche =
    CARS[
      (
        indexCarrousel - 1
        + CARS.length
      )
      % CARS.length
    ];

  const centre =
    CARS[indexCarrousel];

  const droite =
    CARS[
      (
        indexCarrousel + 1
      )
      % CARS.length
    ];

  const bouton =
    document.getElementById(
      "carouselNext"
    );

  [
    [gauche, "pos-0"],
    [centre, "pos-1"],
    [droite, "pos-2"]
  ].forEach(
    ([voiture, classe]) => {

      const cercle =
        document.createElement(
          "div"
        );

      cercle.className =
        `carousel-circle ${classe}`;

      cercle.textContent =
        `${voiture.marque} ${voiture.modele}`;

      zone.insertBefore(
        cercle,
        bouton
      );

    }
  );

}


/* ============================================
   GALERIE
   ============================================ */

function afficherGalerie() {

  document.getElementById(
    "galleryGrid"
  ).innerHTML = `
    <div class="gallery-empty">
      Aucune photo pour l'instant.
      <br>
      Scanne une voiture pour commencer ta galerie.
    </div>
  `;

}


/* ============================================
   AMIS
   ============================================ */

function afficherAmis() {

  document.getElementById(
    "friendList"
  ).innerHTML = `
    <li style="color:var(--paper-dim);">
      Aucun ami ajouté pour l'instant.
    </li>
  `;

}


/* ============================================
   COLLECTION
   ============================================ */

function categoriesDisponibles() {

  return [
    ...new Set(
      CARS.map(c =>
        c.categorie
      )
    )
  ];

}

function peuplerFiltreCategorie() {

  const select =
    document.getElementById(
      "filterCategorie"
    );

  if (!select) {
    return;
  }

  const valeurActuelle =
    select.value;

  select.innerHTML =
    `<option value="">
      Toutes catégories
    </option>`
    +
    categoriesDisponibles()
      .map(
        cat =>
          `<option value="${cat}">
            ${cat}
          </option>`
      )
      .join("");

  select.value =
    valeurActuelle;
}

let filtreFavorisActif =
  false;

let filtrePossession =
  "toutes";

const ETATS_POSSESSION = [
  "toutes",
  "possedees",
  "non-possedee"
];

const LIBELLES_POSSESSION = {

  toutes:
    "Toutes",

  possedees:
    "Possédées",

  "non-possedee":
    "Non possédées"

};

function afficherCollection() {

  const grid =
    document.getElementById(
      "collectionGrid"
    );

  const rechercheEl =
    document.getElementById(
      "searchCar"
    );

  const categorieEl =
    document.getElementById(
      "filterCategorie"
    );

  const possessionBtn =
    document.getElementById(
      "filterPossedee"
    );

  const favorisBtn =
    document.getElementById(
      "filterFavoris"
    );

  peuplerFiltreCategorie();

  function render() {

    const texte =
      (
        rechercheEl?.value
        || ""
      )
      .toLowerCase();

    const categorie =
      categorieEl?.value
      || "";

    const filtré =
      CARS.filter(c => {

        const matchTexte =
          `${c.marque} ${c.modele}`
          .toLowerCase()
          .includes(texte);

        const matchCategorie =
          !categorie
          ||
          c.categorie ===
            categorie;

        const matchPossession =
          filtrePossession === "toutes"
          ||
          (
            filtrePossession ===
              "possedees"
              ? c.possedee
              : !c.possedee
          );

        const matchFavoris =
          !filtreFavorisActif
          ||
          c.favori;

        return (
          matchTexte
          &&
          matchCategorie
          &&
          matchPossession
          &&
          matchFavoris
        );

      });

    grid.innerHTML =
      filtré.length
        ? filtré
            .map(
              carteVoitureHTML
            )
            .join("")
        : `
          <p class="collection-empty">
            Aucune voiture ne correspond
            à ces filtres.
          </p>
        `;

    grid
      .querySelectorAll(
        ".car-card"
      )
      .forEach(card => {

        card.addEventListener(
          "click",
          () =>
            ouvrirFicheVoiture(
              card.dataset.id
            )
        );

      });

  }

  render();

  rechercheEl.oninput =
    render;

  if (categorieEl) {
    categorieEl.onchange =
      render;
  }

  if (possessionBtn) {

    possessionBtn.textContent =
      LIBELLES_POSSESSION[
        filtrePossession
      ];

    possessionBtn.dataset.etat =
      filtrePossession;

    possessionBtn.classList.toggle(
      "active",
      filtrePossession !== "toutes"
    );

    possessionBtn.setAttribute(
      "aria-pressed",
      filtrePossession !== "toutes"
    );

    possessionBtn.onclick = () => {

      const index =
        ETATS_POSSESSION.indexOf(
          filtrePossession
        );

      filtrePossession =
        ETATS_POSSESSION[
          (index + 1)
          %
          ETATS_POSSESSION.length
        ];

      possessionBtn.textContent =
        LIBELLES_POSSESSION[
          filtrePossession
        ];

      possessionBtn.dataset.etat =
        filtrePossession;

      possessionBtn.classList.toggle(
        "active",
        filtrePossession !== "toutes"
      );

      possessionBtn.setAttribute(
        "aria-pressed",
        filtrePossession !== "toutes"
      );

      render();
    };
  }

  if (favorisBtn) {

    favorisBtn.classList.toggle(
      "active",
      filtreFavorisActif
    );

    favorisBtn.onclick = () => {

      filtreFavorisActif =
        !filtreFavorisActif;

      favorisBtn.classList.toggle(
        "active",
        filtreFavorisActif
      );

      render();
    };

  }

}


/* ============================================
   CARTE VOITURE
   ============================================ */

function carteVoitureHTML(c) {

  const classesLocked =
    c.possedee
      ? ""
      : " car-card-locked";

  const nomAffiché =
    c.possedee
      ? `${c.marque} ${c.modele}`
      : "???";

  const icone =
    c.favori
      ? " ★"
      :
      (
        c.objectif
          ? " 🎯"
          : ""
      );

  return `

    <div
      class="car-card${classesLocked}"
      data-id="${c.id}"
    >

      <div class="car-card-cat">
        ${c.categorie}
      </div>

      <div class="car-card-name">
        ${nomAffiché}${icone}
      </div>

      <div class="car-card-year">
        ${
          c.possedee
            ? c.annee
            : ""
        }
      </div>

      <div class="car-card-points">
        ${
          c.possedee
            ? c.points + " pts"
            : ""
        }
      </div>

    </div>

  `;

}


/* ============================================
   FICHE VOITURE
   ============================================ */

let ficheVoitureId = null;

function ouvrirFicheVoiture(id) {

  const c =
    CARS.find(
      v =>
        v.id === id
    );

  if (!c) {
    return;
  }

  ficheVoitureId =
    id;

  document.getElementById(
    "ficheCategorie"
  ).textContent =
    c.categorie;

  document.getElementById(
    "ficheNom"
  ).textContent =
    c.possedee
      ? `${c.marque} ${c.modele}`
      : "Voiture non identifiée";

  document.getElementById(
    "ficheAnnee"
  ).textContent =
    c.annee;

  document.getElementById(
    "ficheMoteur"
  ).textContent =
    c.moteur;

  document.getElementById(
    "ficheChevaux"
  ).textContent =
    c.chevaux;

  document.getElementById(
    "ficheBoite"
  ).textContent =
    c.boite;

  document.getElementById(
    "fichePrix"
  ).textContent =
    c.prix;

  majBoutonFiche(c);

  document.getElementById(
    "ficheModal"
  ).hidden =
    false;

}

function majBoutonFiche(c) {

  const bouton =
    document.getElementById(
      "ficheAction"
    );

  if (c.possedee) {

    bouton.textContent =
      c.favori
        ? "★"
        : "☆";

    bouton.title =
      c.favori
        ? "Retirer des favoris"
        : "Mettre en favori";

  } else {

    bouton.textContent =
      c.objectif
        ? "🎯"
        : "＋";

    bouton.title =
      c.objectif
        ? "Retirer des objectifs"
        : "Mettre en objectif";

  }

}

function fermerFiche() {

  document.getElementById(
    "ficheModal"
  ).hidden =
    true;

  ficheVoitureId =
    null;

}

function toggleActionFiche() {

  const c =
    CARS.find(
      v =>
        v.id ===
        ficheVoitureId
    );

  if (!c) {
    return;
  }

  if (c.possedee) {
    c.favori =
      !c.favori;
  } else {
    c.objectif =
      !c.objectif;
  }

  majBoutonFiche(c);

  afficherCollection();

}

function initFicheVoiture() {

  document.getElementById(
    "ficheClose"
  ).addEventListener(
    "click",
    fermerFiche
  );

  document.getElementById(
    "ficheAction"
  ).addEventListener(
    "click",
    toggleActionFiche
  );

}


/* ============================================
   QUÊTES
   ============================================ */

const QUETES_TEST = [

  {
    nom: "Scanner 3 voitures",
    points: 10
  },

  {
    nom: "Gagner 1 duel",
    points: 15
  },

  {
    nom: "Ajouter 1 ami",
    points: 5
  },

  {
    nom: "Scanner une Hypercar",
    points: 20
  },

  {
    nom: "Visiter la collection 3 fois",
    points: 5
  }

];

function afficherQuetes() {

  document.getElementById(
    "questList"
  ).innerHTML =
    QUETES_TEST
      .map(
        q => `

        <li class="quest-item">

          <span class="quest-name">
            ${q.nom}
          </span>

          <span class="quest-points">
            +${q.points}
          </span>

        </li>

      `
      )
      .join("");

}


/* ============================================
   PROFIL
   ============================================ */

function afficherProfil() {

  const equipées =
    CARS
      .filter(
        c => c.possedee
      )
      .slice(0, 3);

  document.getElementById(
    "equippedGrid"
  ).innerHTML =
    equipées
      .map(
        carteVoitureHTML
      )
      .join("");

}


/* ============================================
   DUEL
   ============================================ */

function afficherDuel() {

  const possedees =
    CARS.filter(
      c => c.possedee
    );

  if (
    GARAGE_ADVERSAIRE.length === 0
  ) {

    GARAGE_ADVERSAIRE =
      [...possedees]
        .sort(
          () => 0.5 - Math.random()
        )
        .slice(0, 5);

  }

  majBarresPV();

  const garage =
    document.getElementById(
      "duelGarage"
    );

  garage.innerHTML =
    possedees
      .slice(0, 6)
      .map(
        c => `

        <button
          class="duel-car"
          data-id="${c.id}"
        >

          <div class="car-card-cat">
            ${c.categorie}
          </div>

          <div class="car-card-name">
            ${c.marque}
            ${c.modele}
          </div>

          <div class="car-card-points">
            ${c.points} pts
          </div>

        </button>

      `
      )
      .join("");

  garage
    .querySelectorAll(
      ".duel-car"
    )
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          garage
            .querySelectorAll(
              ".duel-car"
            )
            .forEach(
              b =>
                b.classList.remove(
                  "selected"
                )
            );

          btn.classList.add(
            "selected"
          );

          duelState.voitureChoisie =
            CARS.find(
              c =>
                c.id ===
                btn.dataset.id
            );

          document.getElementById(
            "btnMiser"
          ).disabled =
            false;

        }
      );

    });

  document.getElementById(
    "btnMiser"
  ).onclick =
    jouerRoundDuel;

}

function majBarresPV() {

  document.getElementById(
    "pvPlayerValue"
  ).textContent =
    duelState.pvJoueur;

  document.getElementById(
    "pvEnemyValue"
  ).textContent =
    duelState.pvAdversaire;

  document.getElementById(
    "pvPlayer"
  ).style.width =
    `${
      (
        duelState.pvJoueur
        /
        PV_DEPART
      )
      * 100
    }%`;

  document.getElementById(
    "pvEnemy"
  ).style.width =
    `${
      (
        duelState.pvAdversaire
        /
        PV_DEPART
      )
      * 100
    }%`;

}

function ajouterLogDuel(
  texte,
  type
) {

  const log =
    document.getElementById(
      "duelLog"
    );

  const entry =
    document.createElement(
      "div"
    );

  entry.className =
    `duel-log-entry ${
      type || ""
    }`;

  entry.textContent =
    texte;

  log.prepend(
    entry
  );

}

function scoreAvecAvantage(
  voiture,
  voitureAdverse
) {

  let score =
    voiture.points;

  if (
    AVANTAGES[
      voiture.categorie
    ]
    ===
    voitureAdverse.categorie
  ) {

    score +=
      BONUS_AVANTAGE;

  }

  return score;

}

function jouerRoundDuel() {

  if (
    duelState.terminé
    ||
    !duelState.voitureChoisie
  ) {
    return;
  }

  const voitureJoueur =
    duelState.voitureChoisie;

  const voitureAdversaire =
    GARAGE_ADVERSAIRE[
      Math.floor(
        Math.random()
        *
        GARAGE_ADVERSAIRE.length
      )
    ];

  const scoreJoueur =
    scoreAvecAvantage(
      voitureJoueur,
      voitureAdversaire
    );

  const scoreAdversaire =
    scoreAvecAvantage(
      voitureAdversaire,
      voitureJoueur
    );

  const ecart =
    Math.abs(
      scoreJoueur
      -
      scoreAdversaire
    );

  let resultatTexte =
    `${voitureJoueur.marque}
    ${voitureJoueur.modele}
    (${scoreJoueur} pts)
    vs
    ${voitureAdversaire.marque}
    ${voitureAdversaire.modele}
    (${scoreAdversaire} pts)
    — `;

  if (
    scoreJoueur
    >
    scoreAdversaire
  ) {

    duelState.pvAdversaire =
      Math.max(
        0,
        duelState.pvAdversaire
        -
        ecart
      );

    resultatTexte +=
      `l'adversaire perd ${ecart} PV`;

    ajouterLogDuel(
      resultatTexte,
      "win"
    );

  } else if (
    scoreAdversaire
    >
    scoreJoueur
  ) {

    duelState.pvJoueur =
      Math.max(
        0,
        duelState.pvJoueur
        -
        ecart
      );

    resultatTexte +=
      `tu perds ${ecart} PV`;

    ajouterLogDuel(
      resultatTexte,
      "loss"
    );

  } else {

    resultatTexte +=
      "égalité, aucun dégât";

    ajouterLogDuel(
      resultatTexte
    );

  }

  majBarresPV();

  duelState.voitureChoisie =
    null;

  document.getElementById(
    "btnMiser"
  ).disabled =
    true;

  document
    .querySelectorAll(
      ".duel-car"
    )
    .forEach(
      b =>
        b.classList.remove(
          "selected"
        )
    );

  if (
    duelState.pvJoueur === 0
    ||
    duelState.pvAdversaire === 0
  ) {

    duelState.terminé =
      true;

    const vainqueur =
      duelState.pvJoueur === 0
        ? "L'adversaire remporte le duel."
        : "Tu remportes le duel !";

    ajouterLogDuel(
      vainqueur,
      duelState.pvJoueur === 0
        ? "loss"
        : "win"
    );

  }

}


/* ============================================
   INITIALISATION
   ============================================ */

(async function init() {

  await chargerCars();

  initNavigation();

  initFicheVoiture();

  initCamera();

  afficherVue(
    "accueil"
  );

})();