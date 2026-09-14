/* Undercover — couche réseau P2P (PeerJS) : salon, reconnexion, reprise de main. */
/* ============================================================================
   RÉSEAU
   ============================================================================ */
const NET = {
  peer: null, isHost: false, code: null,
  conns: new Map(),   // hôte : id joueur -> DataConnection
  hostConn: null,     // client : connexion vers l'hôte
  /* Jeton d'identité, posé à l'entrée dans un salon (voir jetonPour). */
  myToken: null,
};

/* ---------------------------------------------------------------------------
   IDENTITÉ — retrouver son siège
   Le jeton vivait dans le sessionStorage seul : il survivait à un rechargement,
   mais fermer l'onglet faisait perdre sa place, son rôle et son mot, et laissait
   dans la partie un fantôme injoignable. Deux niveaux, désormais :

     sessionStorage  uc_tok_<CODE>   l'onglet en cours — priorité absolue, c'est
                                     ce qui garde deux onglets bien distincts ;
     localStorage    uc_seat_<CODE>  le dernier siège occupé dans ce salon depuis
                                     ce navigateur — la bouée quand l'onglet a
                                     été fermé.

   L'hôte a le dernier mot : il renvoie dans « welcome » le jeton qu'il a retenu,
   et en forge un neuf si celui présenté appartient déjà à quelqu'un de connecté.
   Deux onglets ouverts en même temps ne peuvent donc pas se retrouver avec la
   même identité.
   --------------------------------------------------------------------------- */
const SIEGE_TTL = 12 * 3600 * 1000;
const nouveauJeton = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function jetonPour(code) {
  try { const s = sessionStorage.getItem('uc_tok_' + code); if (s) return s; } catch {}
  const sv = lsGet('uc_seat_' + code, null);
  if (sv && sv.token && Date.now() - (sv.ts || 0) < SIEGE_TTL) return sv.token;
  return nouveauJeton();
}

function retenirJeton(code, token) {
  NET.myToken = token;
  try { sessionStorage.setItem('uc_tok_' + code, token); } catch {}
  lsSet('uc_seat_' + code, { token, ts: Date.now() });
}

function setNetStatus(ok, txt) {
  $('#netDot').classList.toggle('off', !ok);
  $('#netTxt').textContent = txt;
}

function newPeer(id) {
  return new Promise((res, rej) => {
    const p = id ? new Peer(id) : new Peer();
    const to = setTimeout(() => rej(new Error('timeout')), 15000);
    p.on('open', () => { clearTimeout(to); res(p); });
    p.on('error', e => { clearTimeout(to); rej(e); });
  });
}

/* ---------- création de salon (hôte) ---------- */
/* Reprend le dossier interrompu : on réclame le même code, les joueurs suivent. */
async function reprendreRoom() {
  const sv = sauvegardeDispo();
  if (!sv) return false;
  for (let essai = 0; essai < 6; essai++) {
    try {
      NET.peer = await newPeer(PREFIX + sv.code);
      NET.isHost = true; NET.code = sv.code;
      retenirJeton(sv.code, sv.token);
      hookHostPeer();
      S = sv.etat;
      S.chat = S.chat || []; S.chatSeq = S.chatSeq || 0;   // sauvegarde d'avant le chat différentiel
      S.bannis = (S.bannis || []).map(b => typeof b === 'string' ? { token: b, name: 'Joueur exclu' } : b);
      S.players.forEach(p => { if (p.id !== HOST_ID) p.connected = false; });  // ils vont revenir
      demarrerSurveillance();
      enterGame();
      toast('Dossier ' + sv.code + ' repris — les joueurs se reconnectent');
      return true;
    } catch (e) {
      if (e && e.type === 'unavailable-id') { await new Promise(r => setTimeout(r, 1500)); continue; }
      throw e;
    }
  }
  return false;
}

async function createRoom(name) {
  oublierEtat();
  for (let tries = 0; tries < 6; tries++) {
    const code = Array.from({ length: 4 }, () => ALPHA[Math.random() * ALPHA.length | 0]).join('');
    try {
      NET.peer = await newPeer(PREFIX + code);
      NET.isHost = true; NET.code = code;
      retenirJeton(code, jetonPour(code));
      hookHostPeer();
      hostInit(name);
      enterGame();
      return;
    } catch (e) {
      if (e && e.type === 'unavailable-id') continue;      // code déjà pris, on retente
      throw e;
    }
  }
  throw new Error('no-code');
}

