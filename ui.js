/* Undercover — rendu de l'interface. Ne décide de rien : affiche la vue reçue. */
/* ============================================================================
   RENDU
   ============================================================================ */
let blurWord = false;

function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

function playerRow(p, o = {}) {
  const row = el(o.onClick ? 'button' : 'div', 'pl');
  if (!p.alive) row.classList.add(p.pending ? 'waiting' : 'dead');
  if (p.id === V.me) row.classList.add('me');
  if (o.turn) row.classList.add('turn');
  if (o.selected) row.classList.add('sel');
  const av = el('span', 'av', (p.name[0] || '?').toUpperCase());
  av.style.background = avatarColor(p.name);
  const nm = el('span', 'nm', p.name + (p.id === V.me ? ' (toi)' : ''));
  row.append(av, nm);
  if (p.pending) row.append(el('span', 'badge b-wait', 'prochaine manche'));
  else if (p.role) row.append(el('span', 'badge ' + ROLE[p.role].cls, ROLE[p.role].label));
  if (o.votes) row.append(el('span', 'votes', o.votes + '✕'));
  if (o.check) row.append(el('span', 'check', '✓'));
  if (!p.connected) row.append(el('span', 'dot off'));
  if (o.kick) {
    const k = el('button', null, '✕');
    const enJeu = V.phase !== 'lobby' && V.phase !== 'end';
    k.title = 'Exclure ' + p.name;
    k.setAttribute('aria-label', 'Exclure ' + p.name);
    k.onclick = e => {
      e.stopPropagation();
      const avertissement = enJeu
        ? 'Exclure ' + p.name + ' ?\n\nEn pleine manche, le joueur est éliminé et son rôle révélé — la partie continue sans lui.'
        : 'Exclure ' + p.name + ' du salon ?';
      if (confirm(avertissement)) send({ t: 'kick', id: p.id });
    };
    row.append(k);
  }
  if (o.onClick) row.onclick = () => o.onClick(p);
  return row;
}

/* Décompte : on reçoit un « temps restant » et on l'anime en local, car les
   horloges des joueurs ne sont pas synchronisées entre elles. */
let finLocale = null, dureeTotale = 0, dernierBip = null, minuterieUI = null;

function majDecompte() {
  const barre = $('#chrono');
  if (finLocale === null) { barre.hidden = true; return; }
  const reste = Math.max(0, finLocale - performance.now());
  const sec = Math.ceil(reste / 1000);
  barre.hidden = false;
  $('#chronoVal').textContent = sec + 's';
  $('#chronoBar').style.width = Math.max(0, Math.min(100, reste / (dureeTotale || 1) * 100)) + '%';
  barre.classList.toggle('urgent', sec <= 5);
  if (sec <= 5 && sec > 0 && sec !== dernierBip) { dernierBip = sec; SFX.blip(sec === 1 ? 880 : 520, .05); }
  if (sec > 5) dernierBip = null;
}

/* Annonce vocale des changements de phase pour les lecteurs d'écran : sans ça,
   un joueur non voyant ne sait pas que la partie a avancé. */
let dernierePhaseDite = null;
function annoncer(v) {
  const textes = {
    lobby: 'Salle d\'attente', clue: 'Phase des indices, manche ' + v.round,
    debate: 'Phase de discussion', vote: 'Phase de vote',
    reveal: v.elim ? v.elim.name + ' est éliminé' : 'Personne n\'est éliminé',
    guess: 'Mr White tente de deviner le mot',
    end: v.result ? 'Partie terminée' : '',
  };
  const t = textes[v.phase];
  if (!t || t === dernierePhaseDite) return;
  dernierePhaseDite = t;
  $('#annonce').textContent = t;
}

let prev = null;                                  // vue précédente, pour repérer les transitions

