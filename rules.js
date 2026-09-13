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

  /* comparaison souple pour la devinette de Mr White : accents, casse, espaces */
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD')
                     .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

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

  function armer(e, maintenant) {
    const sec = dureePhase(e);
    e.deadline = sec ? maintenant + sec * 1000 : null;
  }

  /** Ouvre une manche. `pair` et `roles` sont fournis : le tirage reste dehors. */
  function demarrerManche(e, { pair, roles } = {}) {
    if (pair) {                                   // nouvelle partie
      e.pair = pair;
      e.players.forEach((p, i) => {
        p.role = roles[i];
        p.word = p.role === 'white' ? null : (p.role === 'under' ? pair.under : pair.civil);
        p.alive = true; p.pending = false; p.revealed = false; p.voted = null; p.clue = null;
      });
      e.round = 0; e.clues = []; e.result = null; e.elim = null; e.log = [];
    }
    /* Ceux qui ont rejoint en cours de partie entrent maintenant. On les fait
       civils : glisser un imposteur en cours de route casserait l'équilibre
       annoncé et pourrait renverser la majorité civile. */
    e.players.filter(p => p.pending).forEach(p => {
      p.pending = false; p.alive = true; p.revealed = false;
      p.role = 'civil'; p.word = e.pair ? e.pair.civil : null;
      journal(e, p.name + ' entre en jeu comme civil.');
    });
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
    if (e.phase === 'clue') e.turn++;
    else if (e.phase === 'debate') { e.phase = 'vote'; e.players.forEach(p => p.voted = null); }
    else if (e.phase === 'vote') {                // les silencieux s'abstiennent
      journal(e, 'Temps écoulé — dépouillement des votes exprimés.');
      depouiller(e);
    }
    avancer(e, maintenant);
    return true;
  }

  /* ---- projection des vues ---------------------------------------------
     LE point sensible du jeu : c'est ici que se joue l'anti-triche. Chaque
     joueur reçoit une vue filtrée de l'état ; personne ne doit jamais y trouver
     le rôle ou le mot d'un autre avant révélation. Fonction pure, donc
     vérifiable par tests.js sans ouvrir de salon.
     ---------------------------------------------------------------------- */
  function projeter(e, id, extra = {}) {
    const moi = e.players.find(p => p.id === id);
    const toutVoir = e.phase === 'end';
    const nomDe = pid => (e.players.find(p => p.id === pid) || {}).name || '?';
    return {
      me: id, phase: e.phase, round: e.round, cfg: e.cfg,
      you: moi ? { role: moi.role, word: moi.word, alive: moi.alive,
                   voted: moi.voted, pending: !!moi.pending } : null,
      pair: toutVoir ? e.pair : (e.cfg.showCat && e.pair ? { cat: e.pair.cat } : null),
      players: e.players.map(p => ({
        id: p.id, name: p.name, connected: p.connected, alive: p.alive, score: p.score,
        role: (toutVoir || p.revealed || p.id === id) ? p.role : null,
        pending: !!p.pending,
        hasVoted: e.phase === 'vote' ? !!p.voted : false,
      })),
      order: e.order, turn: e.turn, currentId: e.order[e.turn] || null,
      minuteur: e.phase === 'clue' ? e.cfg.tClue : e.phase === 'debate' ? e.cfg.tDebate
              : e.phase === 'vote' ? e.cfg.tVote : 0,
      clues: (e.clues || []).map(c => ({ round: c.round, name: nomDe(c.id), text: c.text, mine: c.id === id })),
      tie: e.tie, elim: e.elim,
      tally: (e.phase === 'reveal' || e.phase === 'end') ? e.lastTally : null,
      votes: (e.phase === 'reveal' || e.phase === 'end')
        ? (e.lastVotes || []).map(v => ({ de: nomDe(v.de), vers: v.vers ? nomDe(v.vers) : null }))
        : null,
      result: e.result, log: e.log || [],
      chat: (e.chat || []).map(m => ({ name: m.name, text: m.text, ts: m.ts, mine: m.id === id })),
      ...extra,
    };
  }

  /** La devinette de Mr White est-elle bonne ? */
  const guessOk = (essai, motCivil) => !!norm(essai) && norm(essai) === norm(motCivil);

  return { MIN_JOUEURS, MAX_JOUEURS, POINTS, PALIERS, stepCfg, shuffle, norm, cfgError, cfgAdvice,
           poolFor, pickPair, assignRoles, speakOrder, tallyVotes, outcome,
           awardScores, guessOk, projeter,
           parId, vivants, votants, journal, dureePhase, armer, demarrerManche,
           depouiller, apresElimination, terminer, avancer, echeance,
           MIN_EN_JEU, joueursEnJeu, partieInjouable, interrompre };
})();
