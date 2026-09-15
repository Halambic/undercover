/* Undercover — effets sonores. Chargé après utils.js. */
/* ============================================================================
   SFX — tout est synthétisé à la volée (oscillateurs + bruit filtré).
   Aucun fichier audio, rien à télécharger, et surtout aucun son "par défaut" :
   la palette est sombre et sèche, dans le ton du jeu.
   ============================================================================ */
const SFX = {
  ctx: null, master: null,
  /* Trois niveaux plutôt qu'un interrupteur : en soirée on veut souvent baisser
     sans couper. 0 = muet. Relu au démarrage depuis le navigateur. */
  NIVEAUX: [{ nom: 'coupé', v: 0, icone: '✕' },
            { nom: 'doux',  v: 0.10, icone: '♪' },
            { nom: 'fort',  v: 0.24, icone: '♪♪' }],
  niveau: 2,
  get on() { return this.NIVEAUX[this.niveau].v > 0; },

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.NIVEAUX[this.niveau].v;
    this.master.connect(this.ctx.destination);
  },
  unlock() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  /* Descend d'un cran (fort → doux → coupé), puis repart en haut. */
  cycler() {
    this.niveau = (this.niveau + this.NIVEAUX.length - 1) % this.NIVEAUX.length;
    lsSet('uc_volume', this.niveau);
    if (this.ctx && this.master) this.master.gain.value = this.NIVEAUX[this.niveau].v;
    if (this.on) { this.unlock(); this.blip(660, .06); }
    return this.NIVEAUX[this.niveau];
  },
  etat() { return this.NIVEAUX[this.niveau]; },

  /* brique : oscillateur avec enveloppe */
  tone({ f = 440, f2, type = 'sine', t = 0, dur = .2, vol = .5, glide = 'exp' }) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime + t;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2) glide === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + dur)
                            : o.frequency.linearRampToValueAtTime(f2, now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + Math.min(.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(.0001, now + dur);
    o.connect(g).connect(this.master); o.start(now); o.stop(now + dur + .05);
  },

  /* brique : bruit filtré (frottement, tampon, souffle) */
  noise({ t = 0, dur = .18, vol = .4, type = 'bandpass', f = 1200, q = 1, f2 }) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime + t, len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type;
    flt.frequency.setValueAtTime(f, now); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f2), now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(.0001, now + dur);
    src.connect(flt).connect(g).connect(this.master); src.start(now); src.stop(now + dur);
  },

  /* message reçu : discret, il peut y en avoir beaucoup */
  msg() { this.tone({ f: 880, type: 'sine', dur: .05, vol: .12 }); },
  /* refus d'un indice : deux notes qui descendent, sèches, sans dramatiser */
  refus() { this.tone({ f: 330, type: 'triangle', dur: .07, vol: .28 });
            this.tone({ f: 247, type: 'triangle', t: .07, dur: .10, vol: .26 }); },

  blip(f, dur) { this.tone({ f, f2: f * 1.05, type: 'sine', dur: dur || .07, vol: .35 }); },

  /* un agent rejoint le salon : petit signal discret */
  join()  { this.tone({ f: 520, f2: 700, type: 'sine', dur: .10, vol: .3 });
            this.tone({ f: 780, type: 'sine', t: .07, dur: .09, vol: .18 }); },

  /* lancement : montée sourde façon générique */
  start() { this.tone({ f: 90, f2: 260, type: 'sawtooth', dur: .75, vol: .22, glide: 'lin' });
            this.noise({ dur: .8, vol: .16, type: 'lowpass', f: 300, f2: 1500 });
            this.tone({ f: 330, type: 'triangle', t: .62, dur: .30, vol: .22 }); },

  /* c'est ton tour : deux notes tendues */
  turn()  { this.tone({ f: 494, type: 'triangle', dur: .13, vol: .34 });
            this.tone({ f: 740, type: 'triangle', t: .12, dur: .22, vol: .30 }); },

  /* un indice tombe : tap de stylo sur la table */
  clue()  { this.noise({ dur: .05, vol: .35, type: 'bandpass', f: 2200, q: 3 });
            this.tone({ f: 300, f2: 150, type: 'square', dur: .05, vol: .10 }); },

  /* ouverture du vote : glissement de l'urne */
  vote()  { this.noise({ dur: .28, vol: .28, type: 'lowpass', f: 900, f2: 260 });
            this.tone({ f: 200, f2: 130, type: 'triangle', dur: .3, vol: .26 }); },

  /* bulletin déposé */
  ballot(){ this.noise({ dur: .09, vol: .3, type: 'highpass', f: 1600 });
            this.tone({ f: 160, f2: 90, type: 'sine', dur: .12, vol: .3 }); },

  /* élimination : le tampon s'abat */
  stamp() { this.noise({ dur: .06, vol: .5, type: 'bandpass', f: 900, q: .8 });
            this.tone({ f: 140, f2: 45, type: 'square', dur: .28, vol: .38 });
            this.noise({ t: .02, dur: .35, vol: .18, type: 'lowpass', f: 1200, f2: 200 }); },

  /* victoire des civils : trois notes qui montent, sobres */
  win()   { [392, 523, 659].forEach((f, i) =>
              this.tone({ f, type: 'triangle', t: i * .13, dur: .34, vol: .3 }));
            this.tone({ f: 784, type: 'sine', t: .40, dur: .6, vol: .22 }); },

  /* victoire des imposteurs : trois notes qui descendent, en mineur */
  lose()  { [440, 370, 294].forEach((f, i) =>
              this.tone({ f, type: 'sawtooth', t: i * .15, dur: .38, vol: .20 }));
            this.tone({ f: 147, type: 'triangle', t: .46, dur: .8, vol: .26 }); },

  /* Mr White tente sa chance : suspense */
  suspense(){ this.tone({ f: 220, f2: 233, type: 'sine', dur: .9, vol: .18, glide: 'lin' });
              this.noise({ dur: .9, vol: .10, type: 'bandpass', f: 500, q: 2 }); },
};