function sonsDeTransition(v) {
  const p = prev;
  prev = { phase: v.phase, clues: v.clues.length, currentId: v.currentId, chat: v.chat.length,
           joueurs: v.players.length, elim: v.elim && v.elim.id, round: v.round };
  if (!p) return;
  if (v.phase === 'lobby' && v.players.length > p.joueurs) SFX.join();
  if (v.chat.length > p.chat && !(v.chat[v.chat.length - 1] || {}).mine) SFX.msg();
  if (p.phase === 'lobby' && v.phase === 'clue')           SFX.start();
  if (v.phase === 'clue' && v.clues.length > p.clues)      SFX.clue();
  if (v.phase === 'clue' && v.currentId === v.me && p.currentId !== v.me) SFX.turn();
  if (v.phase === 'vote' && p.phase !== 'vote')            SFX.vote();
  if (v.phase === 'reveal' && p.phase !== 'reveal')        SFX.stamp();
  if (v.phase === 'guess' && p.phase !== 'guess')          SFX.suspense();
  if (v.phase === 'end' && p.phase !== 'end') {
    const moi = v.players.find(x => x.id === v.me);
    const gagne = v.result.winner === 'civils' ? moi && moi.role === 'civil'
                : v.result.winner === 'white'  ? v.result.heroId === v.me
                : moi && moi.role !== 'civil';
    gagne ? SFX.win() : SFX.lose();
  }
}

