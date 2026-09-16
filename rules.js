/* ============================================================================
   RÈGLES DU JEU — fonctions pures, sans réseau ni DOM.

   Tout ce qui décide de quelque chose vit ici : répartition des rôles, ordre
   de parole, dépouillement, conditions de victoire, barème, tirage des mots.
   `index.html` s'en sert pour la partie réelle, `tests.html` les vérifie sans
   ouvrir de salon. Aucune de ces fonctions ne lit ni n'écrit d'état global :
   on lui passe les données, elle rend un résultat.
   ============================================================================ */
window.UC_RULES = (() => {

  const MIN_JOUEURS = 3, MAX_JOUEURS = 20;
  const POINTS = { civil: 2, white: 6, under: 10 };

  const shuffle = (arr, rnd = Math.random) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  /**
   * Tronque un texte sans couper un emoji en deux.
   *
   * `slice(0, n)` compte des unités UTF-16 : un emoji en occupe deux, une famille
   * ou un drapeau bien davantage. Couper au milieu laissait une demi-paire, que
   * le navigateur affiche « � ». On compte donc des signes AFFICHÉS — un « 👨‍👩‍👧 »
   * vaut un — via Intl.Segmenter, avec repli sur les points de code.
   */
  const SEGMENTS = (() => {
    try { return new Intl.Segmenter('fr', { granularity: 'grapheme' }); } catch { return null; }
  })();
  const signes = s => SEGMENTS ? [...SEGMENTS.segment(s)].map(g => g.segment) : Array.from(s);

  function tronquer(texte, max) {
    const s = (texte || '').toString().replace(/\s+/g, ' ').trim();
    const g = signes(s);
    return g.length <= max ? s : g.slice(0, max).join('');
  }

  /* comparaison souple pour la devinette de Mr White : accents, casse, espaces */
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD')
                     .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  /**
   * L'indice trahit-il le mot de celui qui le donne ?
   *
   * Le piège est le faux positif : refuser un indice légitime est pire que ne
   * rien refuser. On compare donc MOT À MOT, par préfixe, jamais par sous-chaîne
   * — « copain » ne doit pas être bloqué parce que le mot est « pain ».
   *
   *   « Chat »   → « chaton » refusé   (le mot de l'indice commence par le sien)
   *   « Chaton » → « chat » refusé     (l'inverse : la racine suffit)
   *   « Pain »   → « copain » accepté  (ni l'un ni l'autre n'est préfixe)
   *   « Or »     → « ordinateur » accepté (moins de 4 lettres : exact seulement)
   *
   * Un mot composé est découpé : avec « Pelote basque », dire « pelote » trahit.
   * Mr White n'a pas de mot, rien à vérifier.
   */
  const COURT = 4;
  /* Articles et prépositions : dans un mot composé ils n'appartiennent à
     personne. Sans ce filtre, « Le Chat » faisait refuser « le petit animal »
     à cause du seul « le ». */
  const VIDES = new Set(['le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'au', 'aux',
                         'a', 'et', 'en', 'l', 'd', 'sur', 'pour', 'dans']);

  function indiceTrahit(indice, mot) {
    if (!mot) return false;
    const decouper = s => (s || '').toString().split(/[\s'’\-]+/).map(norm).filter(Boolean);
    let secrets = decouper(mot);
    const dits = decouper(indice);
    if (secrets.length > 1) {
      const utiles = secrets.filter(m => !VIDES.has(m));
      if (utiles.length) secrets = utiles;      // un mot seul reste vérifié tel quel
    }
    if (!secrets.length || !dits.length) return false;
    return secrets.some(m => m.length < COURT
      ? dits.includes(m)
      : dits.some(d => d.startsWith(m) || (d.length >= COURT && m.startsWith(d))));
  }

  /* ---- images animées (GIF) -------------------------------------------
     Laisser un joueur choisir l'adresse d'une image que TOUS les autres vont
     charger, c'est lui laisser choisir à quel serveur ils se présentent : ce
     serveur voit alors l'adresse IP de chacun. On n'accepte donc que le CDN de
     KLIPY, en https, et on refuse tout le reste. */

  const GIF_HOTE = /^static[0-9]*\.klipy\.com$/;
  const GIF_MAX  = 400;                       // longueur d'adresse raisonnable

  /**
   * Vérifie une image proposée par un joueur.
   * Rend un objet sûr { url, w, h, alt }, ou null si l'image est refusée.
   *
   * La pièce de sécurité, c'est la LISTE BLANCHE D'HÔTES : c'est l'hôte, et lui
   * seul, qui détermine à quel serveur les joueurs vont se présenter.
   *
   * On VÉRIFIE sans RÉCRIRE : l'adresse acceptée ressort telle quelle. Les
   * conditions d'intégration de KLIPY l'exigent (« ne pas retirer, altérer ni
   * reconstruire les paramètres d'URL » — ils y logent l'identification de
   * contenu et la modération), et c'est de toute façon plus sûr : une adresse
   * qu'on ne réassemble pas ne peut pas être réassemblée de travers. Une
   * adresse douteuse est donc REFUSÉE, jamais rafistolée.
   */
  function gifValide(g) {
    if (!g || typeof g !== 'object') return null;
    const url = (g.url || '').toString().trim();
    if (!url || url.length > GIF_MAX) return null;
    if (url.includes('#')) return null;         // un fragment n'a rien à faire ici
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!GIF_HOTE.test(u.hostname)) return null;
    /* Le nom de fichier doit finir par .gif ou .webp — on regarde le CHEMIN et
       pas la requête, sinon « /a.png?x=.gif » passerait. Le WebP animé est
       accepté parce qu'il est ~10× plus léger que le GIF équivalent (285 Ko
       contre 4 Mo dans l'exemple de KLIPY) pour un rendu identique. */
    if (!/\.(gif|webp)$/i.test(u.pathname)) return null;
    /* Les dimensions ne servent qu'à réserver la place avant l'arrivée de
       l'image ; une valeur farfelue ne doit pas pouvoir étirer le chat. */
    const dim = v => { const n = Math.round(Number(v)); return (n >= 8 && n <= 2000) ? n : 0; };
    return { url, w: dim(g.w), h: dim(g.h), alt: tronquer(g.alt || 'GIF', 60) || 'GIF' };
  }

  /* ---- configuration ------------------------------------------------- */

  /** Message bloquant, ou null si la partie peut démarrer. */
  function cfgError(nJoueurs, cfg, pairesDisponibles) {
    const imp = (cfg.under | 0) + (cfg.white | 0), civ = nJoueurs - imp;
    if (nJoueurs < MIN_JOUEURS) return `Il faut au moins ${MIN_JOUEURS} joueurs.`;
    if (imp === 0)              return 'Il faut au moins un imposteur.';
    if (civ <= imp)             return 'Les civils doivent rester majoritaires.';
    if (!pairesDisponibles)     return 'Aucune catégorie sélectionnée.';
    return null;
  }

  /** Suggestion indicative : environ un imposteur pour quatre joueurs. */
  function cfgAdvice(nJoueurs, cfg) {
    if (nJoueurs < MIN_JOUEURS) return null;
    const reco = Math.max(1, Math.round(nJoueurs / 4));
    const imp = (cfg.under | 0) + (cfg.white | 0);
    return imp === reco ? null : `Conseil : ${reco} imposteur${reco > 1 ? 's' : ''} pour ${nJoueurs} joueurs.`;
  }

  /* ---- molettes de réglage --------------------------------------------- */

  /* Paliers proposés par les boutons − / +. 0 = minuteur désactivé. */
  const PALIERS = {
    under:   [0, 1, 2, 3, 4, 5, 6, 7, 8],
    white:   [0, 1, 2, 3, 4, 5, 6, 7, 8],
    tClue:   [0, 15, 20, 30, 45, 60, 90],
    tDebate: [0, 30, 60, 90, 120, 180, 300],
    tVote:   [0, 20, 30, 45, 60, 90],
  };

  /**
   * Valeur suivante d'un réglage à molette.
   * `dir` est une DIRECTION (+1 / −1), jamais une valeur absolue — c'est la
   * confusion entre les deux qui faisait autrefois grimper la valeur quand on
   * appuyait sur « − ». Les extrémités sont bornées, sans repasser par zéro.
   */
  function stepCfg(cfg, key, dir) {
    const paliers = PALIERS[key];
    if (!paliers) return cfg[key];
    const actuel = paliers.indexOf(cfg[key] | 0);
    const depart = actuel < 0 ? 0 : actuel;             // valeur inconnue : on repart du bas
    const cible = depart + (dir > 0 ? 1 : -1);
    return paliers[Math.max(0, Math.min(paliers.length - 1, cible))];
  }

  /**
   * Applique « tout / aucune / inverser » à un SOUS-ENSEMBLE de catégories —
   * celles que la recherche laisse affichées. Rend la nouvelle liste des
   * catégories écartées. Les noms inconnus sont ignorés : la liste vient du
   * client, on ne s'y fie pas.
   */
  function appliquerCats(off, cible, action, connues) {
    const set = new Set(off || []);
    const ok = connues ? new Set(connues) : null;
    const noms = (cible || []).filter(n => !ok || ok.has(n));
    if (action === 'all')    noms.forEach(n => set.delete(n));
    if (action === 'none')   noms.forEach(n => set.add(n));
    if (action === 'invert') noms.forEach(n => set.has(n) ? set.delete(n) : set.add(n));
    return ['all', 'none', 'invert'].includes(action) ? [...set] : (off || []);
  }

  /* ---- mots ------------------------------------------------------------ */

  /** Filtre la banque selon la difficulté et les catégories coupées. */
  function poolFor(words, cfg) {
    const off = new Set(cfg.off || []);
    return words.filter(w => (cfg.hard || !w.hard) && !off.has(w.cat));
  }

  /**
   * Tire une paire jamais sortie. Rend aussi la liste `used` mise à jour —
   * l'appelant décide s'il la persiste. Recycle quand la banque est épuisée.
   */
  function pickPair(words, used, cfg, rnd = Math.random) {
    const pool = poolFor(words, cfg);
    if (!pool.length) return null;
    const vus = new Set(used);
    let avail = pool.filter(w => !vus.has(w.key));
    let recycle = false;
    if (!avail.length) { avail = pool; used = []; recycle = true; }
    const pick = avail[rnd() * avail.length | 0];
    let next = [...used, pick.key];
    if (next.length > 4000) next = next.slice(-3000);
    const flip = rnd() < .5;                       // le mot principal change de camp
    return {
      pair: { civil: flip ? pick.b : pick.a, under: flip ? pick.a : pick.b, cat: pick.cat },
      used: next, recycle,
    };
  }

  /* ---- rôles et ordre --------------------------------------------------- */

  /** Un rôle par joueur, mélangé. */
  function assignRoles(nJoueurs, cfg, rnd = Math.random) {
    const under = cfg.under | 0, white = cfg.white | 0;
    return shuffle([
      ...Array(under).fill('under'),
      ...Array(white).fill('white'),
      ...Array(Math.max(0, nJoueurs - under - white)).fill('civil'),
    ], rnd);
  }

  /**
   * Ordre de parole des joueurs encore en vie. Aléatoire par défaut, comme
   * les règles officielles ; `civilFirst` place un civil connecté en tête
   * pour que Mr White ne parle jamais totalement à l'aveugle.
   */
  function speakOrder(alive, civilFirst, rnd = Math.random) {
    const order = shuffle(alive, rnd);
    if (civilFirst) {
      const i = order.findIndex(p => p.role === 'civil' && p.connected !== false);
      if (i > 0) order.unshift(...order.splice(i, 1));
    }
    return order.map(p => p.id);
  }

  /* ---- vote ------------------------------------------------------------- */

  /**
   * Dépouille les votes des votants actifs.
   * → { tally: [{id,n}], top: [ids à égalité en tête], tie: bool }
   */
  function tallyVotes(voters) {
    const counts = {};
    voters.forEach(p => { if (p.voted) counts[p.voted] = (counts[p.voted] || 0) + 1; });
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter(k => counts[k] === max);
    const tally = Object.entries(counts).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
    return { tally, top, tie: top.length > 1 };
  }

  /* ---- fin de partie ---------------------------------------------------- */

  /**
   * Issue d'après les joueurs en vie, ou null si la partie continue.
   * Règles officielles : les civils gagnent quand tous les infiltrés sont
   * éliminés ; les infiltrés gagnent quand il ne reste plus qu'un civil.
   */
  function outcome(alive) {
    const imp = alive.filter(p => p.role !== 'civil').length;
    const civ = alive.length - imp;
    if (imp === 0) return 'civils';
    if (civ <= 1)  return 'imposteurs';
    return null;
  }

  /** Points à ajouter, par identifiant de joueur. */
  function awardScores(winner, players, heroId) {
    const gains = {};
    players.forEach(p => {
      let pts = 0;
      if (winner === 'civils'     && p.role === 'civil') pts = POINTS.civil;
      if (winner === 'imposteurs' && p.role === 'under') pts = POINTS.under;
      if (winner === 'imposteurs' && p.role === 'white') pts = POINTS.white;
      if (winner === 'white'      && p.id === heroId)    pts = POINTS.white;
      if (pts) gains[p.id] = pts;
    });
    return gains;
  }

  /* ---- moteur de partie -------------------------------------------------
     L'enchaînement des phases, déplacé ici mot pour mot depuis le jeu pour
     devenir vérifiable. Ces fonctions modifient l'état qu'on leur passe et
     ne touchent à rien d'autre : ni réseau, ni DOM, ni horloge implicite
     (l'instant est toujours fourni en paramètre).

       lobby → clue → debate → vote → reveal → [guess] → clue… → end
     ---------------------------------------------------------------------- */

  const parId = (e, id) => e.players.find(p => p.id === id);
  const vivants = e => e.players.filter(p => p.alive);
  const votants = e => e.players.filter(p => p.alive && p.connected);

  function journal(e, texte) {
    e.log = e.log || [];
    e.log.push(texte);
    if (e.log.length > 6) e.log.shift();
  }

  /** Durée impartie à la phase en cours, 0 si aucun minuteur. */
  function dureePhase(e) {
    return e.phase === 'clue' ? e.cfg.tClue
         : e.phase === 'debate' ? e.cfg.tDebate
         : e.phase === 'vote' ? e.cfg.tVote : 0;
  }

  /**
   * Passe au joueur suivant. Le minuteur par indice est un temps de parole
   * INDIVIDUEL : chacun repart à zéro. Effacer l'échéance ici est ce qui le
   * garantit — `avancer` ne peut pas deviner qu'on a changé de tour, puisqu'il
   * compare le tour à un instantané pris après coup, et le suivant héritait
   * alors du reliquat de son prédécesseur.
   */
  function tourSuivant(e) {
    e.turn++;
    e.deadline = null;
    return e;
  }

  function armer(e, maintenant) {
    const sec = dureePhase(e);
    e.deadline = sec ? maintenant + sec * 1000 : null;
  }

  /**
   * Ouvre une manche. `pair` et `roles` sont fournis : le tirage reste dehors.
   * `joueurs` liste qui participe — les autres deviennent spectateurs. Sans
   * cette liste, tout le monde joue.
   *
   * Un absent ne doit PAS recevoir de rôle : il ne parlerait jamais tout en
   * comptant dans les conditions de victoire, et pouvait hériter d'Undercover,
   * ce qui rendait la partie impossible à terminer.
   */
  function demarrerManche(e, { pair, roles, joueurs } = {}) {
    if (pair) {                                   // nouvelle partie
      e.pair = pair;
      const participe = joueurs ? id => joueurs.includes(id) : () => true;
      let k = 0;
      e.players.forEach(p => {
        p.revealed = false; p.voted = null; p.clue = null;
        if (!participe(p.id)) {                   // absent : spectateur de cette partie
          p.role = null; p.word = null; p.alive = false; p.pending = true;
          return;
        }
        p.role = roles[k++];
        p.word = p.role === 'white' ? null : (p.role === 'under' ? pair.under : pair.civil);
        p.alive = true; p.pending = false;
      });
      e.round = 0; e.clues = []; e.result = null; e.elim = null; e.log = [];
    }
    /* Les spectateurs arrivés en cours restent spectateurs jusqu'à la fin de la
       PARTIE : c'est la branche « pair » ci-dessus, au prochain tirage, qui les
       fait entrer. Les intégrer entre deux manches changerait l'équilibre annoncé
       au lancement, et ils ont déjà entendu les indices et vu les votes. */
    e.round++;
    e.tie = null;
    e.players.forEach(p => { p.voted = null; p.clue = null; });
    e.order = speakOrder(vivants(e), e.cfg.civilFirst);
    e.turn = 0;
    e.phase = 'clue';
  }

  /** Dépouille et applique le résultat (élimination, départage, ou rien). */
  function depouiller(e) {
    const { tally, top, tie } = tallyVotes(votants(e));
    e.lastTally = tally;
    /* Le détail du scrutin, capturé AVANT toute remise à zéro : c'est lui qui
       nourrit la discussion suivante (« pourquoi tu as voté contre moi ? »). */
    e.lastVotes = votants(e).map(p => ({ de: p.id, vers: p.voted || null }));

    if (!top.length) {                            // plus aucun votant actif
      journal(e, 'Aucun vote exprimé — personne n\'est éliminé.');
      e.elim = null; e.phase = 'reveal'; return;
    }
    if (tie) {
      if (e.tie) {                                // deuxième égalité : personne ne saute
        journal(e, 'Nouvelle égalité — personne n\'est éliminé.');
        e.elim = null; e.phase = 'reveal'; return;
      }
      e.tie = top;                                // vote de départage
      e.players.forEach(p => p.voted = null);
      /* Le départage est un nouveau vote : il repart sur un minuteur plein.
         Sans ça il héritait du temps restant du scrutin précédent. */
      e.deadline = null;
      journal(e, 'Égalité — on revote entre ' + top.map(id => parId(e, id).name).join(' et ') + '.');
      return;
    }
    const victime = parId(e, top[0]);
    victime.alive = false; victime.revealed = true;
    e.elim = { id: victime.id, role: victime.role, word: victime.word, name: victime.name };
    e.phase = 'reveal';
  }

  /** Suite d'une élimination : devinette de Mr White, fin de partie, ou manche suivante. */
  function apresElimination(e) {
    const v = e.elim && parId(e, e.elim.id);
    if (e.phase === 'reveal' && v && v.role === 'white' && e.cfg.whiteGuess && v.connected) {
      e.phase = 'guess'; return 'guess';
    }
    const issue = outcome(vivants(e));
    if (issue) { terminer(e, issue); return 'end'; }
    demarrerManche(e);
    return 'manche';
  }

  function terminer(e, gagnant, heroId) {
    e.phase = 'end';
    e.result = { winner: gagnant, heroId: heroId || null };
    const gains = awardScores(gagnant, e.players, heroId);
    e.players.forEach(p => { p.revealed = true; p.score = (p.score || 0) + (gains[p.id] || 0); });
  }

  /**
   * Fait avancer la partie tant qu'une étape est déjà satisfaite : joueur
   * absent à sauter, dernier vote reçu… Puis (ré)arme l'échéance.
   */
  function avancer(e, maintenant) {
    if (!e || e.phase === 'lobby' || e.phase === 'end') return e;
    const avant = e.phase + '#' + e.turn;
    let garde = 0;
    while (garde++ < 40) {
      if (e.phase === 'clue') {
        while (e.turn < e.order.length && !parId(e, e.order[e.turn])?.connected) e.turn++;  // absent : on saute
        if (e.turn < e.order.length) break;
        e.phase = 'debate'; break;                // on discute avant d'ouvrir le vote
      }
      if (e.phase === 'vote') {
        const v = votants(e);
        if (!v.length || v.some(p => !p.voted)) break;
        depouiller(e); continue;
      }
      break;
    }
    /* Nouvelle échéance dès que le tour ou la phase change, et aussi quand la
       précédente vient d'être consommée (sinon le tour suivant n'est pas chronométré). */
    if (e.phase === 'clue' || e.phase === 'debate' || e.phase === 'vote') {
      if (avant !== e.phase + '#' + e.turn || !e.deadline) armer(e, maintenant);
    } else e.deadline = null;
    return e;
  }

  /* Il faut au moins deux participants présents pour que quoi que ce soit
     puisse se passer : sans ça la manche tourne dans le vide. */
  const MIN_EN_JEU = 2;
  const joueursEnJeu = e => e.players.filter(p => p.alive && p.connected).length;
  const partieInjouable = e => e.phase !== 'lobby' && e.phase !== 'end'
                               && joueursEnJeu(e) < MIN_EN_JEU;

  /**
   * Interrompt la manche et ramène tout le monde au salon. Les joueurs et les
   * scores sont conservés ; seuls les rôles et l'avancement sont effacés.
   */
  function interrompre(e, raison) {
    e.phase = 'lobby';
    e.players.forEach(p => {
      p.role = null; p.word = null; p.alive = true; p.pending = false;
      p.revealed = false; p.voted = null; p.clue = null;
    });
    e.order = []; e.turn = 0; e.clues = []; e.elim = null; e.result = null;
    e.pair = null;
    e.tie = null; e.deadline = null; e.lastTally = null; e.lastVotes = null;
    e.log = [];
    journal(e, raison || 'Manche interrompue.');
    return e;
  }

  /** Échéance dépassée : on passe le muet, on ouvre le vote, ou on dépouille. */
  function echeance(e, maintenant) {
    if (!e || !e.deadline || maintenant < e.deadline) return false;
    e.deadline = null;
    if (e.phase === 'clue') tourSuivant(e);
    else if (e.phase === 'debate') { e.phase = 'vote'; e.players.forEach(p => p.voted = null); }
    else if (e.phase === 'vote') {                // les silencieux s'abstiennent
      journal(e, 'Temps écoulé — dépouillement des votes exprimés.');
      depouiller(e);
    }
    avancer(e, maintenant);
    return true;
  }

  /**
   * Qui a le droit d'écrire dans le chat. Un éliminé lit sans écrire : il
   * connaît son rôle et celui de sa victime, il pourrait orienter la fin. Un
   * retardataire, lui, ne sait rien et parle librement.
   *
   * Une fois la partie terminée — ou de retour au salon — tout est révélé :
   * la règle n'a plus d'objet et TOUT LE MONDE retrouve la parole. Sans ça,
   * celui que le dernier vote venait d'éliminer se retrouvait muet pile au
   * moment des commentaires d'après-partie, son message à moitié tapé coincé
   * dans un champ désactivé.
   */
  function peutParler(e, id) {
    const p = parId(e, id);
    if (!p) return false;
    if (e.phase === 'end' || e.phase === 'lobby') return true;
    return !!(p.alive || p.pending);
  }

  /* ---- projection des vues ---------------------------------------------
     LE point sensible du jeu : c'est ici que se joue l'anti-triche. Chaque
     joueur reçoit une vue filtrée de l'état ; personne ne doit jamais y trouver
     le rôle ou le mot d'un autre avant révélation. Fonction pure, donc
     vérifiable par tests.js sans ouvrir de salon.
     ---------------------------------------------------------------------- */
  /**
   * Option « rôle caché » : on reçoit son mot sans savoir de quel camp il est.
   * Civil ou Undercover, impossible de le dire — il faut l'déduire des indices
   * des autres, ce qui retire à l'infiltré son avantage de comédien.
   *
   * Mr White fait exception, et ce n'est pas un oubli : il ne reçoit aucun mot,
   * donc il sait forcément ce qu'il est. Lui mentir n'ajouterait rien.
   * Une fois éliminé — ou la partie finie — chacun apprend ce qu'il était.
   */
  const ROLE_SECRET = 'secret';
  const roleCache = (e, p) =>
    (e.cfg.hideRole && p.role && p.role !== 'white') ? ROLE_SECRET : p.role;

  function projeter(e, id, extra = {}, chatDepuis = 0) {
    const moi = e.players.find(p => p.id === id);
    const toutVoir = e.phase === 'end';
    /* Son propre rôle, éventuellement masqué par l'option. */
    const monRole = p => (toutVoir || p.revealed) ? p.role : roleCache(e, p);
    const nomDe = pid => (e.players.find(p => p.id === pid) || {}).name || '?';
    return {
      me: id, phase: e.phase, round: e.round, cfg: e.cfg,
      you: moi ? { role: monRole(moi), word: moi.word, alive: moi.alive,
                   voted: moi.voted, pending: !!moi.pending } : null,
      pair: toutVoir ? e.pair : (e.cfg.showCat && e.pair ? { cat: e.pair.cat } : null),
      players: e.players.map(p => ({
        id: p.id, name: p.name, connected: p.connected, alive: p.alive, score: p.score,
        role: (toutVoir || p.revealed) ? p.role : (p.id === id ? monRole(p) : null),
        pending: !!p.pending,
        hasVoted: e.phase === 'vote' ? !!p.voted : false,
      })),
      order: e.order, turn: e.turn, currentId: e.order[e.turn] || null,
      minuteur: e.phase === 'clue' ? e.cfg.tClue : e.phase === 'debate' ? e.cfg.tDebate
              : e.phase === 'vote' ? e.cfg.tVote : 0,
      clues: (e.clues || []).map(c => ({ round: c.round, name: nomDe(c.id), text: c.text, mine: c.id === id })),
      tie: e.tie,
      /* Une élimination révèle un RÔLE, pas un mot. Le mot y voyageait encore :
         Mr White recevait donc, écrit noir sur blanc, le mot des civils qu'il
         est censé deviner, et l'Undercover apprenait le mot adverse dès la
         première élimination. Les mots ne sortent qu'à la fin. */
      elim: e.elim && (toutVoir ? e.elim
                                : { id: e.elim.id, role: e.elim.role, name: e.elim.name }),
      tally: (e.phase === 'reveal' || e.phase === 'end') ? e.lastTally : null,
      votes: (e.phase === 'reveal' || e.phase === 'end')
        ? (e.lastVotes || []).map(v => ({ de: nomDe(v.de), vers: v.vers ? nomDe(v.vers) : null }))
        : null,
      result: e.result, log: e.log || [],
      muet: !peutParler(e, id),
      /* Différentiel : seulement ce que ce joueur n'a pas encore reçu.
         `chatPlein` prévient le client qu'il s'agit d'un envoi complet.
         Un message sans numéro vient d'une sauvegarde antérieure au différentiel :
         il n'a pas de place dans la file, on le joint aux envois complets. */
      chat: (e.chat || []).filter(m => m.n == null ? !chatDepuis : m.n > chatDepuis)
                          .map(m => ({ name: m.name, text: m.text, gif: m.gif || null,
                                       ts: m.ts, mine: m.id === id })),
      chatPlein: !chatDepuis,
      /* Compteur monotone : la longueur de la liste ne dit rien, elle est
         plafonnée à 60 et cesse alors de croître. */
      chatN: e.chatSeq || 0,
      ...extra,
    };
  }

  /** La devinette de Mr White est-elle bonne ? */
  const guessOk = (essai, motCivil) => !!norm(essai) && norm(essai) === norm(motCivil);

  return { MIN_JOUEURS, MAX_JOUEURS, POINTS, PALIERS, ROLE_SECRET, stepCfg, shuffle, norm, tronquer, indiceTrahit, gifValide, cfgError, cfgAdvice,
           appliquerCats,
           poolFor, pickPair, assignRoles, speakOrder, tallyVotes, outcome,
           awardScores, guessOk, projeter,
           parId, vivants, votants, journal, dureePhase, armer, demarrerManche,
           depouiller, apresElimination, terminer, avancer, echeance, tourSuivant,
           peutParler,
           MIN_EN_JEU, joueursEnJeu, partieInjouable, interrompre };
})();
