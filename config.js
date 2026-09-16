/* ======================================================================
   Clé GIPHY — à remplir par l'administrateur du site
   ======================================================================

   Le sélecteur de GIF interroge l'API GIPHY, qui exige une clé.
   Tant que la ligne ci-dessous est vide, le bouton GIF reste simplement
   absent du chat : tout le reste du jeu fonctionne normalement.

   (Tenor, l'autre grand fournisseur, a fermé son API le 30 juin 2026 —
   plus aucune clé n'y était délivrée depuis janvier 2026.)

   Pour obtenir une clé (gratuite) :
     1. https://developers.giphy.com/  →  « Create an App »
     2. Choisir « API » (pas « SDK »)
     3. Copier la clé et la coller entre les guillemets ci-dessous.

   ATTENTION — DEUX CHOSES À SAVOIR :

   1. Ce fichier est public. N'importe quel visiteur peut lire cette clé.
      C'est le fonctionnement normal d'une clé GIPHY côté navigateur, mais
      ne mets JAMAIS ici une clé qui donne accès à autre chose que GIPHY.
      Pour révoquer : supprimer la clé sur developers.giphy.com, vider la
      ligne ici, et pousser.

   2. Une clé gratuite est plafonnée à 100 requêtes par heure, partagées
      par TOUS les joueurs du site. Une soirée chargée peut l'épuiser ; le
      panneau affiche alors « GIPHY est saturé » et le reste du jeu continue
      sans broncher. Le jeu met les recherches en cache pour économiser le
      quota (voir README, section « GIF »).
*/

window.UC_GIF = {
  cle: '',
  /* Niveau de filtrage GIPHY : 'g' (tout public), 'pg', 'pg-13', 'r'.
     On reste prudent : le lien de la partie circule librement. */
  filtre: 'pg-13',
};