function hookHostPeer() {
  NET.peer.on('connection', conn => {
    conn.on('data', msg => onHostMessage(conn, msg));
    conn.on('close', () => {
      const pid = [...NET.conns].find(([, c]) => c === conn)?.[0];
      if (pid) { NET.conns.delete(pid); hostSetConnected(pid, false); }
    });
    conn.on('error', () => {});
  });
  NET.peer.on('error', e => {
    if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')
      setNetStatus(false, 'signal perdu');
  });
  NET.peer.on('disconnected', () => { setNetStatus(false, 'reconnexion…'); NET.peer.reconnect(); });
  NET.peer.on('open', () => setNetStatus(true, 'connecté'));
}

/* ---------- rejoindre (client) ---------- */
async function joinRoom(code, name) {
  NET.peer = await newPeer(null);
  NET.isHost = false; NET.code = code;
  NET.myToken = jetonPour(code);          // on tente de récupérer son siège
  const conn = NET.peer.connect(PREFIX + code, { reliable: true });
  NET.hostConn = conn;

  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('unreachable')), 15000);
    conn.on('open', () => { clearTimeout(to); res(); });
    NET.peer.on('error', e => { clearTimeout(to); rej(e); });
  });

  conn.on('data', msg => onClientMessage(msg));
  conn.on('close', () => reconnecter(name));
  send({ t: 'hello', name, token: NET.myToken });
  setInterval(() => { if (NET.hostConn && NET.hostConn.open) send({ t: 'ping' }); }, 3000);
  enterGame();
  setNetStatus(true, 'connecté');
}

/* Propose de prendre la relève, sans interrompre les tentatives de reconnexion :
   si l'hôte revient entre-temps, la bannière disparaît d'elle-même. */
function proposerReprise(name) {
  const b = $('#relance');
  if (!b.hidden) return;
  b.hidden = false;
  document.body.classList.add('relance');
  $('#btnRelance').onclick = async () => {
    if (!confirm('Reprendre la main ?\n\nLa manche en cours sera perdue (personne d\'autre que l\'ancien hôte ne connaît les rôles), mais le salon et les scores repartent intacts.')) return;
    b.hidden = true; document.body.classList.remove('relance');
    try {
      if (!await reprendreLaMain(name)) {
        b.hidden = false; document.body.classList.add('relance');
        toast('Reprise impossible : le code est encore occupé.');
      }
    } catch {
      b.hidden = false; document.body.classList.add('relance');
      toast('Reprise impossible.');
    }
  };
}

/* Reconnexion : l'hôte a peut-être juste rechargé sa page. On retente en
   boucle pendant trois minutes avant d'abandonner. */
let reconnexion = null;
async function reconnecter(name) {
  if (NET.isHost || reconnexion) return;
  setNetStatus(false, 'reconnexion…');
  const debut = Date.now();
  reconnexion = setInterval(async () => {
    const attente = Date.now() - debut;
    if (attente > 15000) proposerReprise(name);        // l'hôte tarde : on offre la main
    if (attente > 180000) {
      clearInterval(reconnexion); reconnexion = null;
      overlay('🔌', 'Salon fermé', "L'hôte n'est pas revenu et personne n'a repris la main.");
      return;
    }
    try {
      if (!NET.peer || NET.peer.destroyed) NET.peer = await newPeer(null);
      const conn = NET.peer.connect(PREFIX + NET.code, { reliable: true });
      await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('timeout')), 4000);
        conn.on('open', () => { clearTimeout(to); res(); });
        conn.on('error', e => { clearTimeout(to); rej(e); });
      });
      clearInterval(reconnexion); reconnexion = null;
      NET.hostConn = conn;
      conn.on('data', m => onClientMessage(m));
      conn.on('close', () => reconnecter(name));
      conn.send({ t: 'hello', name, token: NET.myToken });
      $('#relance').hidden = true;
      document.body.classList.remove('relance');
      setNetStatus(true, 'connecté');
      toast('Reconnecté au dossier');
    } catch {}
  }, 2500);
}