function render() {
  if (!V) return;
  sonsDeTransition(V);

  if (V.reste == null) { finLocale = null; }
  else { finLocale = performance.now() + V.reste; dureeTotale = (V.minuteur || 0) * 1000 || V.reste; }
  majDecompte();
  clearInterval(minuterieUI);
  if (finLocale !== null) minuterieUI = setInterval(majDecompte, 250);
  document.body.dataset.phase = V.phase;
  annoncer(V);
  if (V.phase === 'end') blurWord = false;      // en fin de partie les mots sont publics
  $('#roomCode').textContent = V.code;
  $('#roomCode').setAttribute('aria-label', 'Code du salon : ' + V.code.split('').join(' '));
  $('#pCount').textContent = V.players.length;
  $('#hostNote').textContent = V.isHost
    ? 'Tu es l\'hôte : la partie vit tant que cet onglet reste ouvert.'
    : 'Partie hébergée par un autre joueur.';
  $('#phaseLbl').textContent = { lobby: 'salon', clue: 'manche ' + V.round, debate: 'discussion', vote: 'vote',
    reveal: 'révélation', guess: 'Mr White', end: 'terminé' }[V.phase] || '';

  /* --- liste des joueurs --- */
  const pl = $('#playerList'); pl.innerHTML = '';
  const tallyMap = {}; (V.tally || []).forEach(t => tallyMap[t.id] = t.n);
  V.players.forEach(p => pl.append(playerRow(p, {
    turn: V.phase === 'clue' && p.id === V.currentId,
    votes: tallyMap[p.id],
    check: V.phase === 'vote' && p.alive && p.hasVoted,
    kick: V.isHost && p.id !== V.me,          // aussi en pleine partie : un gêneur doit pouvoir sortir
  })));

  /* --- ta carte --- */
  const rp = $('#rolePanel');
  rp.hidden = V.phase === 'lobby' || !V.you || !V.you.role;
  if (!rp.hidden) {
    const white = V.you.role === 'white';
    $('#roleTag').textContent = white ? 'Aucun mot' : 'Ton mot';
    $('#roleWord').textContent = white ? '🎩 Mr White' : V.you.word;
    $('#roleCat').textContent = white
      ? 'Écoute les autres et improvise.'
      : (V.cfg.showCat && V.pair?.cat ? 'Catégorie : ' + V.pair.cat : '');
    $('#roleCard').classList.toggle('blur', blurWord);
    $('#btnBlur').textContent = blurWord ? 'Révéler' : 'Caviarder';
  }

  /* --- indices --- */
  const cp = $('#cluePanel'); cp.hidden = !V.clues.length;
  if (!cp.hidden) {
    const cl = $('#clueList'); cl.innerHTML = '';
    let last = null;
    V.clues.forEach(c => {
      if (c.round !== last) { cl.append(el('div', 'rnd', 'Manche ' + c.round)); last = c.round; }
      const d = el('div', 'clue');
      d.append(el('span', 'who', c.name), el('span', 'wd', c.text));
      cl.append(d);
    });
    cl.scrollTop = cl.scrollHeight;
  }

  /* --- transmissions ---
     En salon et en fin de partie, la colonne de droite est saturée (réglages +
     catégories) alors que le centre est presque vide : le chat y déménage.
     En partie c'est l'inverse. Le nœud n'est déplacé que si la zone change,
     pour ne pas interrompre une saisie en cours. */
  const ch = $('#chatPanel'); ch.hidden = false;
  const auCentre = V.phase === 'lobby' || V.phase === 'end';
  const zone = auCentre ? $('.col.center') : $('.col.right');
  if (ch.parentElement !== zone) {
    const avaitFocus = document.activeElement === $('#chatInput');
    const texte = $('#chatInput').value;
    zone.append(ch);
    $('#chatInput').value = texte;
    if (avaitFocus) $('#chatInput').focus();
  }
  ch.classList.toggle('large', auCentre);
  const moi = V.players.find(p => p.id === V.me);
  const muet = moi && !moi.alive && !moi.pending;
  $('#chatNote').textContent = muet ? 'éliminé : lecture seule' : '';
  $('#chatInput').disabled = !!muet;
  $('#chatInput').placeholder = muet ? 'Tu ne peux plus parler' : 'Écrire…';
  const cl2 = $('#chatList');
  cl2.innerHTML = '';
  if (!V.chat.length) cl2.append(el('div', 'mini', 'Aucun message.'));
  V.chat.forEach(m => {
    const d = el('div', 'msg' + (m.mine ? ' mine' : ''));
    const h = new Date(m.ts || Date.now());
    const heure = el('span', 'hr', String(h.getHours()).padStart(2, '0') + ':'
                                + String(h.getMinutes()).padStart(2, '0'));
    heure.title = h.toLocaleString('fr-FR');
    d.append(heure, el('span', 'de', m.name), el('span', 'tx', m.text));
    cl2.append(d);
  });
  /* On recolle au dernier message, sauf si le joueur est remonté lire l'historique.
     (Mesurer la position avant le rendu ne marchait pas : déplacer le panneau
     remet le défilement à zéro et la mesure devenait fausse.) */
  if (cl2.dataset.libre !== '1') cl2.scrollTop = cl2.scrollHeight;
  majDefilementChat();

  /* --- réglages --- */
  const cf = $('#cfgPanel'); cf.hidden = !(V.phase === 'lobby' || V.phase === 'end');
  if (!cf.hidden) {
    $('#vUnder').textContent = V.cfg.under;
    $('#vWhite').textContent = V.cfg.white;
    $('#vCivil').textContent = Math.max(0, V.players.length - V.cfg.under - V.cfg.white);
    const chrono = v => v ? (v >= 60 ? (v % 60 ? (v / 60 | 0) + 'm' + (v % 60) : (v / 60) + 'm') : v + 's') : '—';
    $('#vTClue').textContent = chrono(V.cfg.tClue);
    $('#vTDebate').textContent = chrono(V.cfg.tDebate);
    $('#vTVote').textContent = chrono(V.cfg.tVote);
    $$('#cfgPanel .sw').forEach(s => s.classList.toggle('on', !!V.cfg[s.dataset.t]));
    $('#cfgWho').textContent = V.isHost ? '' : 'réglés par l\'hôte';
    $('#cfgBody').style.opacity = V.isHost ? 1 : .55;
    $('#cfgBody').style.pointerEvents = V.isHost ? 'auto' : 'none';
    const w = $('#cfgWarn'); w.hidden = !V.cfgError; w.textContent = V.cfgError || '';
    const h = $('#cfgHint'); h.hidden = !!V.cfgError || !V.cfgAdvice; h.textContent = V.cfgAdvice || '';
  }

  /* --- catégories --- */
  const cp2 = $('#catPanel'); cp2.hidden = !(V.phase === 'lobby' || V.phase === 'end');
  if (!cp2.hidden) {
    const off = new Set(V.cfg.off || []);
    const dispo = countPairs(V.cfg);
    $('#catCount').textContent = dispo.toLocaleString('fr-FR') + ' paires';
    $('#catBar').style.display = V.isHost ? '' : 'none';
    const cl = $('#catList'); cl.innerHTML = '';
    CATS.forEach(c => {
      const b = el(V.isHost ? 'button' : 'div', 'cat' + (off.has(c.name) ? ' off' : ''));
      b.append(el('span', 'ic', ICONS[c.name] || '▪'), el('span', null, c.name), el('i', null, c.count));
      if (V.isHost) b.onclick = () => send({ t: 'cfg', k: 'cat', v: { name: c.name, on: off.has(c.name) } });
      cl.append(b);
    });
    majFondus(cl);
  }

  /* --- scores --- */
  const sp = $('#scorePanel');
  const scored = V.players.filter(p => p.score > 0);
  sp.hidden = !scored.length;
  if (!sp.hidden) {
    const sl = $('#scoreList'); sl.innerHTML = '';
    [...V.players].sort((a, b) => b.score - a.score).forEach((p, i) => {
      const d = el('div', 'sc');
      d.append(el('span', null, (i === 0 && p.score > 0 ? '👑 ' : '') + p.name), el('b', null, p.score));
      sl.append(d);
    });
  }

  renderStage();
}

