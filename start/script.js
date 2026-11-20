// === Classi ===

// Una squadra con i miei nomi al posto di quelli dell'API
class Squadra {
  constructor(dati) {
    this.id = dati.idTeam;
    this.nome = dati.strTeam;
    this.logo = dati.strBadge;
    this.lega = dati.strLeague ?? "—";
    this.paese = dati.strCountry ?? "—";
  }
}

// Una partita: data, chi gioca in casa, chi in trasferta e il punteggio
class Evento {
  constructor(dati) {
    this.id = dati.idEvent;
    this.data = dati.dateEvent;
    this.casa = dati.strHomeTeam;
    this.trasferta = dati.strAwayTeam;
    this.punteggioCasa = dati.intHomeScore;
    this.punteggioTrasferta = dati.intAwayScore;
  }

  // "2026-05-17" diventa "17/05/2026"
  dataFormattata() {
    const formato = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    return formato.format(new Date(this.data));
  }

  // "3 – 1", oppure niente se la partita non è ancora giocata
  punteggio() {
    if (!this.punteggioCasa || !this.punteggioTrasferta) return "";
    return `${this.punteggioCasa} – ${this.punteggioTrasferta}`;
  }
}


// === API ===

// La chiave 3 gratuita
const API_URL = "https://www.thesportsdb.com/api/v1/json/123/";

// fetch + controllo di ok + JSON
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Cerca le squadre per nome. Se non trova niente teams è null
async function cercaSquadre(query) {
  const url = new URL("searchteams.php", API_URL);
  url.searchParams.set("t", query);

  const dati = await getJSON(url);
  return (dati.teams ?? []).map((d) => new Squadra(d));
}

// Prossimi eventi e ultimi risultati insieme, con Promise.all
async function caricaDettagli(idTeam) {
  const urlProssimi = new URL("eventsnext.php", API_URL);
  urlProssimi.searchParams.set("id", idTeam);

  const urlUltimi = new URL("eventslast.php", API_URL);
  urlUltimi.searchParams.set("id", idTeam);

  const [prossimi, ultimi] = await Promise.all([getJSON(urlProssimi), getJSON(urlUltimi)]);

  // I prossimi stanno in events, gli ultimi in results
  return {
    prossimi: (prossimi.events ?? []).map((d) => new Evento(d)),
    ultimi: (ultimi.results ?? []).map((d) => new Evento(d)),
  };
}


// === Stato ===

// Le squadre dell'ultima ricerca, per ritrovarle al click sulla card
let squadre = [];


// === Render ===

// Crea un elemento con classe e testo
function crea(tag, classe, testo) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined) el.textContent = testo;
  return el;
}

function mostraSpinner() {
  document.getElementById("spinner").hidden = false;
  document.getElementById("errore").hidden = true;
}

function nascondiSpinner() {
  document.getElementById("spinner").hidden = true;
}

function mostraErrore(msg) {
  const el = document.getElementById("errore");
  el.textContent = msg;
  el.hidden = false;
}

// Una card per ogni squadra: logo, nome, campionato e paese
function renderSquadre() {
  const lista = document.getElementById("lista-squadre");

  if (squadre.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessuna squadra trovata."));
    return;
  }

  const colonne = squadre.map((s) => {
    const card = crea("div", "card card-squadra h-100 border-0 shadow-sm text-center p-3");
    card.dataset.id = s.id;

    // Qualche squadra non ha il logo
    if (s.logo) {
      const img = document.createElement("img");
      img.src = s.logo;
      img.alt = s.nome;
      img.className = "logo mx-auto";
      card.append(img);
    }

    card.append(
      crea("h3", "h6 fw-bold mt-3 mb-1", s.nome),
      crea("p", "small text-secondary mb-0", s.lega),
      crea("p", "small text-secondary mb-0", s.paese),
    );

    // Una colonna di Bootstrap per ogni card
    const colonna = crea("div", "col-12");
    colonna.append(card);
    return colonna;
  });

  lista.replaceChildren(...colonne);
}


// === Eventi ===

// 'Cerca': chiede le squadre all'API e mostra le card
document.getElementById("form-cerca").addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = document.getElementById("cerca").value.trim();
  if (!query) return;

  mostraSpinner();

  try {
    squadre = await cercaSquadre(query);
    renderSquadre();
  } catch (err) {
    mostraErrore("Impossibile completare la ricerca: " + err.message);
  } finally {
    nascondiSpinner();
  }
});