/* ---------------------------------------------------------------------------
   Reprise de la main. Si l'hôte ne revient pas, n'importe quel joueur peut
   relancer le salon sous le même code. La manche en cours est perdue — les
   rôles n'existaient que chez l'hôte, personne d'autre ne les connaît — mais
   le salon, les joueurs et les scores repartent intacts.
   --------------------------------------------------------------------------- */
let scoresRepris = null;

async function reprendreLaMain(name) {
  const code = NET.code;
  scoresRepris = {};
  (V && V.players || []).forEach(p => { if (p.score) scoresRepris[p.name] = p.score; });

  clearInterval(reconnexion); reconnexion = null;
  try { NET.hostConn && NET.hostConn.close(); } catch {}
  try { NET.peer && NET.peer.destroy(); } catch {}
  NET.peer = null; NET.hostConn = null;

  for (let essai = 0; essai < 8; essai++) {
    try {
      NET.peer = await newPeer(PREFIX + code);
      NET.isHost = true; NET.code = code;
      retenirJeton(code, NET.myToken || jetonPour(code));
      hookHostPeer();
      hostInit(name);
      enterGame();
      setNetStatus(true, 'connecté');
      toast('Tu es le nouvel hôte du dossier ' + code);
      return true;
    } catch (e) {
      if (e && e.type === 'unavailable-id') { await new Promise(r => setTimeout(r, 1500)); continue; }
      throw e;
    }
  }
  return false;
}

/* ---------- envoi ---------- */
function send(msg) {                       // client -> hôte (ou hôte -> lui-même)
  if (NET.isHost) onHostMessage(null, msg);
  else if (NET.hostConn && NET.hostConn.open) NET.hostConn.send(msg);
}
function sendTo(pid, msg) {                // hôte -> un joueur ; vrai si parti
  if (pid === HOST_ID) { onClientMessage(msg); return true; }
  const c = NET.conns.get(pid);
  if (c && c.open) { c.send(msg); return true; }
  return false;
}
function broadcastViews() {
  S.players.forEach(p => {
    /* Le curseur de chat n'avance qu'une fois la vue réellement partie. Si
       l'envoi échoue on le remet à zéro : le joueur recevra tout l'historique
       à son retour plutôt que de perdre les messages de son absence. */
    const partie = sendTo(p.id, { t: 'state', v: viewFor(p.id) });
    p.chatVu = partie ? S.chatSeq : 0;
  });
  sauverEtat();
}

/* ---------------------------------------------------------------------------
   Survie de l'hôte : l'état complet est écrit dans son navigateur à chaque
   diffusion. S'il recharge ou ferme par accident, il peut reprendre le même
   dossier ; les autres, qui retentent la connexion en boucle, reviennent seuls
   avec leur rôle intact.
   --------------------------------------------------------------------------- */
const SAUVEGARDE = 'uc_partie', SAUVEGARDE_TTL = 30 * 60 * 1000;
let dernierEnreg = 0, enregDiffere = null;

function ecrireEtat() {
  if (!NET.isHost || !S) return;
  dernierEnreg = Date.now();
  try {
    lsSet(SAUVEGARDE, {
      ts: dernierEnreg, code: S.code, token: NET.myToken,
      etat: { ...S, deadline: null },     // le minuteur repart à la reprise
    });
  } catch {}
}

/* Anti-rebond avec écriture finale garantie : sans elle, la dernière
   modification (celle qui compte) pouvait rester non sauvegardée. */
function sauverEtat() {
  if (!NET.isHost || !S) return;
  if (Date.now() - dernierEnreg >= 400) { clearTimeout(enregDiffere); enregDiffere = null; ecrireEtat(); return; }
  if (!enregDiffere) enregDiffere = setTimeout(() => { enregDiffere = null; ecrireEtat(); }, 400);
}
const oublierEtat = () => { try { localStorage.removeItem(SAUVEGARDE); } catch {} };

function sauvegardeDispo() {
  const sv = lsGet(SAUVEGARDE, null);
  if (!sv || !sv.etat || Date.now() - sv.ts > SAUVEGARDE_TTL) return null;
  if (sv.etat.phase === 'lobby' || sv.etat.phase === 'end') return null;   // rien à reprendre
  return sv;
}
