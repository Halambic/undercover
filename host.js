/* Undercover — rôle d'hôte : état de la partie, messages reçus, déroulé.
   Les décisions de jeu, elles, vivent dans rules.js. */
/* ============================================================================
   ÉTAT DE PARTIE (hôte uniquement)
   phases : lobby | clue | vote | reveal | guess | end
   ============================================================================ */
const HOST_ID = 'host';
const ROLE = {
  civil:  { label: 'Civil',       cls: 'b-civil',  em: '🙂' },
  under:  { label: 'Undercover',  cls: 'b-under',  em: '🕵️' },
  white:  { label: 'Mr White',    cls: 'b-white',  em: '🎩' },
  /* Option « rôle caché » : ce qu'on affiche à quelqu'un qui ignore son camp. */
  secret: { label: 'Camp inconnu', cls: 'b-secret', em: '❓' },
};
let S = null;     // état hôte
let V = null;     // vue locale (hôte comme client)

function hostInit(name) {
  S = {
    code: NET.code, phase: 'lobby', round: 0,
    cfg: Object.assign({ under: 1, white: 0, hard: false, whiteGuess: true, showCat: false,
                        civilFirst: false, hideRole: false, off: [],
                        tClue: 0, tDebate: 0, tVote: 0 }, lsGet('uc_cfg', {})),
    players: [], order: [], turn: 0, clues: [], chat: [], chatSeq: 0, bannis: [],
    pair: null, elim: null, result: null, tie: null, usedWords: lsGet('uc_used2', []),
  };
  hostAddPlayer(HOST_ID, NET.myToken, name);
  demarrerSurveillance();
}

let surveillance = null;
function demarrerSurveillance() {
  clearInterval(surveillance);
  // PeerJS ne signale pas toujours la fermeture d'un onglet : on surveille nous-memes
  surveillance = setInterval(() => {
    if (!S) return;
    S.players.filter(p => p.id !== HOST_ID && p.connected && Date.now() - (p.lastSeen || 0) > 9000)
             .forEach(p => hostSetConnected(p.id, false));
    verifierMinuteur();
    verifierEffectif();
  }, 1000);
}

/* Délai de grâce avant d'interrompre : les joueurs partis reviennent souvent
   d'eux-mêmes (rechargement, tunnel, wifi qui saute). */
const DELAI_ABANDON = 30000;

function verifierEffectif() {
  if (!S) return;
  if (!R.partieInjouable(S)) {
    if (S.creuxDepuis) { S.creuxDepuis = null; broadcastViews(); }
    return;
  }
  if (!S.creuxDepuis) S.creuxDepuis = Date.now();
  if (Date.now() - S.creuxDepuis >= DELAI_ABANDON) {
    S.creuxDepuis = null;
    R.interrompre(S, 'Manche interrompue : plus assez de joueurs connectés.');
  }
  /* Diffusion à chaque seconde tant que l'alerte est là : sinon le compte à
     rebours affiché reste figé sur sa valeur initiale. */
  broadcastViews();
}

function hostAddPlayer(id, token, name) {
  const taken = S.players.map(p => p.name.toLowerCase());
  let n = clean(name) || 'Joueur', base = n, k = 2;
  while (taken.includes(n.toLowerCase())) n = base + ' ' + (k++);
  let scoreInitial = 0;
  if (scoresRepris && scoresRepris[n] != null) {     // à usage unique
    scoreInitial = scoresRepris[n];
    delete scoresRepris[n];
  }
  S.players.push({ id, token, name: n, connected: true, lastSeen: Date.now(), score: scoreInitial, role: null, word: null,
                   alive: true, voted: null, revealed: false, clue: null });
  return S.players.at(-1);
}

/* raccourcis locaux : le moteur fournit les mêmes, on les relie à l'état courant */
const byId = id => R.parId(S, id);
const alivePlayers = () => R.vivants(S);
const activeVoters = () => R.votants(S);

function hostSetConnected(id, on) {
  const p = byId(id); if (!p) return;
  p.connected = on;
  if (!on && S.phase === 'lobby') S.players = S.players.filter(x => x.id !== id);
  if (!on) hostNudge();                 // un absent ne doit pas bloquer la partie
  broadcastViews();
}

