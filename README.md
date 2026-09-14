# Undercover

Undercover en français, jouable dans le navigateur : chacun sur son écran,
un code de salon à partager, aucun serveur de jeu à payer.

| Fichier | Ce que c'est |
|---|---|
| `index.html` | La page : structure HTML et chargement des modules. |
| `style.css` | Toute la présentation. |
| `utils.js` | Utilitaires partagés : sélecteurs, banque de mots et catégories, stockage, couleurs de pseudo, notifications. Aucun autre fichier ne doit y ajouter d'outil générique. |
| `sfx.js` | Effets sonores synthétisés. |
| `art.js` | Illustrations SVG. |
| `net.js` | Couche réseau P2P : salon, reconnexion, reprise de main. |
| `host.js` | Rôle d'hôte : état de la partie, messages reçus, déroulé. |
| `ui.js` | Rendu de l'interface. Ne décide de rien. |
| `app.js` | Démarrage et écran d'accueil. |
| `words.js` | La banque de mots. |
| `rules.js` | **Les règles ET le moteur de partie** : fonctions pures, sans réseau ni interface. |
| `tests.html` | 116 tests sur `rules.js`. À ouvrir après toute modification. |
| `groups.txt` | La source lisible des groupes sémantiques (voir plus bas). |
| `favicon.svg`, `apple-touch-icon.png` | Icônes de l'onglet et de l'écran d'accueil mobile. |
| `og.jpg` | Image d'aperçu quand on partage le lien. |

## Le jeu

Tout le monde reçoit le même mot, sauf :

- les **Undercover**, qui en reçoivent un très proche (Avocat / Juge) ;
- **Mr White**, qui n'en reçoit aucun et doit deviner en écoutant.

Chacun décrit à tour de rôle son mot en **un mot ou une très courte phrase**,
puis vient la discussion, puis le vote.

Les règles suivent celles de [Yanstar Studio](https://www.yanstarstudio.com/fr/undercover-how-to-play) :

- les **civils** gagnent quand tous les infiltrés sont éliminés ;
- les **infiltrés** (Undercover et Mr White) gagnent s'ils survivent jusqu'à ce
  qu'il ne reste plus qu'**1 civil** ;
- **Mr White** gagne immédiatement et seul s'il devine le mot des civils une
  fois éliminé. S'il se trompe, la partie reprend son cours.
- Points : civils **2**, Mr White **6**, Undercover **10**.
- 3 à 20 joueurs. L'ordre de parole est tiré au sort à chaque manche — une
  option permet de garantir qu'un civil ouvre le tour, pour que Mr White ne
  parle jamais totalement à l'aveugle.

Deux points que les règles officielles laissent ouverts, et ce que ce jeu en
fait :

- **Mr White qui se trompe** : il reste éliminé et la partie reprend. S'il
  était le dernier infiltré, les civils gagnent — ce qui correspond au cas
  décrit un peu partout (« Mr White éliminé sans avoir trouvé le mot : les
  civils gagnent »), mais la partie continue logiquement si un Undercover
  est encore en vie.
- **La répartition des rôles** : l'application officielle « suggère
  automatiquement » un nombre sans publier sa table. Ici le salon affiche un
  conseil d'environ 1 imposteur pour 4 joueurs, que l'hôte reste libre
  d'ignorer.

## La banque de mots

**22 252 paires** tirées de **3 688 mots**, réparties en **184 catégories**,
sans aucune dépendance réseau.

Le volume vient de la structure : `words.js` ne stocke pas des paires mais des
**groupes de mots frères** (`Nature | Chêne, Sapin, Bouleau, Saule, ...`), et
toutes les combinaisons deux à deux d'un groupe deviennent des paires jouables.
Un groupe de 9 mots produit 36 paires ; **y ajouter un dixième mot en crée 9 de
plus d'un coup**. C'est ce qui permet de tenir 22 000 paires avec seulement
455 lignes de données. À côté, une petite liste de paires écrites à la main couvre
les rapprochements qu'un groupe ne sait pas exprimer (Docteur/Patient,
Voleur/Policier).

Pour enrichir la banque, édite `groups.txt` puis reporte la ligne dans le bloc
`UC_GROUPS` de `words.js` — ou ajoute directement une ligne au format
`Catégorie | mot, mot, mot`. Un `*` en tête marque le contenu comme difficile.

Deux conseils de rendement :

