/* Undercover — rendu de l'interface. Ne décide de rien : affiche la vue reçue. */
/* ============================================================================
   RENDU
   ============================================================================ */
let blurWord = false;

/* Recherche de catégorie : purement locale à chaque navigateur, elle ne touche
   pas aux réglages. `R.norm` ignore accents, casse et ponctuation, donc « ecole »
   trouve « École ». */
let filtreCat = '';
const catsVisibles = () => {
  const q = R.norm(filtreCat);
  return q ? CATS.filter(c => R.norm(c.name).includes(q)) : CATS;
};

/* Le seuil est le même que celui de la feuille de style : au-delà, les
   colonnes s'empilent au lieu de se juxtaposer. */
const etroit = () => window.matchMedia('(max-width:1080px)').matches;

function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

function playerRow(p, o = {}) {
  const row = el(o.onClick ? 'button' : 'div', 'pl');
  if (!p.alive) row.classList.add(p.pending ? 'waiting' : 'dead');
  if (p.id === V.me) row.classList.add('me');
  if (o.turn) row.classList.add('turn');
  if (o.selected) row.classList.add('sel');
  const av = el('span', 'av', (p.name[0] || '?').toUpperCase());
  av.style.background = couleurDe(p.name);
  const nm = el('span', 'nm', p.name + (p.id === V.me ? ' (toi)' : ''));
  row.append(av, nm);
  if (p.pending) row.append(el('span', 'badge b-wait', 'prochaine partie'));
  else if (p.role && ROLE[p.role]) row.append(el('span', 'badge ' + ROLE[p.role].cls, ROLE[p.role].label));
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

/* ---------- alerte quand l'onglet est en arrière-plan ----------
   Les sons existent déjà, mais on ne les entend pas toujours — volume coupé,
   casque enlevé, autre application par-dessus. Et quand on est sur un autre
   onglet, on ne regarde pas le jeu : on regarde la barre d'onglets. Le titre
   de la page devient donc le signal. */
const TITRE = document.title;
let tourEnAttente = false, msgNonLus = 0, clignotant = null, titreAlterne = false;

/* La partie est-elle bloquée sur MOI ? C'est le seul cas qui mérite qu'on
   réclame l'attention : les autres attendent. Prend un INSTANTANÉ (celui que
   `prev` conserve), pas une vue — `elim` y est déjà réduit à un identifiant. */
const bloqueSurMoi = s => !!s && ((s.phase === 'clue' && s.currentId === s.me)
                               || (s.phase === 'guess' && s.elim === s.me));

function texteAlerte() {
  if (tourEnAttente) return '▶ À toi de jouer !';
  if (msgNonLus) return '(' + msgNonLus + ') message' + (msgNonLus > 1 ? 's' : '');
  return null;
}

function majAlerte() {
  const t = texteAlerte();
  if (!t) {
    clearInterval(clignotant); clignotant = null;
    document.title = TITRE;
    return;
  }
  document.title = t;
  /* Alternance lente : un titre figé se remarque moins qu'un titre qui bouge,
     et clignoter plus vite serait pénible. Les navigateurs bridant les minuteurs
     des onglets cachés à une seconde, inutile de descendre plus bas. */
  if (!clignotant) {
    clignotant = setInterval(() => {
      const a = texteAlerte();
      if (!a) return majAlerte();
      titreAlterne = !titreAlterne;
      document.title = titreAlterne ? TITRE : a;
    }, 1300);
  }
}

function oublierAlerte() {
  if (!tourEnAttente && !msgNonLus) return;
  tourEnAttente = false; msgNonLus = 0;
  majAlerte();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) oublierAlerte(); });
window.addEventListener('focus', oublierAlerte);

let prev = null;                                  // vue précédente, pour repérer les transitions