/* ---------- zone centrale ---------- */
function renderStage() {
  const st = $('#stage'); st.innerHTML = ''; st.className = 'stage';
  if (V.creux != null) {
    const b = el('div', 'alerte');
    b.append(el('span', null, '⚠'), el('span', null,
      'Plus assez de joueurs connectés. La manche s\'arrête dans ' + Math.ceil(V.creux / 1000) + ' s '
      + 'si personne ne revient.'));
    if (V.isHost) {
      const stop = el('button', 'btn ghost sm', 'Revenir au salon maintenant');
      stop.onclick = () => send({ t: 'abandon' });
      b.append(stop);
    }
    st.append(b);
  }
  if (V.you && V.you.pending && V.phase !== 'lobby' && V.phase !== 'end') {
    const b = el('div', 'attente');
    b.append(el('span', null, '⏳'), el('span', null,
      'Tu observes la manche en cours — tu entres en jeu à la prochaine.'));
    st.append(b);
  }
  const add = (...n) => st.append(...n);
  const me = V.players.find(p => p.id === V.me);

  if (V.phase === 'lobby') {
    st.className = 'stage hero';
    add(el('h2', null, 'Salle d\'attente'));
    add(el('p', 'mini', 'Transmets ce numéro de dossier aux autres agents.'));

    const plate = el('div', 'plate');
    plate.append(el('div', 'lbl', 'N° de dossier'), el('div', 'val', V.code));
    add(plate);

    const cp = el('button', 'btn ghost sm', 'Copier le lien d\'invitation');
    cp.style.maxWidth = '260px'; cp.onclick = () => $('#btnCopy').click();
    add(cp);

    /* les joueurs occupent le centre : la colonne de gauche est masquée en salon.
       On ne montre que les places qu'il reste à pourvoir pour atteindre le
       minimum — pas un nombre fixe, qui laisserait croire à un plafond. */
    const n = V.players.length;
    const manque = Math.max(0, MIN_JOUEURS - n);
    add(el('div', 'count', n + (n > 1 ? ' agents' : ' agent') +
           ` · ${MIN_JOUEURS} minimum, ${MAX_JOUEURS} maximum`));

    const g = el('div', 'pgrid');
    V.players.forEach(p => g.append(playerRow(p, { kick: V.isHost && p.id !== V.me })));
    for (let i = 0; i < manque; i++) {
      const sl = el('div', 'slot');
      sl.append(el('span', 'box'), el('span', null, 'place à pourvoir'));
      g.append(sl);
    }
    add(g);
    if (!manque) add(el('p', 'mini', `Vous pouvez lancer, ou attendre jusqu'à ${MAX_JOUEURS} joueurs.`));

    if (V.isHost) {
      const b = el('button', 'btn mt2', 'Lancer la partie');
      b.disabled = !!V.cfgError;
      b.onclick = () => send({ t: 'start' });
      add(b);
      if (V.cfgError) add(el('div', 'warn', V.cfgError));
    } else add(el('p', 'mini mt2', "En attente du lancement par l'hôte…"));
    return;
  }

  if (V.phase === 'clue') {
    const cur = V.players.find(p => p.id === V.currentId);
    const mine = V.currentId === V.me;

    add(el('div', 'tt', 'Manche ' + V.round + ' — tour ' + (V.turn + 1) + ' sur ' + V.order.length));

    /* piste de passage : qui a parlé, qui parle, qui attend */
    const track = el('div', 'track');
    V.order.forEach((id, k) => {
      const p = V.players.find(x => x.id === id); if (!p) return;
      const st = k < V.turn ? 'done' : k === V.turn ? 'now' : 'next';
      const node = el('div', 'trk ' + st);
      const av = el('span', 'av', st === 'done' ? '✓' : (p.name[0] || '?').toUpperCase());
      if (st !== 'done') av.style.background = avatarColor(p.name);
      node.append(av, el('span', 'nm', p.name));
      track.append(node);
    });
    add(track);

    if (mine) {
      add(art('loupe', 'art art-lg'));
      add(el('h2', null, 'À toi de jouer'));
      add(el('p', 'mini', 'Un mot, ou une très courte phrase — sans jamais prononcer le tien.'));
      const inp = el('input', 'inp'); inp.placeholder = 'Ton indice…'; inp.maxLength = 24;
      const btn = el('button', 'btn', 'Envoyer');
      const go = () => { const t = inp.value.trim(); if (!t) return; send({ t: 'clue', text: t }); inp.value = ''; };
      btn.onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      add(inp, btn);
      setTimeout(() => inp.focus(), 30);
    } else {
      const spot = el('div', 'spot');
      const av = el('div', 'bigav', (cur ? cur.name[0] || '?' : '?').toUpperCase());
      if (cur) av.style.background = avatarColor(cur.name);
      const dots = el('div', 'dots');
      dots.append(el('i'), el('i'), el('i'));
      spot.append(av, dots);
      add(spot);
      add(el('h2', null, (cur ? cur.name : '…') + ' réfléchit'));
      if (V.isHost) {
        const sk = el('button', 'btn ghost sm', 'Passer ' + (cur ? cur.name : 'ce joueur'));
        sk.style.maxWidth = '240px';
        sk.onclick = () => send({ t: 'skip' });
        add(sk);
      }
    }

    /* les indices déjà donnés, posés sur la table */
    const tour = V.clues.filter(c => c.round === V.round);
    if (tour.length) {
      const board = el('div', 'board');
      tour.forEach(c => {
        const card = el('div', 'note');
        card.append(el('span', 'who', c.name), el('span', 'wd', c.text));
        board.append(card);
      });
      add(board);
    }
    return;
  }

  if (V.phase === 'debate') {
    add(art('bulles', 'art art-lg'), el('h2', null, 'Discussion'));
    add(el('p', 'mini', 'Tous les indices de la manche ' + V.round + ' sont donnés. Débattez : qui sonne faux ?'));
    const box = el('div', 'tally');
    V.clues.filter(c => c.round === V.round).forEach(c => {
      const d = el('div', 'sc'); d.append(el('span', null, c.name), el('b', null, c.text)); box.append(d);
    });
    add(box);
    if (V.isHost) { const b = el('button', 'btn mt', 'Ouvrir le vote'); b.onclick = () => send({ t: 'openvote' }); add(b); }
    else add(el('p', 'mini', 'L\'hôte ouvrira le vote quand tout le monde aura parlé.'));
    return;
  }

  if (V.phase === 'vote') {
    const voted = V.you.voted;
    add(art('urne', 'art art-lg'));
    add(el('h2', null, V.tie ? 'Départage' : 'Qui est l\'imposteur ?'));
    add(el('p', 'mini', V.tie ? 'Égalité : le vote se limite aux joueurs concernés.'
                              : 'Tout le monde vote en même temps. Les votes sont révélés à la fin.'));
    if (!V.you.alive) {
      add(el('p', 'mini', V.you.pending
        ? 'Tu entres en jeu à la manche suivante — ce vote ne te concerne pas.'
        : 'Tu es éliminé — tu regardes la suite.'));
    }
    else {
      const g = el('div', 'votegrid');
      V.players.filter(p => p.alive && p.id !== V.me && (!V.tie || V.tie.includes(p.id))).forEach(p => {
        g.append(playerRow(p, { selected: voted === p.id, onClick: q => { send({ t: 'vote', target: q.id }); } }));
      });
      add(g);
      add(el('p', 'mini', voted ? 'Vote enregistré — tu peux encore changer d\'avis.' : 'Choisis un joueur.'));
    }
    const waiting = V.players.filter(p => p.alive && p.connected && !p.hasVoted);
    add(el('p', 'mini', waiting.length ? 'En attente : ' + waiting.map(p => p.name).join(', ') : 'Dépouillement…'));
    if (V.isHost && waiting.length) {
      const cv = el('button', 'btn ghost sm', 'Clore le vote sans les absents');
      cv.style.maxWidth = '280px';
      cv.onclick = () => send({ t: 'closevote' });
      add(cv);
    }
    return;
  }

  if (V.phase === 'reveal') {
    if (!V.elim) {
      add(art('cible', 'art art-lg'), el('h2', null, 'Personne n\'est éliminé'));
      add(el('p', 'mini', 'Égalité persistante — la manche suivante commence.'));
    } else {
      add(art('cible', 'art art-lg'));
      add(el('h2', null, V.elim.name + ' est éliminé'));
      const b = el('div'); b.append(el('span', 'badge ' + ROLE[V.elim.role].cls, ROLE[V.elim.role].label.toUpperCase()));
      add(b);
      add(el('p', 'mini', V.elim.role === 'white' ? 'Il n\'avait aucun mot.' : 'Son mot : ' + V.elim.word));
    }
    /* qui a voté contre qui : de quoi lancer la manche suivante */
    if (V.votes && V.votes.length) {
      const box = el('div', 'scrutin');
      box.append(el('div', 'tt', 'Scrutin'));
      V.votes.forEach(v => {
        const l = el('div', 'bul');
        l.append(el('span', 'de', v.de), el('span', 'fl', '→'),
                 el('span', 'vers' + (v.vers ? '' : ' abs'), v.vers || 'abstention'));
        box.append(l);
      });
      add(box);
    }
    (V.log || []).forEach(l => add(el('p', 'mini', l)));
    if (V.isHost) { const b = el('button', 'btn mt', 'Continuer'); b.onclick = () => send({ t: 'next' }); add(b); }
    else add(el('p', 'mini', 'En attente de l\'hôte…'));
    return;
  }

  if (V.phase === 'guess') {
    const isWhite = V.elim && V.elim.id === V.me;
    add(art('chapeau', 'art art-lg'));
    add(el('h2', null, (V.elim?.name || 'Mr White') + ' tente sa chance'));
    if (isWhite) {
      add(el('p', 'mini', 'Devine le mot des civils pour renverser la partie.'));
      const inp = el('input', 'inp'); inp.placeholder = 'Le mot des civils…'; inp.maxLength = 24;
      const btn = el('button', 'btn', 'Valider');
      const go = () => { const t = inp.value.trim(); if (t) send({ t: 'guess', text: t }); };
      btn.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      add(inp, btn);
      setTimeout(() => inp.focus(), 30);
    } else {
      add(el('p', 'mini', 'S\'il trouve le mot des civils, il gagne la partie à lui seul.'));
      if (V.isHost) { const b = el('button', 'btn ghost mt', 'Passer'); b.onclick = () => send({ t: 'next' }); add(b); }
    }
    return;
  }

  if (V.phase === 'end') {
    const r = V.result;
    const hero = V.players.find(p => p.id === r.heroId);
    const map = {
      civils:     ['🎉', 'Les civils gagnent', 'Tous les imposteurs ont été démasqués.'],
      imposteurs: ['🕵️', 'Les imposteurs gagnent', 'Ils sont assez nombreux pour contrôler le vote.'],
      white:      ['🎩', 'Mr White gagne', (hero ? hero.name : 'Mr White') + ' a deviné le mot des civils.'],
    }[r.winner];
    st.className = 'stage hero';
    add(art(r.winner === 'civils' ? 'medaille' : r.winner === 'white' ? 'chapeau' : 'loupe', 'art art-lg'));
    add(el('h2', null, map[1]), el('p', 'mini', map[2]));
    const t = el('div', 'tally mt');
    const l1 = el('div', 'sc'); l1.append(el('span', null, 'Mot des civils'), el('b', null, V.pair.civil));
    const l2 = el('div', 'sc'); l2.append(el('span', null, 'Mot des Undercover'), el('b', null, V.pair.under));
    t.append(l1, l2); add(t);
    if (V.isHost) {
      const b = el('button', 'btn mt', 'Nouvelle partie');
      b.disabled = !!V.cfgError; b.onclick = () => send({ t: 'again' });
      add(b);
      if (V.cfgError) add(el('div', 'warn', V.cfgError));
    }
    else add(el('p', 'mini', 'L\'hôte peut relancer une partie.'));
    return;
  }
}

