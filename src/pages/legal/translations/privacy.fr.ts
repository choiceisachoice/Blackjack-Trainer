import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Politique de confidentialité — French translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const PRIVACY_FR: LegalDoc = {
  title: 'Politique de confidentialité',
  intro: `Comment ${M.productName} collecte, utilise et protège vos données — en langage clair. Dernière mise à jour le ${legalDate('fr')}.`,
  sections: [
    {
      heading: '1. Qui est responsable',
      blocks: [
        `${M.productName} est exploité par ${M.operator}, dont le siège est à ${legalLocation('fr')} (l’« exploitant », « nous »). Nous sommes le responsable du traitement des données personnelles décrites ici.`,
        `Pour toute question relative à la confidentialité ou pour exercer vos droits, contactez-nous à l’adresse ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. Les données que nous collectons, et pourquoi',
      blocks: [
        'Nous ne collectons que ce dont l’application a besoin pour fonctionner. Plus précisément :',
        {
          list: [
            'Compte : votre adresse e-mail et un mot de passe. Le mot de passe est conservé uniquement sous forme de hachage sécurisé par notre fournisseur d’authentification — nous ne le voyons ni ne le conservons jamais sous une forme lisible. L’adresse e-mail sert à vous connecter, à sécuriser votre compte et à vous envoyer des messages relatifs au compte et au paiement.',
            'Profil et progression : un nom d’affichage, votre niveau et vos XP, vos séries, les récompenses débloquées, le système de comptage choisi et les préférences de l’application (thème, son, vitesse de distribution). Cela fait fonctionner le produit et synchronise votre progression entre vos appareils.',
            'Données d’entraînement : chaque session d’entraînement que vous terminez — le mode, votre précision, la durée, le nombre de mains et des chiffres similaires. Cela alimente vos analyses et votre progression.',
            'Journal de bankroll (facultatif) : si vous utilisez le journal du casino réel, nous conservons exactement ce que vous saisissez — une date, les heures jouées, un nom de casino que vous tapez et les montants que vous enregistrez (gain ou perte, et votre bankroll). Vous choisissez d’utiliser ou non cette fonction, et vous pouvez modifier ou supprimer ces entrées.',
            'Paiement : si vous vous abonnez à Pro, le paiement est traité par Stripe. Nous communiquons à Stripe votre adresse e-mail et un identifiant de compte interne, et nous recevons en retour le statut de votre abonnement. Nous ne recevons ni ne conservons jamais votre numéro de carte complet.',
            'Stockage local sur l’appareil : vos préférences et une copie hors ligne de votre progression sont conservées dans votre navigateur (localStorage), et un cookie de session vous maintient connecté. Nous n’utilisons pas de cookies publicitaires ni de cookies de suivi intersites.',
            'Contrôle anti-robots : lorsque vous vous connectez, vous inscrivez ou demandez la réinitialisation du mot de passe, Cloudflare Turnstile vérifie que c’est une personne — et non un script — qui envoie le formulaire. Pour ce contrôle, Cloudflare traite votre adresse IP et des caractéristiques techniques de votre navigateur conformément à sa propre politique de confidentialité. Nous ne recevons qu’un jeton « réussi » ou « échoué » et ne voyons jamais ces informations.',
            'Statistiques de visite : pour savoir combien de personnes visitent le site, quelles pages elles lisent et combien de temps elles restent, nous enregistrons chaque page vue dans notre propre base de données — le chemin de la page, l’heure, le site qui renvoyait vers nous (son domaine uniquement), le type d’appareil (téléphone, tablette ou ordinateur) et un identifiant de visiteur aléatoire conservé dans votre navigateur. Cet identifiant est un nombre aléatoire ; il n’est dérivé ni de vous ni de votre appareil, il n’est partagé avec personne et il est remplacé lorsque vous vous déconnectez. Nous ne conservons ni votre adresse IP ni la chaîne d’identification de votre navigateur. Si vous êtes connecté, une visite est rattachée à votre compte. Avec le même identifiant, nous enregistrons également les étapes de l’inscription et du passage à l’offre payante qui ont été atteintes — l’affichage du formulaire d’inscription ou de l’offre payante, la création d’un compte, l’achèvement d’une première séance d’entraînement et le lancement d’un paiement — uniquement sous la forme du nom de l’étape et de l’heure, sans aucun autre détail. Les navigateurs qui envoient le signal Global Privacy Control ou Do Not Track ne sont pas comptés du tout. Ces statistiques sont conservées 13 mois. Nous ne le faisons que si vous y consentez : lors de votre première visite, un bandeau en bas de la page vous demande si vous acceptez les cookies, et tant que vous n’avez pas choisi « Accepter », rien n’est enregistré et aucun identifiant n’est conservé. (À strictement parler, il s’agit d’une entrée dans le stockage local de votre navigateur plutôt que d’un cookie ; nous employons le mot habituel parce qu’il remplit la même fonction et relève des mêmes règles.) « Refuser » supprime un identifiant conservé auparavant. Vous pouvez modifier votre réponse à tout moment sous « Paramètres des cookies » au bas de chaque page publique. Un navigateur qui envoie Global Privacy Control ou Do Not Track est traité comme un « non » sans que la question soit posée.',
            'Rapports d’erreur : lorsqu’un achat ou une action sur le compte (ouvrir le portail de facturation, exporter ou réinitialiser vos données, modifier votre nom ou votre image) échoue pour une raison technique, nous enregistrons le message d’erreur, la page sur laquelle vous vous trouviez, l’heure, la version de l’application et — si vous étiez connecté — le lien avec votre compte, afin de pouvoir trouver et corriger le défaut. Tout ce qui, dans le message, ressemble à une adresse e-mail ou à un jeton d’accès est supprimé avant l’envoi. Ces rapports sont conservés 90 jours.',
          ],
        },
      ],
    },
    {
      heading: '3. Ce que nous ne faisons pas',
      blocks: [
        'Nous ne vendons pas vos données. Nous n’utilisons pas de réseaux publicitaires, et nous n’employons aucun outil d’analyse ou de suivi tiers qui établirait votre profil à travers le web. Les statistiques de visite décrites ci-dessus sont collectées par nous seuls, restent dans notre propre base de données et ne sont combinées avec les données d’aucun autre site.',
      ],
    },
    {
      heading: '4. Qui traite des données pour notre compte',
      blocks: [
        'Nous faisons appel à un petit nombre de prestataires qui ne traitent les données que sur nos instructions :',
        {
          list: [
            'Supabase — héberge notre base de données, gère l’authentification et exécute nos fonctions côté serveur.',
            'Stripe — traite les paiements d’abonnement en tant que prestataire de paiement indépendant. Stripe traite les données de votre carte conformément à sa propre politique de confidentialité.',
            'Cloudflare — exécute le contrôle anti-robots (Turnstile) sur les formulaires de connexion, d’inscription et de réinitialisation du mot de passe.',
          ],
        },
      ],
    },
    {
      heading: '5. Où vos données sont conservées',
      blocks: [
        `Les données de votre compte et de vos entraînements sont conservées par Supabase dans la région ${M.hostingRegion}. Lorsque des données sont traitées en dehors de votre propre pays, ce transfert repose sur les garanties offertes par ces prestataires (telles que les clauses contractuelles types).`,
      ],
    },
    {
      heading: '6. Combien de temps nous les conservons',
      blocks: [
        'Nous conservons vos données aussi longtemps que votre compte existe. Lorsque vous supprimez votre compte, les données personnelles qui y sont liées sont supprimées et les éventuelles statistiques de visite en sont dissociées. La déconnexion efface la copie hors ligne conservée dans votre navigateur. Les statistiques de visite sont conservées 13 mois et les rapports d’erreur 90 jours ; les deux sont supprimés par une tâche hebdomadaire, de sorte qu’une entrée peut subsister jusqu’à une semaine au-delà de sa durée.',
      ],
    },
    {
      heading: '7. Comment nous les protégeons',
      blocks: [
        'Les données sont chiffrées en transit (HTTPS). L’accès est restreint par utilisateur au moyen de la sécurité au niveau des lignes de la base de données (row-level security), de sorte qu’aucun compte ne peut lire les données d’un autre compte. Les mots de passe sont hachés par notre fournisseur d’authentification.',
      ],
    },
    {
      heading: '8. Vos droits',
      blocks: [
        'Vous pouvez nous demander de vous remettre une copie de vos données, de les rectifier, de les supprimer, de les exporter, ou de limiter certains traitements ou de vous y opposer, et vous pouvez retirer votre consentement à tout moment. En vertu de la loi fédérale suisse sur la protection des données (nLPD) et, pour les visiteurs de l’UE/EEE, du RGPD, ces droits vous sont reconnus.',
        `Pour exercer l’un d’entre eux, écrivez à ${M.contactEmail}. Vous avez également le droit de déposer une réclamation auprès de votre autorité de protection des données.`,
      ],
    },
    {
      heading: '9. Enfants',
      blocks: [
        `${M.productName} n’est pas destiné aux personnes de moins de ${M.minimumAge} ans, et nous ne collectons pas sciemment de données les concernant.`,
      ],
    },
    {
      heading: '10. Modifications de la présente politique',
      blocks: [
        'Si nous modifions notre manière de traiter les données, nous mettrons à jour cette page et sa date de « dernière mise à jour ». Les modifications importantes seront mises en évidence lorsque cela est approprié.',
      ],
    },
    {
      heading: '11. Contact',
      blocks: [
        `Questions sur la présente politique ou sur vos données : ${M.contactEmail}.`,
      ],
    },
  ],
}
