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