function sonsDeTransition(v) {
  const p = prev;
  prev = { phase: v.phase, clues: v.clues.length, currentId: v.currentId, chatN: v.chatN || 0,
           joueurs: v.players.length, elim: v.elim && v.elim.id, round: v.round, me: v.me };
  if (!p) return;
  const nouveauxMsg = Math.max(0, (v.chatN || 0) - p.chatN);
  const deMoi = (v.chat[v.chat.length - 1] || {}).mine;
  if (v.phase === 'lobby' && v.players.length > p.joueurs) SFX.join();
  if (nouveauxMsg && !deMoi) SFX.msg();
  /* Alerte d'arrière-plan : on ne la déclenche que si l'onglet n'est pas visible. */
  if (document.hidden) {
    if (nouveauxMsg && !deMoi) msgNonLus += nouveauxMsg;
    if (bloqueSurMoi(prev) && !bloqueSurMoi(p)) tourEnAttente = true;
    majAlerte();
  }
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
  majPalette(V.players.map(p => p.name));   // couleurs distinctes avant tout tracé

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

  /* --- ta carte ---
     Sur un écran étroit les colonnes s'empilent et la carte, en bas de la
     colonne de droite, tombait sous la ligne de flottaison : il fallait
     défiler pour relire son propre mot, la chose qu'on regarde le plus
     souvent. On la remonte donc devant la scène. Même mécanique que le chat :
     le nœud n'est déplacé que si la zone change. */
  const rp = $('#rolePanel');
  const zoneRole = etroit() ? $('.col.center') : $('.col.right');
  if (rp.parentElement !== zoneRole) zoneRole.prepend(rp);
  rp.hidden = V.phase === 'lobby' || !V.you || !V.you.role;
  if (!rp.hidden) {
    const white = V.you.role === 'white';
    const secret = V.you.role === R.ROLE_SECRET;
    $('#roleTag').textContent = white ? 'Aucun mot' : 'Ton mot';
    $('#roleWord').textContent = white ? '🎩 Mr White' : V.you.word;
    /* Sous le mot : la catégorie si l'option est active, sinon — en rôle caché —
       le rappel qu'on ignore son propre camp. Les deux ne se cumulent pas. */
    const indice = V.cfg.showCat && V.pair?.cat ? 'Catégorie : ' + V.pair.cat : '';
    $('#roleCat').textContent = white
      ? 'Écoute les autres et improvise.'
      : (indice || (secret ? 'Civil ou Undercover ? À toi de le deviner.' : ''));
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
  /* La règle est tranchée par rules.js et voyage dans la vue : l'interface ne
     la redécide pas dans son coin. */
  const muet = !!V.muet;
  $('#chatNote').textContent = muet ? 'éliminé : lecture seule' : '';
  $('#chatInput').disabled = muet;
  $('#chatInput').placeholder = muet ? 'Tu ne peux plus parler' : 'Écrire…';
  $('#btnEmoji').disabled = muet;
  $('#btnGif').disabled = muet;
  if (muet) { ouvrirEmoji(false); ouvrirGif(false); }
  const cl2 = $('#chatList');
  cl2.innerHTML = '';
  if (!V.chat.length) cl2.append(el('div', 'mini', 'Aucun message.'));
  V.chat.forEach(m => {
    const d = el('div', 'msg' + (m.mine ? ' mine' : ''));
    const h = new Date(m.ts || Date.now());
    const heure = el('span', 'hr', String(h.getHours()).padStart(2, '0') + ':'
                                + String(h.getMinutes()).padStart(2, '0'));
    heure.title = h.toLocaleString('fr-FR');
    d.append(heure, el('span', 'de', m.name));
    if (m.gif && m.gif.url) d.append(imageChat(m.gif)); else d.append(el('span', 'tx', m.text));
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

  /* --- catégories ---
     À droite, sous les dix lignes de réglages, il ne restait que 150 px : huit
     catégories visibles sur 184. En salon la colonne de gauche n'affiche plus la
     liste des joueurs (elle est dans la scène) — le panneau y déménage et récupère
     une colonne entière. Sur écran étroit tout s'empile : il reste où il est. */
  const cp2 = $('#catPanel'); cp2.hidden = !(V.phase === 'lobby' || V.phase === 'end');
  const auLarge = !cp2.hidden && !etroit();
  const zoneCat = auLarge ? $('.col.left') : $('.col.right');
  if (cp2.parentElement !== zoneCat) {
    /* à droite, il reprend sa place entre les réglages et les scores */
    auLarge ? zoneCat.append(cp2) : zoneCat.insertBefore(cp2, $('#scorePanel'));
  }
  if (!cp2.hidden) {
    const off = new Set(V.cfg.off || []);
    const dispo = countPairs(V.cfg);
    $('#catCount').textContent = R.norm(filtreCat)
      ? catsVisibles().length + ' sur ' + CATS.length
      : dispo.toLocaleString('fr-FR') + ' paires';
    $('#catBar').style.display = V.isHost ? '' : 'none';
    const vues = catsVisibles();
    const cl = $('#catList'); cl.innerHTML = '';
    if (!vues.length) cl.append(el('div', 'vide', 'Aucune catégorie ne correspond.'));
    vues.forEach(c => {
      const b = el(V.isHost ? 'button' : 'div', 'cat' + (off.has(c.name) ? ' off' : ''));
      b.append(el('span', 'ic', ICONS[c.name] || '▪'), el('span', null, c.name), el('i', null, c.count));
      if (V.isHost) b.onclick = () => send({ t: 'cfg', k: 'cat', v: { name: c.name, on: off.has(c.name) } });
      cl.append(b);
    });
    majFondus(cl);
    /* Quand on cherche, les boutons groupés ne portent que sur ce qui est
       affiché — sinon « Aucune » après une recherche viderait toute la banque
       alors qu'on voulait juste écarter trois catégories. Le libellé le dit. */
    const filtre = !!R.norm(filtreCat);
    $('#catClear').hidden = !filtre;
    /* Le suffixe « (5) » sur chaque bouton les faisait passer à la ligne : la
       portée s'écrit une seule fois, en dessous. */
    const p = $('#catScope');
    p.hidden = !filtre;
    p.textContent = filtre
      ? 'Ces trois boutons ne portent que sur les ' + vues.length + ' catégories affichées.'
      : '';
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

/* Exclure quelqu'un ne doit pas être définitif : l'hôte garde la liste sous les
   yeux et peut rouvrir la porte d'un clic. Affiché partout où l'on peut exclure
   — salon ET écran de fin — sans quoi on peut sortir un joueur sans pouvoir le
   rappeler. */
function paveExclus(add) {
  if (!V.isHost || !V.bannis || !V.bannis.length) return;
  const box = el('div', 'exclus');
  box.append(el('div', 'tt', V.bannis.length > 1 ? 'Joueurs exclus' : 'Joueur exclu'));
  V.bannis.forEach(x => {
    const l = el('div', 'exc');
    const r = el('button', 'btn ghost sm', 'Réadmettre');
    r.onclick = () => send({ t: 'readmettre', token: x.token });
    l.append(el('span', null, x.name), r);
    box.append(l);
  });
  box.append(el('p', 'mini', 'Il devra rouvrir le lien d\'invitation pour revenir.'));
  add(box);
}

/* Le salon affiche le numéro de dossier en grand ; l'écran de fin, lui, ne
   montrait que le résultat. On pouvait donc finir une partie sans aucun moyen
   visible de faire venir quelqu'un pour la suivante — alors que rejoindre à ce
   moment-là marche très bien, et sans passer par la case spectateur. */
/* Prévenir avant de relancer : un joueur hors ligne ne recevra pas de rôle. */
function paveAbsents(add) {
  const a = V.absents || [];
  if (!a.length) return;
  add(el('p', 'mini warn-doux',
    (a.length > 1 ? a.join(', ') + ' sont hors ligne : ils regarderont' : a[0] + ' est hors ligne : il regardera')
    + ' cette partie et entrera à la suivante.'));
}

function paveInvitation(add) {
  const box = el('div', 'invite');
  const t = el('div', 'tt');
  t.append(document.createTextNode('Dossier '), el('b', null, V.code));
  box.append(t);
  const cp = el('button', 'btn ghost sm', 'Copier le lien d\'invitation');
  cp.onclick = () => $('#btnCopy').click();      // une seule logique de copie
  box.append(cp);
  box.append(el('p', 'mini', 'Qui arrive maintenant joue la prochaine partie, sans attendre.'));
  add(box);
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
      'Tu observes la partie en cours — tu entres en jeu à la prochaine.'));
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

    paveExclus(add);

    paveAbsents(add);
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
      if (st !== 'done') av.style.background = couleurDe(p.name);
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
      /* On ne vide pas le champ : si l'indice est refusé, le joueur doit
         retrouver sa saisie pour la corriger. Quand il passe, le tour change et
         la scène est redessinée de toute façon. */
      const go = () => { const t = inp.value.trim(); if (t) send({ t: 'clue', text: t }); };
      btn.onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      add(inp, btn);
      setTimeout(() => inp.focus(), 30);
    } else {
      const spot = el('div', 'spot');
      const av = el('div', 'bigav', (cur ? cur.name[0] || '?' : '?').toUpperCase());
      if (cur) av.style.background = couleurDe(cur.name);
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
        ? 'Tu entres en jeu à la prochaine partie — ce vote ne te concerne pas.'
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
      /* Le mot n'est pas transmis avant la fin (voir projeter) : on ne l'affiche
         que s'il est là, et on dit pourquoi le reste du temps. */
      add(el('p', 'mini',
        V.elim.role === 'white' ? 'Il n\'avait aucun mot.'
        : V.elim.word ? 'Son mot : ' + V.elim.word
        : 'Les mots seront dévoilés à la fin de la partie.'));
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
    paveAbsents(add);
    paveInvitation(add);
    paveExclus(add);
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
$$('#catBar button').forEach(b => b.onclick = () =>
  send({ t: 'cfg', k: 'cats', v: { action: b.dataset.c, noms: catsVisibles().map(c => c.name) } }));

/* La saisie vit hors de #catList, qui est reconstruit à chaque vue : le curseur
   et le focus ne bougent pas pendant qu'on tape. */
$('#catSearch').oninput = e => { filtreCat = e.target.value; if (V) render(); };
$('#catSearch').onkeydown = e => {
  if (e.key === 'Escape') { filtreCat = ''; e.target.value = ''; if (V) render(); }
};
$('#catClear').onclick = () => {
  filtreCat = ''; $('#catSearch').value = ''; $('#catSearch').focus(); if (V) render();
};
$('#btnCopy').onclick = async () => {
  const url = location.origin + location.pathname + '?s=' + NET.code;
  try { await navigator.clipboard.writeText(url); toast('Lien d\'invitation copié'); }
  catch { toast('Code du salon : ' + NET.code); }
};
/* Le joueur a-t-il quitté le bas de la liste ? */
/* Les fondus ne doivent apparaître que s'il y a vraiment du contenu caché de ce
   côté-là : appliqués en permanence, ils rognaient le premier et le dernier
   élément de la liste. */
/* Passer de l'empilement aux colonnes change la place de la carte de rôle :
   il faut redessiner, mais pas à chaque pixel de redimensionnement. */
let redessin = null;
window.addEventListener('resize', () => {
  clearTimeout(redessin);
  redessin = setTimeout(() => { if (V) render(); }, 150);
});

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

/* ---------- sélecteur d'emoji ----------
   Pas de drapeaux : leur tranche de police pèse 709 Ko à elle seule, et on ne
   les utilise jamais en soirée. Ils restent tapables au clavier, et la tranche
   ne se télécharge alors que chez celui qui en met un. */
const EMOJIS = [
  ['Visages', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 🤨 😐 😑 😏 😒 🙄 😬 😴 🤤 😷 🤒 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😨 😰 😥 😢 😭 😱 😖 😣 😞 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖'],
  ['Gestes',  '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 💪 👀 👂 👃 🧠 🫡 🤷 🤦 🙌 👏'],
  ['Cœurs',   '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 💬 💭'],
  ['Enquête', '🕵️ 🎩 🔍 🔎 🗝️ 🔑 🚨 ⏳ ⌛ ⏰ 🎲 🃏 🎯 🏆 🥇 🥈 🥉 👑 🎉 🎊 ✨ ⭐ 🌟 💡 🔥 ❄️ ⚡ ☠️ 📌 📢'],
  ['Divers',  '🍕 🍔 🍟 🌭 🍿 🍺 🍻 🥂 ☕ 🍰 🎂 🍫 🐶 🐱 🦊 🐻 🐼 🦁 🐸 🦄 🐔 🐧 🌍 🌙 ☀️ 🌈 🎮 🎧 🎤 ⚽ 🏀 🚗 ✈️ 🚀 💻 📱'],
];

let paletteFaite = false;
function construirePalette() {
  if (paletteFaite) return;
  paletteFaite = true;
  const p = $('#emojiPanel');
  EMOJIS.forEach(([famille, liste]) => {
    p.append(el('div', 'fam', famille));
    const g = el('div', 'grille');
    liste.split(' ').forEach(e => {
      const b = el('button', null, e);
      b.type = 'button';
      b.setAttribute('aria-label', 'Insérer ' + e);
      b.onclick = () => insererEmoji(e);
      g.append(b);
    });
    p.append(g);
  });
}

/* Insertion à l'endroit du curseur, pas bêtement à la fin : on veut pouvoir
   glisser un emoji au milieu d'une phrase déjà tapée. */
function insererEmoji(e) {
  const i = $('#chatInput');
  if (i.disabled) return;
  const d = i.selectionStart ?? i.value.length;
  const f = i.selectionEnd ?? d;
  const suite = i.value.slice(0, d) + e + i.value.slice(f);
  if (suite.length > 200) return toast('Message trop long');
  i.value = suite;
  const pos = d + e.length;
  i.focus();
  try { i.setSelectionRange(pos, pos); } catch {}
}

function ouvrirEmoji(on) {
  const p = $('#emojiPanel'), b = $('#btnEmoji');
  if (on) construirePalette();
  p.hidden = !on;
  b.classList.toggle('on', on);
  b.setAttribute('aria-expanded', on ? 'true' : 'false');
}

$('#btnEmoji').onclick = e => { e.stopPropagation(); ouvrirEmoji($('#emojiPanel').hidden); };
/* Un clic ailleurs referme — sauf dans la palette elle-même, sinon on ne pourrait
   en poser qu'un seul. */
document.addEventListener('click', e => {
  if (!$('#emojiPanel').hidden && !e.target.closest('#emojiPanel,#btnEmoji')) ouvrirEmoji(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#emojiPanel').hidden) { ouvrirEmoji(false); $('#chatInput').focus(); }
});

/* ---------- sélecteur de GIF ----------
   Le catalogue vient de GIPHY, qui réclame une clé. Sans clé le bouton
   n'apparaît pas : mieux vaut aucun bouton qu'un bouton qui échoue.
   (Tenor a fermé son API le 30 juin 2026.)
   L'adresse choisie est refiltrée par l'hôte (R.gifValide) — ce qui part d'ici
   n'est jamais cru sur parole. */

const GIPHY = (window.UC_GIF || {});
const gifActif = () => !!(GIPHY.cle || '').trim();

/* Une clé gratuite ne donne que 100 requêtes par heure, partagées par TOUS les
   joueurs du site. On garde donc chaque réponse : rouvrir le panneau ou refaire
   une recherche déjà faite ne coûte plus rien. */
const gifCache = new Map();

/* La vignette « fixed_width » fait 200 px de large, quelques dizaines de Ko ;
   le chat est une colonne étroite, inutile d'y verser le GIF d'origine. */
function giphyVers(donnees) {
  return (donnees || []).map(r => {
    const im = r.images || {};
    const m = im.fixed_width || im.downsized || im.original;
    if (!m || !m.url) return null;
    return { url: m.url, w: +m.width || 0, h: +m.height || 0, alt: r.title || 'GIF' };
  }).filter(Boolean);
}

let gifJeton = 0;                             // annule les réponses dépassées
async function chercherGifs(q) {
  const grille = $('#gifGrid'), note = $('#gifNote');
  const moi = ++gifJeton;

  if (gifCache.has(q)) return afficherGifs(gifCache.get(q), q, moi);

  note.textContent = 'Recherche…';
  const p = new URLSearchParams({
    api_key: GIPHY.cle, limit: '24', rating: GIPHY.filtre || 'pg-13',
    lang: 'fr', bundle: 'messaging_non_clips',
  });
  if (q) p.set('q', q);
  try {
    const rep = await fetch('https://api.giphy.com/v1/gifs/' + (q ? 'search' : 'trending') + '?' + p);
    if (rep.status === 429) throw new Error('quota');
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    const data = await rep.json();
    const liste = giphyVers(data.data);
    gifCache.set(q, liste);
    afficherGifs(liste, q, moi);
  } catch (err) {
    if (moi !== gifJeton) return;
    grille.innerHTML = '';
    note.textContent = err.message === 'quota'
      ? 'GIPHY est saturé — réessaie dans quelques minutes.'
      : 'GIPHY est injoignable.';
    console.warn('GIPHY :', err);
  }
}

function afficherGifs(liste, q, moi) {
  if (moi !== gifJeton) return;               // une frappe plus récente a pris la main
  const grille = $('#gifGrid'), note = $('#gifNote');
  grille.innerHTML = '';
  if (!liste.length) { note.textContent = 'Aucun GIF pour « ' + q + ' ».'; return; }
  note.textContent = 'via GIPHY';             // marque d'attribution exigée par GIPHY
  liste.forEach(g => {
    const b = el('button', 'gifcell');
    b.type = 'button';
    b.title = g.alt;
    b.setAttribute('aria-label', 'Envoyer : ' + g.alt);
    const i = new Image();
    i.src = g.url; i.alt = g.alt; i.loading = 'lazy';
    b.append(i);
    b.onclick = () => envoyerGif(g);
    grille.append(b);
  });
}

function envoyerGif(g) {
  send({ t: 'gif', gif: g });
  ouvrirGif(false);
  $('#chatList').dataset.libre = '';
  $('#chatInput').focus();
}

/* Une image reçue : on réserve sa place AVANT qu'elle n'arrive, sinon le chat
   saute d'un cran à chaque chargement et on perd sa ligne de lecture.
   L'attribut width d'une image est écrasé par le CSS (`width:auto`) tant
   qu'elle n'est pas chargée : il faut une largeur ferme + `aspect-ratio`.

   PAS de `loading="lazy"` ici, contrairement à la grille de recherche. Dans un
   conteneur qui défile lui-même, la heuristique du navigateur s'est montrée
   peu fiable : des GIF pourtant dans le champ de vision ne se chargeaient
   jamais et restaient blancs pour toujours. Le fil plafonne à 60 messages et
   les vignettes font 200 px — le chargement différé n'y gagnait presque rien
   et coûtait une panne visible. */
const GIF_L = 180, GIF_H = 160;               // bornes d'affichage dans le fil

function imageChat(g) {
  const a = el('a', 'gifmsg');
  a.href = g.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  const i = new Image();
  i.alt = g.alt || 'GIF';
  if (g.w && g.h) {
    /* largeur telle que la hauteur reste sous la borne */
    const l = Math.round(Math.min(GIF_L, g.w, g.w * GIF_H / g.h));
    i.style.width = l + 'px';
    i.style.aspectRatio = g.w + ' / ' + g.h;
  }
  i.src = g.url;
  /* Le chat recolle au dernier message ; une image sans dimensions connues
     grandit après coup et décalerait ce calage. On le refait une fois posée. */
  i.onload = () => { const c = $('#chatList'); if (c.dataset.libre !== '1') c.scrollTop = c.scrollHeight; };
  a.append(i);
  return a;
}

let gifMinuteur = null;
function ouvrirGif(on) {
  const p = $('#gifPanel'), b = $('#btnGif');
  if (on && !gifActif()) return;
  p.hidden = !on;
  b.classList.toggle('on', on);
  b.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) { ouvrirEmoji(false); $('#gifSearch').focus(); chercherGifs($('#gifSearch').value.trim()); }
}

if (gifActif()) {
  $('#btnGif').hidden = false;
  $('#btnGif').onclick = e => { e.stopPropagation(); ouvrirGif($('#gifPanel').hidden); };
  /* On attend une pause de frappe : une requête par lettre épuiserait le quota
     en une soirée. */
  $('#gifSearch').oninput = () => {
    clearTimeout(gifMinuteur);
    gifMinuteur = setTimeout(() => chercherGifs($('#gifSearch').value.trim()), 350);
  };
  $('#gifSearch').onkeydown = e => { if (e.key === 'Enter') { clearTimeout(gifMinuteur); chercherGifs($('#gifSearch').value.trim()); } };
  $('#gifClear').onclick = () => { $('#gifSearch').value = ''; $('#gifSearch').focus(); chercherGifs(''); };
  document.addEventListener('click', e => {
    if (!$('#gifPanel').hidden && !e.target.closest('#gifPanel,#btnGif')) ouvrirGif(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#gifPanel').hidden) { ouvrirGif(false); $('#chatInput').focus(); }
  });
}

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