/* ---------- messages reçus par l'hôte ---------- */
function onHostMessage(conn, msg) {
  if (!S || !msg || typeof msg.t !== 'string') return;
  const senderId = conn ? ([...NET.conns].find(([, c]) => c === conn)?.[0] ?? null) : HOST_ID;

  if (msg.t === 'hello') {
    if (conn === null) return;
    // reconnexion : on retrouve le joueur par son jeton
    // reconnexion uniquement si ce jeton correspond a un joueur actuellement absent
    if ((S.bannis || []).some(b => b.token === msg.token)) {
      conn.send({ t: 'err', m: "Tu as été exclu de ce salon. L'hôte peut te réadmettre.", code: S.code });
      setTimeout(() => conn.close(), 400); return;
    }
    /* On rend son siège si le jeton correspond à quelqu'un d'absent — ou dont
       la connexion est morte sans que la surveillance l'ait encore vu passer,
       ce qui est le cas de celui qui rouvre sa page en moins de neuf secondes.
       L'hôte est exclu de la recherche : il joue en local, sans entrée dans
       `conns`, donc le test de connexion morte serait toujours vrai pour lui et
       n'importe quel arrivant pourrait lui prendre sa place. */
    let p = S.players.find(x => x.id !== HOST_ID           // l'hôte n'est jamais au bout d'un fil
                                && x.token === msg.token
                                && (!x.connected || !NET.conns.get(x.id)?.open));
    if (p) { NET.conns.get(p.id)?.close(); p.connected = true; p.lastSeen = Date.now(); }
    else {
      if (S.players.length >= MAX_JOUEURS) { conn.send({ t: 'err', m: `Salon complet (${MAX_JOUEURS} joueurs).` }); setTimeout(() => conn.close(), 400); return; }
      /* Jeton déjà porté par quelqu'un de connecté (deuxième onglet sur la même
         machine) : on en forge un neuf, sinon deux joueurs partageraient une
         identité et la reprise de siège désignerait n'importe qui. */
      let jeton = msg.token;
      if (!jeton || S.players.some(x => x.token === jeton)) jeton = rid() + rid();
      p = hostAddPlayer(rid(), jeton, msg.name);
      if (!canConfigure()) {
        /* Arrivé en cours de partie : il regarde sans jouer jusqu'à la fin de
           la partie en cours, puis entre au prochain tirage. */
        p.alive = false; p.pending = true;
        pushLog(p.name + ' rejoint — il entrera en jeu à la prochaine partie.');
      }
    }
    NET.conns.set(p.id, conn);
    p.chatVu = 0;                       // nouvelle connexion : renvoyer l'historique
    conn.send({ t: 'welcome', id: p.id, code: S.code, token: p.token });
    broadcastViews();
    return;
  }

  const p = senderId ? byId(senderId) : null;
  if (!p) return;
  p.lastSeen = Date.now();
  if (!p.connected) { p.connected = true; broadcastViews(); }
  if (msg.t === 'ping') return;
  const isHost = p.id === HOST_ID;

  switch (msg.t) {
    case 'cfg':
      if (!isHost || !canConfigure()) return;
      /* msg.v est une DIRECTION (+1 / −1) pour toutes les molettes. */
      if (R.PALIERS[msg.k]) S.cfg[msg.k] = R.stepCfg(S.cfg, msg.k, msg.v);
      if (['hard', 'whiteGuess', 'showCat', 'civilFirst', 'hideRole'].includes(msg.k)) S.cfg[msg.k] = !!msg.v;
      if (msg.k === 'cat') {                       // (dé)sélection d'une catégorie
        const name = String(msg.v && msg.v.name || '');
        if (!CATS.some(c => c.name === name)) return;
        const off = new Set(S.cfg.off || []);
        msg.v.on ? off.delete(name) : off.add(name);
        S.cfg.off = [...off];
      }
      if (msg.k === 'cats') {                      // tout / aucune / inverser
        /* La commande porte sur une LISTE : quand une recherche est active, elle
           ne contient que les catégories affichées. Sans liste, c'est tout. */
        const toutes = CATS.map(c => c.name);
        const cible = Array.isArray(msg.v && msg.v.noms) ? msg.v.noms : toutes;
        S.cfg.off = R.appliquerCats(S.cfg.off, cible, (msg.v && msg.v.action) || msg.v, toutes);
      }
      lsSet('uc_cfg', S.cfg); broadcastViews(); break;

    case 'start':
      if (!isHost || S.phase !== 'lobby') return;
      if (cfgError()) return;
      startRound(true); break;

    case 'clue': {
      if (S.phase !== 'clue') return;
      if (S.order[S.turn] !== p.id) return;
      const txt = clean(msg.text);
      if (!txt) return;
      /* Refus privé : les autres ne doivent pas apprendre qu'il a failli lâcher
         son mot — ce serait déjà une information. */
      if (R.indiceTrahit(txt, p.word)) {
        sendTo(p.id, { t: 'note', m: 'Ton indice contient ton mot — trouve autre chose.' });
        return;
      }
      S.clues.push({ round: S.round, id: p.id, text: txt });
      p.clue = txt;
      R.tourSuivant(S);                  // le suivant repart sur son temps plein
      hostNudge(); break;
    }

    case 'vote': {
      if (S.phase !== 'vote' || !p.alive) return;
      const target = byId(msg.target);
      if (!target || !target.alive || target.id === p.id) return;
      if (S.tie && !S.tie.includes(target.id)) return;
      p.voted = target.id;
      hostNudge(); break;
    }

    case 'guess': {
      if (S.phase !== 'guess' || S.elim?.id !== p.id) return;
      if (R.guessOk(msg.text, S.pair.civil)) endGame('white', p.id);
      else { pushLog(`${p.name} n'a pas trouvé (le mot était « ${S.pair.civil} »).`); afterElimination(); }
      break;
    }

    case 'next':
      if (!isHost) return;
      if (S.phase === 'reveal') afterElimination();
      else if (S.phase === 'guess') { pushLog('Mr White a laissé filer sa chance.'); afterElimination(); }
      break;

    case 'again':
      if (!isHost || S.phase !== 'end') return;
      startRound(true); break;

    case 'chat': {
      const txt = R.tronquer(msg.text, 200);
      if (!txt) return;
      if (!R.peutParler(S, p.id)) return;
      if (Date.now() - (p.dernierMsg || 0) < 700) return;    // garde-fou anti-spam
      p.dernierMsg = Date.now();
      S.chat.push({ id: p.id, name: p.name, text: txt, ts: Date.now(), n: ++S.chatSeq });
      if (S.chat.length > 60) S.chat.shift();
      broadcastViews(); break;
    }

    case 'openvote':
      if (!isHost || S.phase !== 'debate') return;
      S.phase = 'vote'; S.deadline = null; S.players.forEach(p => p.voted = null); hostNudge(); break;

    case 'closevote':                              // dépouille avec ce qui est tombé
      if (!isHost || S.phase !== 'vote') return;
      pushLog('Vote clos par l\'hôte.');
      resolveVote(); hostNudge(); break;

    case 'abandon':                                // l'hôte n'attend pas le délai
      if (!isHost || S.phase === 'lobby' || S.phase === 'end') return;
      S.creuxDepuis = null;
      R.interrompre(S, 'Manche interrompue par l\'hôte.');
      broadcastViews(); break;

    case 'skip':                                   // l'hote debloque un joueur absent ou muet
      if (!isHost || S.phase !== 'clue') return;
      R.tourSuivant(S); hostNudge(); break;

    case 'readmettre': {                           // l'hôte rouvre la porte
      if (!isHost) return;
      const banni = (S.bannis || []).find(b => b.token === msg.token);
      if (!banni) return;
      S.bannis = S.bannis.filter(b => b.token !== msg.token);
      pushLog(banni.name + ' peut de nouveau rejoindre.');
      broadcastViews(); break;
    }

    case 'kick': {
      if (!isHost) return;
      const v = byId(msg.id);
      if (!v || v.id === HOST_ID) return;
      NET.conns.get(v.id)?.close();
      NET.conns.delete(v.id);
      /* Sans ça, sa reconnexion automatique le ferait revenir aussitôt. On
         retient son nom avec son jeton : l'hôte doit pouvoir le rappeler, une
         exclusion est rarement définitive dans une soirée entre amis. */
      S.bannis = S.bannis || [];
      if (v.token && !S.bannis.some(b => b.token === v.token)) S.bannis.push({ token: v.token, name: v.name });

      if (canConfigure()) {                      // hors partie : on le retire purement
        S.players = S.players.filter(x => x.id !== v.id);
        broadcastViews(); break;
      }
      /* En pleine manche, on ne peut pas l'effacer : son nom apparaît dans les
         indices déjà donnés et son rôle compte dans l'équilibre. On l'élimine,
         ce qui laisse la partie cohérente. */
      v.connected = false;
      if (v.alive) {
        v.alive = false; v.revealed = true;
        pushLog(v.name + ' a été exclu par l\'hôte.');
        const issue = R.outcome(R.vivants(S));
        if (issue) { endGame(issue); break; }
      }
      hostNudge(); break;
    }
  }
}

