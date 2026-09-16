/* ======================================================================
   Clé KLIPY — à remplir par l'administrateur du site
   ======================================================================

   Le sélecteur de GIF interroge l'API KLIPY. Tant que la ligne ci-dessous
   est vide, le bouton GIF reste simplement absent du chat : tout le reste
   du jeu fonctionne normalement.

   Pourquoi KLIPY plutôt que Tenor ou GIPHY :
     · Tenor a fermé son API le 30 juin 2026.
     · GIPHY plafonne son palier gratuit à 100 requêtes/heure, et le palier
       supérieur est payant.
     · KLIPY (fondé par d'anciens de Tenor, adopté par WhatsApp) offre un
       accès Production ILLIMITÉ et gratuit.

   Pour obtenir une clé :
     1. https://klipy.com/  →  Partner Panel  →  API Keys  →  créer une plateforme
     2. Coller la clé entre les guillemets ci-dessous.
     3. IMPORTANT : tant que la clé est en mode « Testing », elle est bridée
        à 100 requêtes par heure — partagées par TOUS les joueurs du site.
        Demander l'accès « Production » depuis le Partner Panel lève le
        plafond, gratuitement. À faire avant la première vraie soirée.

   ATTENTION : ce fichier est public. N'importe quel visiteur peut lire cette
   clé. C'est le fonctionnement normal d'une clé côté navigateur, mais ne mets
   JAMAIS ici une clé qui donne accès à autre chose que KLIPY.
   Pour révoquer : supprimer la clé dans le Partner Panel, vider la ligne ici,
   et pousser.
*/

window.UC_GIF = {
  cle: '',
  /* Niveau de filtrage KLIPY : 'high' (tout public), 'medium', 'low', 'off'.
     On reste prudent : le lien de la partie circule librement. */
  filtre: 'medium',
};