- **ajouter un mot à un gros groupe rapporte plus que créer un petit groupe** :
  un 21ᵉ insecte crée 20 paires d'un coup, un nouveau groupe de 5 mots n'en
  crée que 10 ;
- **si un groupe devient trop large, coupe-le en deux.** « Météo » va de la
  rosée à l'ouragan : les extrêmes font des paires un peu lointaines. Deux
  groupes « pluie douce » et « intempéries » donnent moins de paires, mais
  toutes serrées.

Les paires déjà sorties sont mémorisées dans le navigateur et ne reviennent pas
tant que la banque n'est pas épuisée, et le mot « principal » change de camp au
hasard à chaque manche.

### Pourquoi pas une API de dictionnaire ?

Le jeu n'a pas besoin de mots, il a besoin de **couples de mots voisins et
connus de tous**. Les API lexicales ouvertes ne donnent ni l'un ni l'autre :

- la catégorie « Félins » du Wiktionnaire renvoie *autamba, chat-cervier,
  chat-pard, chat-tigre du Bengale* — du vocabulaire de lexicographe,
  injouable en soirée ;
- ConceptNet, la seule base sémantique multilingue ouverte, ne renvoie **aucun
  en-tête CORS** : un site statique ne peut pas l'appeler depuis le navigateur.
  Elle répondait par ailleurs en 502 lors des tests.

Une banque locale garde le jeu instantané, hors ligne, et sans mauvaise surprise
de vocabulaire.

### Contrôle qualité

Les 3 688 mots ont été passés au crible d'un lexique français de 336 000 formes
(`an-array-of-french-words`) : tout mot absent du lexique mais situé à une seule
lettre d'un mot existant est signalé comme coquille probable. Reste ensuite à
trier à la main les noms propres et les emprunts, qui sont légitimement absents
d'un dictionnaire (Zumba, tiramisu, Netflix).

## Direction artistique

Dossier d'enquête sous lampe d'interrogatoire : fond encre avec halo et grain,
fiches à angles nets plutôt que cartes arrondies, laiton comme couleur d'action
et rouge tampon pour l'élimination, titres en capitales condensées (Oswald),
chiffres et étiquettes en mono (IBM Plex Mono). Le code du salon est présenté
comme un **numéro de dossier**, la carte du joueur porte un tampon
« CONFIDENTIEL », et le bouton *Caviarder* remplace le mot secret par une
**barre de censure** noire — utile quand quelqu'un passe derrière l'écran.

Les polices viennent de Google Fonts avec des piles de repli système : si le
CDN est bloqué, la mise en page tient, seule la typo change.

**Illustrations** : tout est dessiné en SVG inline dans `index.html`, aucun
fichier image. La file d'identification sous le projecteur sur l'accueil, les
pictogrammes au trait de chaque phase (loupe, bulles, urne, cible, chapeau,
médaille) et la silhouette en filigrane de la carte de rôle. Les 184 catégories
ont chacune leur pictogramme, défini dans `UC_ICONS` (`words.js`).

**Habillage de la partie** : pendant les indices, une piste de passage montre
qui a parlé (✓), qui parle et qui attend ; celui dont c'est le tour apparaît en
grand sous un projecteur qui respire, avec trois points animés ; les indices
déjà donnés se posent au centre comme des fiches légèrement de travers.

## Choisir les catégories

184 catégories, c'est trop pour l'œil. Une **barre de recherche** filtre la liste
à la volée, accents et casse ignorés (« ecole » trouve « École »). Le filtre est
purement local à chaque navigateur : il ne touche pas aux réglages et ne transite
pas sur le réseau.

Quand une recherche est active, **« Tout / Aucune / Inverser » ne portent que sur
ce qui est affiché**, et une ligne sous les boutons le dit en toutes lettres.
Sinon, chercher
« sport » puis cliquer « Aucune » viderait toute la banque au lieu d'écarter les
cinq catégories qu'on visait. L'hôte vérifie chaque nom reçu contre la banque :
la liste vient du client, on ne s'y fie pas. La décision vit dans
`R.appliquerCats`, couverte par les tests.