/* ---------- réglages ---------- */
const canConfigure = () => S.phase === 'lobby' || S.phase === 'end';

/* L'appli officielle "suggere automatiquement le bon nombre de chaque role
   selon le nombre de joueurs" sans publier sa table : environ 1 imposteur
   pour 4 joueurs donne des parties equilibrees. */
/* L'équilibre se juge sur ceux qui vont réellement jouer, pas sur la liste :
   un absent ne recevra pas de rôle. */
const presents = () => S.players.filter(p => p.connected).length;
const cfgAdvice = () => R.cfgAdvice(presents(), S.cfg);

const cfgError = () => R.cfgError(presents(), S.cfg, countPairs(S.cfg));

/* ---------- tirage des mots, sans répétition ---------- */
function pickPair() {
  const r = R.pickPair(WORDS, S.usedWords, S.cfg);
  if (!r) return null;
  S.usedWords = r.used; lsSet('uc_used2', S.usedWords);
  return r.pair;
}

/* ============================================================================
   DÉROULÉ DE LA PARTIE (hôte)
   ============================================================================ */
const pushLog = texte => R.journal(S, texte);

/* Pose l'échéance de la phase en cours (null si le minuteur est coupé). */
const armerMinuteur = () => R.armer(S, Date.now());

/* Échéance dépassée : on passe le joueur muet, ou on ouvre le vote. */
function verifierMinuteur() {
  if (R.echeance(S, Date.now())) broadcastViews();
}

