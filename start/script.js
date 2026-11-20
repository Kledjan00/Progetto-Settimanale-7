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

// fetch + controllo di ok + JSON. Col signal la richiesta si può annullare
async function getJSON(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Cerca le squadre per nome. Se non trova niente teams è null
async function cercaSquadre(query, signal) {
  const url = new URL("searchteams.php", API_URL);
  url.searchParams.set("t", query);

  const dati = await getJSON(url, signal);
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


// === Preferiti (localStorage) ===

// Il nome sotto cui li salvo nel localStorage
const CHIAVE_PREFERITI = "sportshub-preferiti";

function salvaPreferiti() {
  localStorage.setItem(CHIAVE_PREFERITI, JSON.stringify(preferiti));
}

// Se non c'è ancora niente salvato getItem dà null, quindi parto da "[]".
// Squadra non ha metodi, quindi gli oggetti letti dal JSON vanno già bene
function caricaPreferiti() {
  return JSON.parse(localStorage.getItem(CHIAVE_PREFERITI) ?? "[]");
}

// true se la squadra è già tra i preferiti
function inPreferiti(id) {
  return preferiti.some((s) => s.id === id);
}


// === Stato ===

// Le squadre dell'ultima ricerca, per ritrovarle al click sulla card
let squadre = [];

// Le squadre preferite, lette dal localStorage appena si apre la pagina
let preferiti = caricaPreferiti();

// La squadra aperta nei dettagli, per sapere cosa aggiungere ai preferiti
let squadraAperta = null;

// Il timer del debounce, per poterlo cancellare a ogni tasto
let timeoutId;

// L'ultima ricerca partita, per poterla annullare se ne parte un'altra
let controller;


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

// La card di una squadra: logo, nome, campionato e paese.
// La uso sia per le squadre trovate che per i preferiti
function creaCard(s) {
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

  // Colonne di Bootstrap: 1 card per riga sul telefono, 2 sul tablet, 3 su desktop
  const colonna = crea("div", "col-12 col-md-6 col-xl-4");
  colonna.append(card);
  return colonna;
}

// Le card delle squadre trovate
function renderSquadre() {
  const lista = document.getElementById("lista-squadre");

  if (squadre.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessuna squadra trovata."));
    return;
  }

  lista.replaceChildren(...squadre.map((s) => creaCard(s)));
}

// Le card dei preferiti, oppure un messaggio se non ce ne sono
function renderPreferiti() {
  const lista = document.getElementById("lista-preferiti");

  if (preferiti.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessun preferito: apri una squadra e premi '☆ Aggiungi ai preferiti'."));
    return;
  }

  lista.replaceChildren(...preferiti.map((s) => creaCard(s)));
}

// Il bottone cambia se la squadra è già tra i preferiti
function aggiornaBottonePreferito() {
  const bottone = document.getElementById("btn-preferito");

  if (inPreferiti(squadraAperta.id)) {
    bottone.textContent = "★ Rimuovi dai preferiti";
    bottone.className = "btn btn-warning fw-bold";
  } else {
    bottone.textContent = "☆ Aggiungi ai preferiti";
    bottone.className = "btn btn-outline-dark fw-bold";
  }
}

// Una lista di partite: data sopra, "casa vs trasferta" e punteggio sotto
function renderEventi(idLista, eventi, testoVuoto) {
  const ul = document.getElementById(idLista);

  if (eventi.length === 0) {
    ul.replaceChildren(crea("li", "list-group-item px-0 fst-italic", testoVuoto));
    return;
  }

  const righe = eventi.map((e) => {
    const partita = crea("div", "fw-bold", `${e.casa} vs ${e.trasferta}`);

    // Il punteggio nel badge verde, solo se la partita è già giocata
    if (e.punteggio()) partita.append(crea("span", "badge bg-success fw-normal ms-2", e.punteggio()));

    const li = crea("li", "list-group-item px-0");
    li.append(crea("div", "small text-secondary", e.dataFormattata()), partita);
    return li;
  });

  ul.replaceChildren(...righe);
}

function renderDettagli(squadra, prossimi, ultimi) {
  squadraAperta = squadra;
  document.getElementById("nome-squadra").textContent = squadra.nome;
  aggiornaBottonePreferito();
  renderEventi("prossimi-eventi", prossimi, "Nessun evento in programma");
  renderEventi("ultimi-risultati", ultimi, "Nessun risultato disponibile");
  document.getElementById("dettagli-section").hidden = false;
}


// === Eventi ===

// Chiede le squadre all'API e mostra le card
async function avviaRicerca(query) {
  // Se c'è ancora una ricerca in corso la annullo: conta solo l'ultima
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  // Nuova ricerca: i dettagli della squadra di prima spariscono
  document.getElementById("dettagli-section").hidden = true;
  mostraSpinner();

  try {
    squadre = await cercaSquadre(query, signal);
    renderSquadre();
  } catch (err) {
    // La ricerca annullata non è un vero errore: niente riquadro rosso
    if (err.name === "AbortError") return;
    mostraErrore("Impossibile completare la ricerca: " + err.message);
  } finally {
    // Lo spinner lo spegne solo l'ultima ricerca, non quella annullata
    if (!signal.aborted) nascondiSpinner();
  }
}

// 'Cerca' o Invio: la ricerca parte subito
document.getElementById("form-cerca").addEventListener("submit", (e) => {
  e.preventDefault();
  const query = document.getElementById("cerca").value.trim();
  if (!query) return;

  // Cerco adesso, quindi il timer del debounce non serve più
  clearTimeout(timeoutId);
  avviaRicerca(query);
});

// Debounce: mentre scrivi, la ricerca parte 400 ms dopo l'ultimo tasto
document.getElementById("cerca").addEventListener("input", (e) => {
  const query = e.target.value.trim();

  // A ogni tasto cancello il timer di prima e ne faccio partire uno nuovo
  clearTimeout(timeoutId);

  // Con meno di 3 lettere non cerco
  if (query.length < 3) return;

  timeoutId = setTimeout(() => avviaRicerca(query), 400);
});

// Click su una card: carica prossimi eventi e ultimi risultati di quella squadra
async function apriDettagli(e) {
  const card = e.target.closest(".card-squadra");
  if (!card) return;

  // La card può essere tra le squadre trovate o tra i preferiti
  const id = card.dataset.id;
  const squadra = squadre.find((s) => s.id === id) ?? preferiti.find((s) => s.id === id);
  mostraSpinner();

  try {
    const { prossimi, ultimi } = await caricaDettagli(squadra.id);
    renderDettagli(squadra, prossimi, ultimi);
  } catch (err) {
    mostraErrore("Impossibile caricare i dettagli: " + err.message);
  } finally {
    nascondiSpinner();
  }
}

// Funziona uguale sulle card della ricerca e su quelle dei preferiti
document.getElementById("lista-squadre").addEventListener("click", apriDettagli);
document.getElementById("lista-preferiti").addEventListener("click", apriDettagli);

// '☆ Aggiungi' o '★ Rimuovi': la squadra aperta entra o esce dai preferiti
document.getElementById("btn-preferito").addEventListener("click", () => {
  if (inPreferiti(squadraAperta.id)) {
    preferiti = preferiti.filter((s) => s.id !== squadraAperta.id);
  } else {
    preferiti.push(squadraAperta);
  }

  // Salvo la lista nuova: così una squadra tolta sparisce anche dal localStorage
  salvaPreferiti();
  renderPreferiti();
  aggiornaBottonePreferito();
});


// === Avvio ===

// I preferiti salvati compaiono appena si apre la pagina
renderPreferiti();