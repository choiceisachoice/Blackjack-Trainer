import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Conditions d’utilisation — French translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const TERMS_FR: LegalDoc = {
  title: 'Conditions d’utilisation',
  intro: `Les règles d’utilisation de ${M.productName}. Dernière mise à jour le ${legalDate('fr')}.`,
  sections: [
    {
      heading: '1. Accord',
      blocks: [
        `En créant un compte ou en utilisant ${M.productName} (le « Service »), vous acceptez les présentes Conditions. Si vous ne les acceptez pas, veuillez ne pas utiliser le Service.`,
        `Le Service est exploité par ${M.operator}, dont le siège est à ${legalLocation('fr')}.`,
      ],
    },
    {
      heading: '2. Ce qu’est le Service — et ce qu’il n’est pas',
      blocks: [
        'Le Service est un outil d’entraînement à vocation pédagogique, destiné à l’apprentissage de la stratégie de base du blackjack et du comptage de cartes. Tout le jeu est simulé.',
        'Ce n’est pas un jeu d’argent. Il ne propose pas de paris en argent réel, ne vous permet ni de miser ni de gagner de l’argent, et n’est ni un casino ni un service de jeux d’argent. Aucun résultat obtenu dans le Service n’a de valeur monétaire.',
      ],
    },
    {
      heading: '3. Conditions d’accès',
      blocks: [
        `Vous devez avoir au moins ${M.minimumAge} ans et être en mesure de conclure un accord contraignant pour utiliser le Service.`,
      ],
    },
    {
      heading: '4. Votre compte',
      blocks: [
        'Gardez vos identifiants de connexion confidentiels et fournissez des informations exactes. Vous êtes responsable de l’activité réalisée sous votre compte. Informez-nous sans délai si vous pensez que quelqu’un y a accédé sans votre autorisation.',
      ],
    },
    {
      heading: '5. Utilisation acceptable',
      blocks: [
        'Le Service est destiné à votre usage personnel et licite. Vous vous engagez à ne pas :',
        {
          list: [
            'revendre, concéder en sous-licence ou exploiter commercialement le Service ou son contenu ;',
            'copier, extraire de manière automatisée (scraping), décompiler ou tenter d’extraire le code source ou les données sous-jacentes, sauf lorsque la loi l’autorise expressément ;',
            'perturber, surcharger ou entraver le Service ou sa sécurité ;',
            'utiliser le Service pour enfreindre la loi ou les droits d’autrui.',
          ],
        },
      ],
    },
    {
      heading: '6. Offre gratuite et abonnement Pro',
      blocks: [
        'Le Service comporte une offre gratuite et un abonnement payant « Pro ». Pro est facturé mensuellement ou annuellement par l’intermédiaire de notre prestataire de paiement, Stripe, et se renouvelle automatiquement jusqu’à ce que vous le résiliiez.',
        'Vous pouvez résilier à tout moment depuis votre compte ; votre accès Pro se poursuit jusqu’à la fin de la période que vous avez déjà payée. Sauf lorsque la loi en dispose autrement, les paiements déjà effectués ne sont pas remboursables. Nous pouvons modifier les prix ou les fonctionnalités, et nous annoncerons les modifications importantes dans un délai raisonnable avant qu’elles ne vous concernent.',
      ],
    },
    {
      heading: '7. Prix et TVA suisse',
      blocks: [
        'Tous les prix affichés sur ce site et dans le Service sont exprimés en francs suisses et sont des prix finaux pour les consommateurs : le montant affiché est le montant débité. Rien n’est ajouté au moment du paiement.',
        `Pour les clients en Suisse, ces prix incluent la taxe sur la valeur ajoutée (TVA) suisse au taux légal applicable (actuellement ${legalNumber('fr', CH_VAT_PERCENT)} %). La TVA est comprise dans le prix affiché et figure séparément sur votre facture et votre reçu de paiement.`,
        'Le Service est proposé aux particuliers. Les prix sont donc indiqués TVA comprise et jamais hors TVA.',
        'Si des impôts ou des taxes s’appliquent là où vous résidez, en dehors de la Suisse, ils sont à votre charge.',
      ],
    },
    {
      heading: '8. Aucun conseil financier ni conseil en matière de jeux d’argent',
      blocks: [
        'Tout ce que le Service affiche — y compris les tableaux de stratégie, les suggestions d’échelle de mises (bet spread) et les chiffres de bankroll — a une visée exclusivement pédagogique. Il ne s’agit pas d’un conseil financier, d’un conseil en placement ni d’un conseil en matière de jeux d’argent, et cela ne garantit aucun résultat. Toute décision que vous prenez concernant des jeux d’argent réels relève entièrement de vous.',
        'Ne jouez que si c’est légal là où vous vous trouvez, uniquement avec de l’argent que vous pouvez vous permettre de perdre, et de manière responsable.',
      ],
    },
    {
      heading: '9. Comptage de cartes et casinos',
      blocks: [
        'Compter les cartes mentalement est légal — c’est de la réflexion. Toutefois, les casinos sont des entreprises privées qui fixent leurs propres règles et peuvent refuser ou restreindre le jeu. Nous ne sommes affiliés à aucun casino et ne sommes pas responsables de la manière dont un casino vous traite.',
      ],
    },
    {
      heading: '10. Propriété intellectuelle',
      blocks: [
        'Le Service, son contenu et son design appartiennent à l’exploitant ou à ses concédants de licence. Nous vous accordons un droit limité, personnel et non transférable d’utiliser le Service conformément aux présentes Conditions ; aucun autre droit n’est accordé.',
      ],
    },
    {
      heading: '11. Exclusion de garanties',
      blocks: [
        'Le Service est fourni « en l’état » et « selon disponibilité ». Nous ne garantissons pas qu’il sera ininterrompu ou exempt d’erreurs, ni que son contenu est complet ou exact pour un usage particulier.',
      ],
    },
    {
      heading: '12. Limitation de responsabilité',
      blocks: [
        'Dans toute la mesure permise par la loi, l’exploitant n’est pas responsable des pertes indirectes, accessoires ou consécutives, ni des pertes de jeu, résultant de votre utilisation du Service. Aucune disposition des présentes Conditions ne limite une responsabilité qui ne peut être limitée en vertu de la loi.',
      ],
    },
    {
      heading: '13. Suspension et résiliation',
      blocks: [
        'Vous pouvez cesser d’utiliser le Service et supprimer votre compte à tout moment. Nous pouvons suspendre votre accès ou y mettre fin si vous enfreignez les présentes Conditions ou faites un usage abusif du Service.',
      ],
    },
    {
      heading: '14. Modifications des présentes Conditions',
      blocks: [
        'Nous pouvons mettre à jour les présentes Conditions. Dans ce cas, nous mettrons à jour cette page et sa date, et la poursuite de l’utilisation après une modification signifie que vous acceptez les Conditions mises à jour.',
      ],
    },
    {
      heading: '15. Droit applicable',
      blocks: [
        `Les présentes Conditions sont régies par ${legalGoverningLaw('fr')}, sans préjudice des dispositions impératives de protection des consommateurs dont vous bénéficiez là où vous résidez.`,
      ],
    },
    {
      heading: '16. Contact',
      blocks: [
        `Questions sur les présentes Conditions : ${M.contactEmail}.`,
      ],
    },
  ],
}