/* ---------- interactions locales ---------- */
$('#btnBlur').onclick = () => {
  blurWord = !blurWord;
  $('#roleCard').classList.toggle('blur', blurWord);
  $('#btnBlur').textContent = blurWord ? 'Révéler' : 'Caviarder';
};
$$('#cfgPanel [data-i],#cfgPanel [data-d]').forEach(b => {
  const cle = b.dataset.i || b.dataset.d;
  const nom = { under: 'undercover', white: 'Mr White', tClue: 'minuteur par indice',
                tDebate: 'minuteur de discussion', tVote: 'minuteur de vote' }[cle] || cle;
  b.setAttribute('aria-label', (b.dataset.i ? 'Augmenter ' : 'Diminuer ') + nom);
});
$$('#cfgPanel [data-i],#cfgPanel [data-d]').forEach(b => b.onclick = () => {
  const k = b.dataset.i || b.dataset.d;
  send({ t: 'cfg', k, v: b.dataset.i ? 1 : -1 });      // direction, jamais une valeur
});
$$('#cfgPanel .sw').forEach(s => s.onclick = () => send({ t: 'cfg', k: s.dataset.t, v: !V.cfg[s.dataset.t] }));
$$('#catBar button').forEach(b => b.onclick = () => send({ t: 'cfg', k: 'cats', v: b.dataset.c }));
$('#btnCopy').onclick = async () => {
  const url = location.origin + location.pathname + '?s=' + NET.code;
  try { await navigator.clipboard.writeText(url); toast('Lien d\'invitation copié'); }
  catch { toast('Code du salon : ' + NET.code); }
};
/* Le joueur a-t-il quitté le bas de la liste ? */
/* Les fondus ne doivent apparaître que s'il y a vraiment du contenu caché de ce
   côté-là : appliqués en permanence, ils rognaient le premier et le dernier
   élément de la liste. */