function startRound(fresh) {
  if (fresh) {
    /* Un joueur exclu en pleine manche reste dans la liste jusqu'au bout : son
       nom figure dans les indices déjà donnés. Mais il ne doit pas réapparaître
       au tirage suivant — banni, il ne peut plus se connecter, et il hériterait
       d'un rôle en comptant dans les conditions de victoire. */
    const bannis = new Set((S.bannis || []).map(b => b.token));
    if (bannis.size) S.players = S.players.filter(p => p.id === HOST_ID || !bannis.has(p.token));

    const err = cfgError(); if (err) return toast(err);   // le tirage reste ici : il persiste l'historique
    const pair = pickPair();
    if (!pair) return toast('Aucun mot disponible.');
    /* Seuls les présents reçoivent un rôle ; les autres regardent cette partie
       et entrent à la suivante, comme un retardataire. */
    const auTirage = S.players.filter(p => p.connected).map(p => p.id);
    R.demarrerManche(S, { pair, roles: R.assignRoles(auTirage.length, S.cfg), joueurs: auTirage });
  } else R.demarrerManche(S);
  armerMinuteur();
  hostNudge();
}

/* Ordre tiré au sort à chaque manche, comme dans les règles officielles.
   L'option "un civil ouvre le tour" évite que Mr White parle sans aucune
   information — ce qui le condamne d'avance — mais elle est désactivée par défaut. */


/* Avance automatiquement tant que l'étape courante est déjà satisfaite
   (joueur déconnecté à passer, dernier vote reçu, etc.). */
function hostNudge() {
  R.avancer(S, Date.now());
  broadcastViews();
}

const resolveVote = () => R.depouiller(S);

function afterElimination() {
  const suite = R.apresElimination(S);
  if (suite === 'manche') armerMinuteur();
  hostNudge();
}

function endGame(winner, heroId) {
  R.terminer(S, winner, heroId);
  broadcastViews();
}

function viewFor(id) {
  /* Le filtrage vit dans rules.js (testé) ; on n'ajoute ici que ce qui dépend
     du réseau et de l'instant présent.
     Le chat n'est envoyé qu'en différentiel : chaque joueur a son curseur, et
     ne reçoit que ce qu'il n'a pas déjà. Sans ça les soixante derniers messages
     repartaient vers tout le monde à chaque indice et à chaque vote. */
  const dest = byId(id);
  const vue = R.projeter(S, id, {
    isHost: id === HOST_ID, code: S.code,
    cfgError: canConfigure() ? cfgError() : null,
    cfgAdvice: canConfigure() ? cfgAdvice() : null,
    reste: S.deadline ? Math.max(0, S.deadline - Date.now()) : null,  // ms : horloges non synchronisées
    creux: S.creuxDepuis ? Math.max(0, DELAI_ABANDON - (Date.now() - S.creuxDepuis)) : null,
    /* Seul l'hôte voit qui il a exclu — c'est lui qui peut les rappeler. */
    bannis: id === HOST_ID ? (S.bannis || []) : null,
    absents: canConfigure() ? S.players.filter(p => !p.connected).map(p => p.name) : [],
  }, dest ? (dest.chatVu || 0) : 0);
  return vue;
}

/* ---------- messages reçus par un client ---------- */
/* L'hôte n'envoie que les messages neufs : c'est ici qu'on reconstitue le fil.
   `chatPlein` marque un envoi complet (première connexion, reconnexion) et
   remplace l'historique local au lieu de s'y ajouter. */
let CHAT = [];

function onClientMessage(msg) {
  if (!msg) return;
  if (msg.t === 'welcome') {
    NET.code = msg.code;
    if (msg.token) retenirJeton(msg.code, msg.token);
    return;
  }
  if (msg.t === 'err')     { ovCode = msg.code || NET.code; overlay('🚫', 'Impossible de rejoindre', msg.m); return; }
  if (msg.t === 'note')    { toast(msg.m); SFX.refus(); return; }   // message privé, sans bloquer
  if (msg.t === 'state')   {
    CHAT = msg.v.chatPlein ? msg.v.chat : CHAT.concat(msg.v.chat);
    if (CHAT.length > 60) CHAT = CHAT.slice(-60);
    msg.v.chat = CHAT;
    V = msg.v; render();
  }
}