Le panneau lui-même a déménagé. À droite, sous les dix lignes de réglages, il ne
restait que 150 px de haut : **huit catégories visibles sur 184**, dans une liste
qui défilait à l'intérieur d'une colonne qui défilait déjà. En salon, la colonne
de gauche n'affiche plus la liste des joueurs — elle est dans la scène centrale —
donc le panneau y passe et récupère une colonne entière : **vingt-deux catégories
visibles**, un seul ascenseur. La colonne de gauche retrouve du même coup le
bouton du son, l'état du réseau et « quitter le salon », qui disparaissaient
purement et simplement du salon. Sur écran étroit, tout s'empile et le panneau
reste à sa place d'origine.

## Ce qu'une élimination révèle

**Un rôle, jamais un mot.** Le mot de l'éliminé voyageait encore dans la vue de
tout le monde : Mr White recevait donc, écrit noir sur blanc, le mot des civils
qu'il est censé deviner, et l'Undercover apprenait le mot adverse dès la première
élimination. Les deux mots ne sortent qu'à la fin de la partie.

Le test anti-triche d'origine ne balayait que la phase des indices ; c'est ce
trou qui a laissé passer la fuite. Il parcourt maintenant **toutes** les phases —
indices, discussion, vote, révélation, devinette — et vérifie pour chaque joueur
qu'aucun mot qu'il n'a pas à connaître n'apparaît nulle part dans sa vue.

## Le chat après la partie

Un éliminé lit sans écrire : il connaît son rôle et celui de sa victime, il
pourrait orienter la fin. Mais **une fois la partie terminée, tout le monde
retrouve la parole** — tout est révélé, la règle n'a plus d'objet. Sans ça, celui
que le dernier vote venait d'éliminer se retrouvait muet pile au moment des
commentaires d'après-partie, son message à moitié tapé coincé dans un champ
désactivé. La règle vit dans `R.peutParler` et voyage dans la vue : l'interface
ne la redécide pas dans son coin.

## Les trois minuteurs

| Réglage | Portée |
|---|---|
| **Minuteur par indice** | le temps de parole **de chaque joueur**, remis à neuf à chaque tour |
| **Minuteur de discussion** | la phase de débat, une fois par manche |
| **Minuteur de vote** | le scrutin, et un départage repart sur un temps plein |

Le premier était global sans le vouloir : il n'était remis à zéro que si le temps
*expirait*. Dès que quelqu'un répondait avant la fin, le suivant héritait du
reliquat — à 1 min, le deuxième joueur commençait avec 50 s, le troisième avec
45. `avancer` décidait de réarmer en comparant le tour à un instantané pris à sa
propre entrée, alors que le tour avait déjà été incrémenté par l'appelant : le
changement lui était invisible.

Le passage de tour vit maintenant dans `R.tourSuivant`, qui efface l'échéance en
même temps qu'il avance. Un seul endroit, impossible à oublier, et couvert par
les tests dans les quatre cas : réponse rapide, temps écoulé, joueur passé par
l'hôte, absent sauté automatiquement.

## Retrouver son siège

L'identité d'un joueur tient dans un jeton, à deux niveaux :

| Où | Clé | Rôle |
|---|---|---|
| `sessionStorage` | `uc_tok_<CODE>` | l'onglet en cours — prioritaire, c'est lui qui garde deux onglets bien distincts |
| `localStorage` | `uc_seat_<CODE>` | le dernier siège occupé dans ce salon depuis ce navigateur, valable 12 h — la bouée quand l'onglet a été fermé |

Avant, le jeton ne vivait que dans le `sessionStorage` : recharger la page
marchait, mais **fermer l'onglet faisait perdre sa place**, son rôle et son mot,
et laissait dans la partie un fantôme injoignable. Maintenant, rouvrir le lien
d'invitation rend le siège, avec le rôle, le mot et l'historique du chat.

**L'hôte a le dernier mot.** Il renvoie dans `welcome` le jeton qu'il a retenu,
et en forge un neuf si celui présenté appartient déjà à quelqu'un de connecté.
Deux onglets ouverts en même temps ne peuvent donc jamais partager une identité.
Le siège de l'hôte est en outre exclu de toute reprise : il joue en local, sans
entrée dans `conns`, donc le test « sa connexion est-elle morte ? » serait
toujours vrai pour lui et n'importe quel arrivant lui prendrait sa place.

*Limite connue :* deux onglets du même navigateur dans le même salon se
partagent la clé `uc_seat_`, et c'est le dernier arrivé qui l'écrit. Si le
premier ferme puis rouvre son onglet, il repart en nouveau joueur. Un
rechargement, lui, marche toujours — le `sessionStorage` prend le dessus.

