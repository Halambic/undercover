/* ======================================================================
   Clé Tenor — à remplir par l'administrateur du site
   ======================================================================

   Le sélecteur de GIF interroge l'API Tenor (Google), qui exige une clé.
   Tant que la ligne ci-dessous est vide, le bouton GIF reste simplement
   absent du chat : tout le reste du jeu fonctionne normalement.

   Pour obtenir une clé (gratuite) :
     1. https://console.cloud.google.com/  →  créer un projet
     2. « APIs & Services » → « Enable APIs » → activer « Tenor API »
     3. « Credentials » → « Create credentials » → « API key »
     4. Coller la clé entre les guillemets ci-dessous, puis pousser le fichier.

   ATTENTION : ce fichier est public. N'importe quel visiteur peut lire cette
   clé et s'en servir sur son propre site, au débit de ton quota. C'est le
   fonctionnement normal d'une clé Tenor côté navigateur — mais pense à la
   restreindre dans la console Google :
     « Application restrictions » → « Websites » → https://halambic.github.io/*
   Ainsi la clé ne marche que depuis ce site. Ne mets JAMAIS ici une clé qui
   donne accès à autre chose que Tenor.

   Pour révoquer : supprimer la clé dans la console Google, vider la ligne ici.
*/

window.UC_TENOR = {
  cle: '',
  /* Niveau de filtrage Tenor : 'high' (tout public), 'medium' (≈PG-13),
     'low', 'off'. On reste prudent : le lien de la partie circule librement. */
  filtre: 'medium',
};
