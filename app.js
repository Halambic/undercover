/* Undercover — démarrage : écran d'accueil, création et arrivée dans un salon. */
/* ============================================================================
   ACCUEIL
   ============================================================================ */
function enterGame() {
  document.body.classList.add('playing');
  if (NET.isHost) { V = viewFor(HOST_ID); render(); }
}
function busy(on, msg) {
  $('#btnCreate').disabled = on; $('#btnJoin').disabled = on;
  $('#homeMsg').textContent = msg || '';
}
function myName() {
  const n = clean($('#nameInput').value);
  if (!n) { $('#nameInput').focus(); toast('Choisis un pseudo'); return null; }
  lsSet('uc_name', n); return n;
}
function netError(e) {
  const t = e && (e.type || e.message);
  if (t === 'peer-unavailable') return 'Aucun salon avec ce code.';
  if (t === 'unreachable')      return 'Salon introuvable ou hôte déconnecté.';
  if (t === 'browser-incompatible') return 'Ton navigateur ne gère pas le P2P (WebRTC).';
  if (t === 'timeout' || t === 'network') return 'Connexion au service de mise en relation impossible.';
  return 'Connexion impossible. Réessaie.';
}

$('#btnCreate').onclick = async () => {
  SFX.unlock();
  const n = myName(); if (!n) return;
  busy(true, 'Ouverture du salon…');
  try { await createRoom(n); }
  catch (e) { busy(false, netError(e)); }
};
$('#btnJoin').onclick = async () => {
  SFX.unlock();
  const n = myName(); if (!n) return;
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { $('#codeInput').focus(); return toast('Le code fait 4 lettres'); }
  busy(true, 'Connexion au salon…');
  try { await joinRoom(code, n); }
  catch (e) { busy(false, netError(e)); }
};
$('#codeInput').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
$('#codeInput').onkeydown = e => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#nameInput').onkeydown = e => { if (e.key === 'Enter') ($('#codeInput').value ? $('#btnJoin') : $('#btnCreate')).click(); };

$('#artHero').append(art('lineup', 'art'));
$('#artGhost').append(art('ghost', 'art'));

/* une partie interrompue attend peut-être d'être reprise */
(() => {
  const sv = sauvegardeDispo();
  if (!sv) return;
  const box = $('#reprise');
  box.hidden = false;
  $('#repriseTxt').textContent = 'Dossier ' + sv.code + ' interrompu ('
    + sv.etat.players.length + ' joueurs, manche ' + sv.etat.round + ').';
  $('#btnReprendre').onclick = async () => {
    SFX.unlock(); busy(true, 'Reprise du dossier…');
    try { if (!await reprendreRoom()) busy(false, 'Reprise impossible, le code est occupé.'); }
    catch (e) { busy(false, netError(e)); }
  };
  $('#btnOublier').onclick = () => { oublierEtat(); box.hidden = true; };
})();

/* préremplissage : pseudo mémorisé + code passé dans l'URL (?s=ABCD) */
$('#nameInput').value = lsGet('uc_name', '') || '';
const urlCode = new URLSearchParams(location.search).get('s');
if (urlCode) { $('#codeInput').value = urlCode.toUpperCase().slice(0, 4); $('#homeMsg').textContent = 'Salon ' + $('#codeInput').value + ' — entre ton pseudo et rejoins.'; }
if (!window.Peer) $('#homeMsg').textContent = 'Le module réseau n\'a pas pu être chargé (connexion ou bloqueur ?).';
window.addEventListener('beforeunload', e => {
  if (NET.isHost && S && S.phase !== 'lobby' && S.phase !== 'end') { e.preventDefault(); e.returnValue = ''; }
});