## Le chat ne circule qu'une fois

Chaque message porte un numéro d'ordre, et l'hôte retient pour chaque joueur ce
qu'il lui a déjà envoyé : une vue ne transporte que les messages neufs. Avant,
les soixante derniers messages repartaient en entier vers tout le monde à chaque
indice et à chaque vote — sur une partie bavarde à 20 joueurs, des dizaines de
kilo-octets par action, sur des liens P2P.

Mesuré sur une partie à 25 messages : la vue passe de 3 226 à 908 octets, soit
**72 % de moins**, et l'écart grandit avec le fil.

Le curseur n'avance qu'une fois la vue réellement partie ; si l'envoi échoue il
retombe à zéro, et le joueur reçoit tout l'historique à son retour plutôt que de
perdre les messages de son absence. Un message sans numéro vient d'une
sauvegarde antérieure à ce mécanisme : il est joint aux envois complets.

## Sur téléphone

Sous 1080 px les colonnes s'empilent. La carte « ton rôle » vivait alors en bas
de page : sur un écran de 812 px de haut elle commençait à 892 px, c'est-à-dire
entièrement hors de vue — il fallait défiler pour relire son propre mot, la
chose qu'on regarde le plus souvent. Elle est maintenant déplacée devant la
scène, comme le chat l'est déjà entre les colonnes. Le déplacement est refait
au redimensionnement, pour suivre une rotation d'écran.

## Couleurs des joueurs

Chaque pseudo donne une teinte par hachage (FNV-1a), stable d'une partie à
l'autre sans rien stocker. Mais des pseudos proches — « Halambic »,
« Halambic² », « Halambic3 » — tombaient sur des verts indistinguables, et on
ne reconnaissait plus personne dans la liste.

La palette écarte donc les teintes trop voisines, **dans l'ordre de la liste** :
le premier garde la sienne, seul celui qui arrive en collision est décalé. Un
joueur qui rejoint ne change donc la couleur de personne. L'écart minimal vaut
42° et se resserre quand le salon se remplit (à 20 joueurs il ne reste que 18°
par personne de toute façon).

Tout le monde reçoit la même liste dans le même ordre : chaque navigateur
calcule la même palette, rien ne transite sur le réseau.

## Rejoindre en cours de partie

Un retardataire n'est pas refusé : il entre comme **spectateur**. Il voit les
indices et les votes se dérouler, et il peut parler dans le chat — contrairement
aux éliminés, il ne connaît aucun secret.

Il entre en jeu **à la partie suivante**, pas à la manche suivante : les manches
d'une même partie partagent les rôles et les mots tirés au lancement. L'intégrer
entre deux manches changerait l'équilibre annoncé, et il aurait déjà entendu les
indices et vu les votes des manches précédentes. Au prochain tirage, il reçoit un
rôle au sort comme tout le monde — il n'est pas cantonné aux civils.

Le vocabulaire compte ici, et il a déjà induit en erreur : une **partie** va du
lancement à la victoire d'un camp ; une **manche** est un tour de table à
l'intérieur de cette partie. Les libellés de l'interface disent « prochaine
partie ».

## Exclure un joueur, et le reprendre

On peut exclure **à tout moment** : dans le salon, en pleine manche, et sur
l'écran de fin — c'est là qu'on en a le plus besoin, juste avant de relancer.

Le geste n'a pas le même effet partout. Hors partie, le joueur est simplement
retiré. **En pleine manche**, il est éliminé et son rôle révélé, mais il reste
dans la liste : son nom figure dans les indices déjà donnés et son rôle comptait
dans l'équilibre. Il disparaît au tirage suivant — sans quoi, banni et incapable
de se reconnecter, il héritait d'un rôle et comptait dans les conditions de
victoire. Un fantôme qui pouvait se retrouver Undercover et bloquer la partie.

Exclure bannit le jeton du joueur — sans ça, sa reconnexion automatique le
ramènerait dans la seconde. Mais une exclusion n'est pas un jugement définitif :
l'hôte garde sous les yeux la liste des exclus avec un bouton **Réadmettre**,
affichée partout où l'on peut exclure. Le joueur n'a plus qu'à rouvrir le lien d'invitation. Le message
qu'il reçoit conserve le code du salon dans l'adresse, pour qu'il n'ait pas à le
redemander.

