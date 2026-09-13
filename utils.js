/* Undercover — utilitaires partagés par tous les autres fichiers. */
/* ============================================================================
   UNDERCOVER EN LIGNE — P2P, aucun serveur de jeu.
   Topologie en étoile : l'hôte détient l'état de vérité, les autres envoient
   des actions et reçoivent des vues filtrées (personne ne reçoit le rôle
   des autres tant qu'il n'est pas révélé).
   ============================================================================ */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PREFIX = 'ucvr4-';                       // préfixe des IDs PeerJS
/* Les règles vivent dans rules.js : fonctions pures, vérifiées par tests.html. */
const R = window.UC_RULES;
const { MIN_JOUEURS, MAX_JOUEURS } = R;
const ALPHA  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------- mots (construits dans words.js) ---------- */
const WORDS = window.UC_WORDS || [];

/* Catégories disponibles, avec leur nombre de paires, les plus fournies d'abord.
   Chaque navigateur charge le même words.js : tout le monde calcule la même
   liste, seule la sélection de l'hôte transite sur le réseau. */
const CATS = (() => {
  const n = {};
  WORDS.forEach(w => { n[w.cat] = (n[w.cat] || 0) + 1; });
  return Object.entries(n).map(([name, count]) => ({ name, count }))
                          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
})();

/* Une icône par catégorie, pour les pastilles de la liste. */
const ICONS = window.UC_ICONS || {};

/* Nombre de paires encore tirables avec les réglages courants. */
const countPairs = cfg => R.poolFor(WORDS, cfg).length;

/* ---------- petits outils ---------- */
/* Pseudos et indices : une seule espace, sans bords, 24 caractères au plus. */
const clean = s => (s || '').toString().replace(/\s+/g, ' ').trim().slice(0, 24);
const rid   = () => Math.random().toString(36).slice(2, 10);
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* Teinte stable tirée du pseudo (FNV-1a) : chacun garde sa couleur d'une
   partie à l'autre, sans qu'on ait à la stocker. */
function teinteDe(name) {
  let h = 2166136261;
  for (const c of name) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 360;
}
const couleurHsl = t => `hsl(${t},68%,66%)`;
const avatarColor = name => couleurHsl(teinteDe(name));

/* ---------- palette d'une partie ----------
   La teinte seule ne suffit pas : « Halambic », « Halambic² » et « Halambic3 »
   se ressemblent assez pour tomber sur des verts indistinguables, et on ne
   reconnaît plus personne d'un coup d'œil. On écarte donc les teintes trop
   proches, dans l'ordre de la liste : le premier arrivé garde la sienne, seul
   celui qui arrive en collision est décalé. Les joueurs déjà là ne changent
   pas de couleur quand quelqu'un rejoint.

   Tout le monde reçoit la même liste dans le même ordre, donc tout le monde
   calcule la même palette — rien ne transite sur le réseau. */
let PALETTE = new Map(), clePalette = null;

const ecartTeinte = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function majPalette(noms) {
  const cle = noms.join('\u0000');
  if (cle === clePalette) return PALETTE;
  clePalette = cle;
  /* Écart minimal : large à quelques joueurs, resserré quand le salon se
     remplit — à 20 joueurs il ne reste que 18° par personne de toute façon. */
  const mini = Math.min(42, 340 / Math.max(1, noms.length));
  const prises = [];
  PALETTE = new Map();
  noms.forEach(nom => {
    let t = teinteDe(nom);
    for (let k = 0; k < 360 && prises.some(p => ecartTeinte(p, t) < mini); k++) t = (t + 1) % 360;
    prises.push(t);
    PALETTE.set(nom, couleurHsl(t));
  });
  return PALETTE;
}

/* Couleur à afficher pour un joueur. Retombe sur la teinte brute si la palette
   n'a pas encore été calculée (écran d'accueil, par exemple). */
const couleurDe = nom => PALETTE.get(nom) || avatarColor(nom);

/* ---------- messages à l'écran ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
}
function overlay(em, title, sub) {
  $('#ovEm').textContent = em; $('#ovTitle').textContent = title; $('#ovSub').textContent = sub || '';
  $('#overlay').hidden = false;
}
$('#ovBtn').onclick = () => location.href = location.pathname;
