/* Undercover — illustrations SVG inline. */
/* ============================================================================
   Illustrations : tout est dessiné en SVG inline, aucun fichier externe.
   ============================================================================ */
const ART = {
  /* file d'identification sous le projecteur : deux civils, un suspect au chapeau */
  lineup: `<svg viewBox="0 0 400 170" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="beam" x1="200" y1="0" x2="200" y2="150" gradientUnits="userSpaceOnUse">
        <stop stop-color="#d7a13f" stop-opacity=".30"/><stop offset="1" stop-color="#d7a13f" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M186 4 L214 4 L318 150 L82 150 Z" fill="url(#beam)"/>
    <circle cx="200" cy="6" r="7" fill="#d7a13f" opacity=".85"/>
    <g opacity=".5" fill="#2f394d">
      <circle cx="92" cy="86" r="17"/><path d="M64 150c0-17 13-31 28-31s28 14 28 31z"/>
      <circle cx="308" cy="86" r="17"/><path d="M280 150c0-17 13-31 28-31s28 14 28 31z"/>
    </g>
    <g fill="#0d0f14" stroke="#d7a13f" stroke-width="2.4" stroke-linejoin="round">
      <path d="M170 62h60"/><path d="M180 62c0-11 9-18 20-18s20 7 20 18"/>
      <circle cx="200" cy="86" r="19"/>
      <path d="M168 150c0-19 14-34 32-34s32 15 32 34z"/>
    </g>
    <path d="M191 84h18" stroke="#d8483c" stroke-width="7" stroke-linecap="round"/>
    <path d="M40 150h320" stroke="#2f394d" stroke-width="2"/>
    <g stroke="#2f394d" stroke-width="1.4" opacity=".55">
      <path d="M120 150v-11M160 150v-11M240 150v-11M280 150v-11"/>
    </g>
  </svg>`,

  /* silhouette en filigrane derrière le mot secret */
  ghost: `<svg viewBox="0 0 120 120" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="60" cy="42" r="24"/><path d="M16 120c0-26 20-46 44-46s44 20 44 46z"/>
  </svg>`,

  loupe: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
    <circle cx="21" cy="21" r="13"/><path d="M31 31l11 11"/><path d="M16 21a5 5 0 0 1 5-5"/></svg>`,

  bulles: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 10h26v18H16l-8 7v-7H4z"/><path d="M34 18h10v16h-4v6l-7-6H22"/></svg>`,

  urne: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 22h32v20H8z"/><path d="M16 22V8h16v14"/><path d="M19 15h10" stroke-linecap="round"/>
    <path d="M18 27h12" stroke-linecap="round"/></svg>`,

  cible: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
    <circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><circle cx="24" cy="24" r="2.4" fill="currentColor"/>
    <path d="M24 3v6M24 39v6M3 24h6M39 24h6" stroke-linecap="round"/></svg>`,

  chapeau: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 30V12h20v18"/><path d="M5 30h38v5H5z"/><path d="M14 21h20" stroke="currentColor"/></svg>`,

  dossier: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14l4 5h20v24H5z"/><path d="M13 24h22M13 31h14" stroke-linecap="round"/></svg>`,

  medaille: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 4l6 16M34 4l-6 16"/><circle cx="24" cy="31" r="12"/>
    <path d="M24 25l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" stroke-linecap="round"/></svg>`,
};
function art(name, cls) {
  const d = document.createElement('div');
  d.className = cls || 'art';
  d.innerHTML = ART[name] || '';          // contenu statique, jamais de saisie joueur
  return d;
}