## Si les joueurs partent

Une manche a besoin d'au moins **deux participants présents** pour avancer. En
dessous, un bandeau rouge annonce l'interruption et un compte à rebours de
**30 secondes** démarre — les absents reviennent souvent d'eux-mêmes (page
rechargée, wifi coupé, tunnel). Passé ce délai, tout le monde revient au salon :
**joueurs et scores conservés**, rôles et manche effacés. L'hôte peut aussi
couper court avec « Revenir au salon maintenant ».

Sans cette règle, la partie continuait dans le vide : les absents étaient bien
sautés au tour de parole et n'empêchaient plus le vote, mais rien n'arrêtait la
manche quand il ne restait plus personne pour jouer.

## Si l'hôte ne revient pas

Au-delà de quinze secondes sans hôte, chaque joueur voit apparaître un bouton
**« Reprendre la main »**. Celui qui l'actionne relance le salon **sous le même
code** : les autres, qui retentaient la connexion en boucle, reviennent seuls et
**les scores sont conservés**. La manche en cours est perdue — les rôles
n'existaient que chez l'ancien hôte, personne d'autre ne pouvait les connaître.
Les tentatives de reconnexion continuent en parallèle : si l'hôte d'origine
revient entre-temps, la proposition disparaît d'elle-même.

## Architecture : où vit la logique

Le projet est découpé en modules à responsabilité unique, chargés dans l'ordre
de leurs dépendances (voir les balises `<script>` en bas d'`index.html`). Chaque
fichier n'utilise les précédents qu'à l'intérieur de ses fonctions, jamais au
chargement — c'est ce qui permet ce découpage sans système de modules.

Tout ce qui **décide** de quelque chose vit dans `rules.js` : répartition des
rôles, ordre de parole, dépouillement, conditions de victoire, barème, minuteurs,
enchaînement des phases, et surtout la **projection des vues** — le filtre
anti-triche qui décide de ce que chaque joueur a le droit de voir.

Ces fonctions ne touchent ni au réseau, ni au DOM, ni à l'horloge (l'instant leur
est toujours passé en paramètre). Conséquence : `tests.html` rejoue des parties
entières — déconnexions, égalités, Mr White, retardataires, minuteurs — en une
seconde et sans navigateur.

`index.html` ne garde que le transport (P2P), l'affichage, le son, et le tirage
des mots (qui persiste un historique). **Une règle qui change se change dans
`rules.js`, et le test échoue si on se trompe.**

## Récapitulatif du scrutin

Après chaque vote, tout le monde voit **qui a voté contre qui**, abstentions
comprises. Le détail est capturé avant toute remise à zéro, et n'est exposé
qu'une fois le vote clos — pendant le scrutin, personne ne sait rien.

## Exclure un joueur

