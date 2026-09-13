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
function avatarColor(name) {
  let h = 2166136261;
  for (const c of name) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `hsl(${Math.abs(h) % 360},68%,66%)`;
}

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