function majFondus(el) {
  if (!el) return;
  el.classList.toggle('defile', el.scrollTop > 4);
  el.classList.toggle('reste', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
}
function majDefilementChat() {
  const el = $('#chatList');
  el.dataset.libre = (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) ? '' : '1';
  majFondus(el);
}
$('#chatList').addEventListener('scroll', majDefilementChat);
$('#catList').addEventListener('scroll', e => majFondus(e.currentTarget));

const envoyerMsg = () => {
  const i = $('#chatInput'), t = i.value.trim();
  if (!t) return;
  send({ t: 'chat', text: t });
  i.value = '';
  $('#chatList').dataset.libre = '';        // en écrivant, on revient au direct
};
$('#chatSend').onclick = envoyerMsg;
$('#chatInput').onkeydown = e => { if (e.key === 'Enter') envoyerMsg(); };

/* Volume : trois crans successifs plutôt qu'un interrupteur brutal. */
function majBoutonSon() {
  const e = SFX.etat(), b = $('#btnSon');
  b.textContent = e.icone;
  b.classList.toggle('off', !SFX.on);
  b.title = 'Volume : ' + e.nom + ' (cliquer pour changer)';
  b.setAttribute('aria-label', 'Volume : ' + e.nom + '. Cliquer pour changer.');
}
$('#btnSon').onclick = () => { const e = SFX.cycler(); majBoutonSon(); toast('Volume : ' + e.nom); };
SFX.niveau = Math.max(0, Math.min(2, lsGet('uc_volume', 2) | 0));   // préférence mémorisée
majBoutonSon();

$('#btnLeave').onclick = () => {
  if (!confirm('Quitter le salon ?')) return;
  oublierEtat();
  location.href = location.pathname;
};
