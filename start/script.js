// === Classi ===

// Una squadra con i miei nomi al posto di quelli dell'API
class Squadra {
  constructor(dati) {
    this.id = dati.idTeam;
    this.nome = dati.strTeam;
    this.logo = dati.strBadge;
    this.lega = dati.strLeague ?? "—";
    this.paese = dati.strCountry ?? "—";
    this.sport = dati.strSport; // Soccer, Basketball... serve per il filtro
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

    // Questi servono per la modale
    this.ora = dati.strTime;
    this.campionato = dati.strLeague;
    this.stagione = dati.strSeason;
    this.giornata = dati.intRound;
    this.stadio = dati.strVenue;
    this.paese = dati.strCountry;
    this.logoCasa = dati.strHomeTeamBadge;
    this.logoTrasferta = dati.strAwayTeamBadge;
    this.immagine = dati.strThumb;
  }

  // "2026-05-17" diventa "17/05/2026"
  dataFormattata() {
    const formato = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    return formato.format(new Date(this.data));
  }

  // L'API dà l'ora UTC: "17:30:00" diventa l'ora italiana, "18:30"
  oraFormattata() {
    if (!this.ora) return "";

    const quando = new Date(`${this.data}T${this.ora}Z`);
    if (isNaN(quando)) return this.ora.slice(0, 5); //se l'ora è scritta strana la lascio com'è

    const formato = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
    return formato.format(quando);
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

// Solo i prossimi eventi di una squadra: per l'agenda bastano questi,
// così all'avvio faccio metà delle richieste (la chiave gratuita ne permette poche)
async function caricaProssimi(idTeam) {
  const url = new URL("eventsnext.php", API_URL);
  url.searchParams.set("id", idTeam);

  const dati = await getJSON(url);
  return (dati.events ?? []).map((d) => new Evento(d));
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


// === Modalità scura (localStorage) ===

// Anche il tema me lo ricordo nel localStorage
const CHIAVE_TEMA = "sportshub-tema";

// Bootstrap cambia i colori da solo se su <html> c'è data-bs-theme="dark"
function applicaTema(tema) {
  document.documentElement.dataset.bsTheme = tema;
  document.getElementById("btn-tema").textContent = tema === "dark" ? "☀️ Modalità chiara" : "🌙 Modalità scura";
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

// Le prossime partite già caricate, una lista per ogni squadra (la chiave è l'id)
const prossimiPerSquadra = {};

// Lo sport scelto nel filtro: "Tutti" vuol dire nessun filtro
let filtroSport = "Tutti";

// Le partite mostrate nelle liste, per ritrovarle al click 
const eventiMostrati = {};


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

// true se la squadra è dello sport scelto nel filtro
function passaFiltro(s) {
  return filtroSport === "Tutti" || s.sport === filtroSport;
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

  // Solo quelle dello sport scelto
  const visibili = squadre.filter((s) => passaFiltro(s));

  if (visibili.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessuna squadra di questo sport."));
    return;
  }

  lista.replaceChildren(...visibili.map((s) => creaCard(s)));
}

// Le card dei preferiti, oppure un messaggio se non ce ne sono
function renderPreferiti() {
  const lista = document.getElementById("lista-preferiti");

  if (preferiti.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessun preferito: apri una squadra e premi '☆ Aggiungi ai preferiti'."));
    return;
  }

  // Solo quelli dello sport scelto
  const visibili = preferiti.filter((s) => passaFiltro(s));

  if (visibili.length === 0) {
    lista.replaceChildren(crea("p", "text-secondary fst-italic mb-0", "Nessun preferito di questo sport."));
    return;
  }

  lista.replaceChildren(...visibili.map((s) => creaCard(s)));
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

    const li = crea("li", "list-group-item px-2 evento");
    li.append(crea("div", "small text-secondary", e.dataFormattata()), partita);

    // Me la segno per ritrovarla al click. Con data-bs-toggle e data-bs-target
    // la modale la apre Bootstrap da solo
    eventiMostrati[e.id] = e;
    li.dataset.id = e.id;
    li.dataset.bsToggle = "modal";
    li.dataset.bsTarget = "#modale-evento";
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

// Le prossime partite di tutti i preferiti in una lista sola, dalla più vicina
function renderAgenda() {
  const eventi = [];

  // Anche qui vale il filtro per sport
  for (const s of preferiti.filter((s) => passaFiltro(s))) {
    for (const e of prossimiPerSquadra[s.id] ?? []) {
      // Se due preferiti giocano tra loro, la partita la metto una volta sola
      if (!eventi.some((x) => x.id === e.id)) eventi.push(e);
    }
  }

  // In ordine di data: la più vicina sopra
  eventi.sort((a, b) => new Date(a.data) - new Date(b.data));

  const testoVuoto = preferiti.length === 0
    ? "Aggiungi una squadra ai preferiti per vedere le sue prossime partite."
    : "Nessuna partita in programma.";

  renderEventi("agenda", eventi, testoVuoto);
}

// Una squadra nella modale: logo sopra e nome sotto
function creaSquadraModale(logo, nome) {
  const box = crea("div", "squadra-modale d-flex flex-column align-items-center gap-2");

  if (logo) {
    const img = document.createElement("img");
    img.src = logo;
    img.alt = nome;
    img.className = "logo-piccolo";
    box.append(img);
  }

  box.append(crea("span", "small fw-bold", nome));
  return box;
}

// Riempie la modale con i dati della partita cliccata
function renderModale(ev) {
  document.getElementById("titolo-evento").textContent = `${ev.casa} vs ${ev.trasferta}`;

  const corpo = document.getElementById("corpo-evento");
  corpo.replaceChildren(); //via la partita di prima

  // In alto l'immagine della partita, se l'API ce l'ha
  if (ev.immagine) {
    const img = document.createElement("img");
    img.src = ev.immagine;
    img.alt = `${ev.casa} vs ${ev.trasferta}`;
    img.className = "img-fluid rounded mb-3";
    corpo.append(img);
  }

  // Le due squadre una accanto all'altra, col punteggio in mezzo ("vs" se si deve ancora giocare)
  const sfida = crea("div", "d-flex justify-content-between align-items-center text-center mb-3");
  sfida.append(
    creaSquadraModale(ev.logoCasa, ev.casa),
    crea("div", "fs-3 fw-bold px-2", ev.punteggio() || "vs"),
    creaSquadraModale(ev.logoTrasferta, ev.trasferta),
  );

  // Sotto, le informazioni una per riga: il nome a sinistra e il valore a destra
  const info = crea("ul", "list-group list-group-flush");
  const righe = [
    ["Stato", ev.punteggio() ? "Finita" : "Da giocare"],
    ["Data", ev.dataFormattata()],
    ["Ora", ev.oraFormattata()],
    ["Campionato", ev.campionato],
    ["Stagione", ev.stagione],
    ["Giornata", ev.giornata],
    ["Stadio", ev.stadio],
    ["Paese", ev.paese],
  ];

  for (const [nome, valore] of righe) {
    // Quello che l'API non ha lo salto
    if (!valore) continue;

    const li = crea("li", "list-group-item d-flex justify-content-between gap-3 px-0");
    li.append(crea("span", "text-secondary", nome), crea("span", "fw-bold text-end", valore));
    info.append(li);
  }

  corpo.append(sfida, info);
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

    // Me le tengo: se la squadra va nei preferiti, finiscono nell'agenda senza richiederle
    prossimiPerSquadra[squadra.id] = prossimi;

    renderDettagli(squadra, prossimi, ultimi);

    // Se ho cliccato un preferito in fondo alla pagina, salgo fino ai dettagli
    document.getElementById("dettagli-section").scrollIntoView({ behavior: "smooth" });
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
  renderAgenda();
  aggiornaBottonePreferito();
});

// Filtro per sport: il bottone scelto diventa blu e le card si filtrano
document.getElementById("filtro-sport").addEventListener("click", (e) => {
  const bottone = e.target.closest("button[data-sport]");
  if (!bottone) return;

  filtroSport = bottone.dataset.sport;

  // Blu solo quello scelto, gli altri grigi
  for (const b of document.getElementById("filtro-sport").children) {
    b.className = b === bottone
      ? "btn btn-primary rounded-pill px-3"
      : "btn btn-outline-secondary rounded-pill px-3";
  }

  renderPreferiti();
  renderAgenda();

  // Le card della ricerca le ridisegno solo se una ricerca c'è già stata
  if (squadre.length > 0) renderSquadre();
});

// Click su una partita: prima riempio la modale, poi Bootstrap la apre
function apriEvento(e) {
  const li = e.target.closest(".evento");
  if (!li) return;

  renderModale(eventiMostrati[li.dataset.id]);
}

// Vale per i prossimi eventi, gli ultimi risultati e l'agenda
document.getElementById("prossimi-eventi").addEventListener("click", apriEvento);
document.getElementById("ultimi-risultati").addEventListener("click", apriEvento);
document.getElementById("agenda").addEventListener("click", apriEvento);

// '🌙 Modalità scura' o '☀️ Modalità chiara': cambia il tema
document.getElementById("btn-tema").addEventListener("click", () => {
  const nuovo = document.documentElement.dataset.bsTheme === "dark" ? "light" : "dark";
  applicaTema(nuovo);

  // Me lo ricordo per la prossima volta che si apre la pagina
  localStorage.setItem(CHIAVE_TEMA, nuovo);
});


// === Avvio ===

// All'avvio carico le partite di tutti i preferiti insieme. Con allSettled
// se una squadra va in errore le altre si vedono lo stesso
async function caricaAgenda() {
  if (preferiti.length === 0) {
    renderAgenda();
    return;
  }

  document.getElementById("spinner-agenda").hidden = false;

  const risultati = await Promise.allSettled(preferiti.map((s) => caricaProssimi(s.id)));
  const nonCaricate = [];

  // risultati[i] è la risposta di preferiti[i]: "fulfilled" se è andata bene
  risultati.forEach((r, i) => {
    const squadra = preferiti[i];

    if (r.status === "fulfilled") {
      prossimiPerSquadra[squadra.id] = r.value;
    } else {
      nonCaricate.push(squadra.nome);
    }
  });

  document.getElementById("spinner-agenda").hidden = true;

  if (nonCaricate.length > 0) {
    const el = document.getElementById("errore-agenda");
    el.textContent = "Non sono riuscito a caricare le partite di: " + nonCaricate.join(", ");
    el.hidden = false;
  }

  renderAgenda();
}

// Il tema scelto l'ultima volta (la prima volta è quello chiaro)
applicaTema(localStorage.getItem(CHIAVE_TEMA) ?? "light");

// I preferiti salvati compaiono appena si apre la pagina, poi arrivano le loro partite
renderPreferiti();
caricaAgenda();