Le bouton ✕ de la liste est disponible **à tout moment** pour l'hôte. Dans le
salon, le joueur est simplement retiré. **En pleine manche**, il ne peut pas être
effacé — son nom apparaît dans les indices déjà donnés et son rôle compte dans
l'équilibre : il est donc éliminé, rôle révélé, et la partie continue sans lui
(si son départ décide de l'issue, elle se termine proprement). Son jeton est
ajouté à une liste d'exclus, sinon sa reconnexion automatique le ferait revenir
aussitôt.

## Accessibilité

Focus clavier visible, libellés sur les commandes sans texte, code du salon
épelé pour les lecteurs d'écran, annonces vocales à chaque changement de phase,
cibles tactiles de 44 px sur écran tactile, et respect de
`prefers-reduced-motion` (les animations s'arrêtent pour qui les a désactivées).

## Chat

Une zone **Transmissions** disponible dès le salon. Le panneau se place là où il
y a de la place : **au centre dans le salon** (la colonne de droite y est
occupée par les réglages et les catégories, le centre est presque vide) et
**à droite pendant la partie**, où il prend toute la hauteur restante. La liste
se recolle au dernier message, sauf si on est remonté lire l'historique.
Les joueurs **éliminés passent en lecture seule** : ils suivent la fin de la
partie sans pouvoir l'influencer. Anti-spam à 700 ms par joueur, messages
limités à 200 caractères, affichage par `textContent` (aucune injection
possible). Les 60 derniers messages sont conservés.

## Minuteurs

Trois réglages indépendants, à fixer **avant le lancement** :

- **par indice** — 15 s à 90 s : le joueur qui dépasse est passé automatiquement ;
- **de discussion** — 30 s à 5 min : le vote s'ouvre tout seul à la fin ;
- **de vote** — 20 s à 90 s : à l'échéance, on dépouille les votes exprimés et
  les silencieux comptent pour des abstentions.

Sans minuteur de vote, un joueur qui laisse son onglet ouvert sans cliquer
bloquerait la manche : l'hôte dispose alors du bouton **« Clore le vote sans les
absents »**, qui dépouille immédiatement.

Chacun se règle sur « — » pour le désactiver. Une barre de progression s'affiche
au-dessus de la scène, elle vire au rouge et bipe sur les cinq dernières
secondes. Le temps restant transite en **durée**, jamais en heure absolue : les
horloges des joueurs ne sont pas synchronisées entre elles.

## Si l'hôte tombe

L'état complet de la partie est écrit dans le navigateur de l'hôte à chaque
diffusion. S'il recharge ou ferme son onglet par accident, l'accueil lui propose
de **reprendre le dossier** ; pendant ce temps les autres joueurs affichent
« reconnexion… » et retentent la connexion pendant deux minutes. Dès que l'hôte
revient, **chacun retrouve son rôle et son mot**, la manche reprend où elle en
était.

L'identité d'un joueur tient dans un jeton de `sessionStorage` : il survit à un
rechargement de la page, mais reste propre à chaque onglet — deux personnes sur
la même machine restent deux joueurs distincts.

## Sons

Tous les effets sont **synthétisés en WebAudio** — oscillateurs et bruit filtré,
zéro fichier audio, aucun son système. La palette est sèche et sombre :

| Moment | Son |
|---|---|
| Un agent rejoint | deux notes brèves |
| Lancement | montée sourde en dents de scie |
| C'est ton tour | deux notes tendues |
| Un indice tombe | tap de stylo sur la table |
| Ouverture du vote | glissement grave |
| Élimination | le tampon s'abat |
| Mr White devine | tenue dissonante |
| Victoire civils / imposteurs | trois notes montantes / descendantes |

Le contexte audio ne démarre qu'au premier clic (politique des navigateurs) : il
est débloqué au moment où l'on crée ou rejoint un salon. Le bouton du panneau
*Salon* fait descendre le volume d'un cran à chaque clic — **♪♪ fort → ♪ doux →
✕ coupé**, puis retour en haut — et le niveau est mémorisé dans le navigateur.

Chaque message du chat porte son **heure d'envoi** (date complète en infobulle).

**Cache** : `index.html` charge `words.js?v=N` et `rules.js?v=N`. Après toute
modification de l'un de ces fichiers, **incrémente son numéro** — sinon les
navigateurs resservent l'ancienne version depuis leur cache. Ça s'applique aussi
à `tests.html`, qui charge les mêmes modules : un test vert sur du code périmé ne
prouve rien.

## Aperçu du lien

Quand le lien est collé dans Discord, WhatsApp, Slack ou Twitter, l'aperçu
affiche le titre, la description et `og.jpg` (1200×630, 50 Ko) — la file
d'identification sous le projecteur. L'onglet du navigateur porte `favicon.svg`,
et l'ajout à l'écran d'accueil d'un iPhone utilise `apple-touch-icon.png`.

Les chemins des balises `og:` sont **relatifs** : les robots les résolvent depuis
l'adresse de la page, ce qui marche sur n'importe quel domaine sans rien
changer. Si un service refusait l'aperçu, remplace les deux `content="og.jpg"`
par l'URL absolue (`https://ton-compte.github.io/ton-repo/og.jpg`).

Discord garde ses aperçus en cache : après une mise en ligne, un lien déjà
partagé peut montrer l'ancienne version pendant quelques heures. Ajouter
`?1` à la fin du lien force un nouvel aperçu.

## Mettre en ligne sur GitHub Pages

Le dépôt est déjà initialisé et le premier commit est fait. Il ne reste qu'à
le relier à GitHub :

```bash
git remote add origin git@github.com:Halambic/undercover.git
git push -u origin main
```

Puis dans le dépôt : **Settings → Pages → Source : Deploy from a branch →
`main` / `/ (root)` → Save**. Le jeu est en ligne une minute plus tard sur
**https://halambic.github.io/undercover/**.

Rien d'autre à configurer : pas de build, pas de dépendance à installer, pas de
serveur à louer.

Deux détails qui font que ça marche du premier coup :

- **`.nojekyll`** à la racine. Sans lui, GitHub Pages fait passer le dépôt par
  Jekyll, qui a ses propres idées sur les fichiers à publier.
- **`index.html` à la racine**, et tous les chemins internes relatifs — le site
  fonctionne aussi bien à la racine d'un domaine que dans un sous-dossier
  `/<ton-repo>/`.

### L'aperçu du lien dans Discord

Trois balises d'`index.html` portent l'adresse du site **en dur**, parce que les
robots d'aperçu ne résolvent pas les chemins relatifs :

```html
<meta property="og:url"     content="https://halambic.github.io/undercover/">
<meta property="og:image"   content="https://halambic.github.io/undercover/og.jpg">
<meta name="twitter:image"  content="https://halambic.github.io/undercover/og.jpg">
```

**Si le dépôt est renommé ou déplacé, ce sont les seules lignes à changer** —
tout le reste du site est en relatif et suit l'adresse tout seul. Le favicon et
l'icône Apple restent relatifs : les navigateurs, eux, les résolvent bien.

Discord garde en cache l'aperçu d'une URL pendant plusieurs heures. Si le
premier partage tombe avant que Pages ne soit en ligne, l'aperçu restera vide un
moment : partage le lien avec un `?x=1` au bout pour forcer une nouvelle lecture.

## Comment le multijoueur fonctionne sans serveur

Les navigateurs se parlent **directement** entre eux (WebRTC, via la librairie
PeerJS chargée depuis un CDN). Celui qui crée le salon devient l'hôte : il
détient l'état de la partie et envoie à chacun une vue filtrée — **personne ne
reçoit le rôle des autres** tant qu'il n'a pas été révélé, même en inspectant
le trafic réseau.

Ce qu'il faut savoir :

- **L'onglet de l'hôte doit rester ouvert.** S'il le ferme, le salon meurt.
- La mise en relation initiale passe par le serveur public gratuit de PeerJS.
  Il ne voit jamais le contenu des parties, seulement « tel navigateur cherche
  tel code ». S'il est indisponible, la création de salon échoue : il suffit de
  réessayer, ou d'héberger son propre PeerServer et de le renseigner dans
  `newPeer()`.
- Les réseaux d'entreprise très fermés peuvent bloquer le WebRTC.
- Un joueur qui ferme son onglet est détecté en ~10 s et son tour est sauté ;
  s'il revient avec le même navigateur, il retrouve son rôle et sa place.

## Réglages (hôte)

Nombre d'Undercover, nombre de Mr White, mots difficiles, « Mr White devine »,
indice de catégorie, « un civil ouvre le tour ». Modifiables dans le salon
**et entre deux parties**.

### Filtre de catégories

Sur grand écran, les colonnes latérales sont bornées à la hauteur de la fenêtre
et défilent d'un bloc ; la liste des catégories garde un plancher de 150 px pour
rester utilisable quoi qu'il arrive. L'ordre des panneaux change selon la phase :
réglages et catégories en haut dans le salon, rôle et indices en partie.


Les 184 catégories s'activent ou se coupent une par une avant le lancement, avec
le nombre de paires de chacune et trois raccourcis (Tout / Aucune / Inverser).
Le compteur affiche en direct le nombre de paires encore disponibles, et le
lancement est bloqué si la sélection est vide. Pratique pour couper la
géographie avec des enfants, ou ne jouer qu'en « Nourriture » pendant un repas.

En ligne, seul l'hôte règle le filtre ; les autres joueurs le voient en lecture
seule. Chaque navigateur ayant le même `words.js`, seule la sélection transite
sur le réseau.
Les civils doivent rester majoritaires, **3 joueurs minimum, 20 maximum**.
Le salon affiche ce compte en clair, et ne montre des emplacements vides que
tant que le minimum n'est pas atteint.

### Couleurs : une leçon

`--ink` est la couleur de **fond** (`#0a0b0f`), pas celle du texte — c'est
`--txt`. Écrire `color:var(--ink)` donne du noir sur noir, sans aucune erreur :
CSS n'a pas de quoi s'en plaindre. En cas de doute, la vérification qui tranche
est le rapport de contraste calculé sur le rendu réel, pas l'œil.
