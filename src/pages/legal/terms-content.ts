import { LEGAL_META as M } from './legal-meta'
import type { LegalDoc } from './legal-types'

/**
 * Terms of Use. Written for what this product actually is — a simulated
 * training tool that takes a subscription — not a generic template. The
 * gambling framing matters: the app teaches card counting but offers no
 * real-money play, and the terms need to say so plainly to protect both sides.
 *
 * A solid draft; have a lawyer review it before launch, especially the
 * liability, refund and subscription clauses, which vary by jurisdiction.
 */
export const TERMS_DOC: LegalDoc = {
  title: 'Terms of Use',
  intro: `The rules for using ${M.productName}. Last updated ${M.lastUpdated}.`,
  sections: [
    {
      heading: '1. Agreement',
      blocks: [
        `By creating an account or using ${M.productName} (the "Service"), you agree to these Terms. If you do not agree, please do not use the Service.`,
        `The Service is operated by ${M.operator}, based in ${M.operatorLocation}.`,
      ],
    },
    {
      heading: '2. What the Service is — and what it is not',
      blocks: [
        'The Service is an educational training tool for learning blackjack basic strategy and card counting. All play is simulated.',
        'It is not gambling. It does not offer real-money betting, does not let you wager or win money, and is not a casino or a gambling service. No outcome in the Service has any monetary value.',
      ],
    },
    {
      heading: '3. Eligibility',
      blocks: [
        `You must be at least ${M.minimumAge} years old and able to enter into a binding agreement to use the Service.`,
      ],
    },
    {
      heading: '4. Your account',
      blocks: [
        'Keep your login details confidential and provide accurate information. You are responsible for activity under your account. Tell us promptly if you believe it has been accessed without your permission.',
      ],
    },
    {
      heading: '5. Acceptable use',
      blocks: [
        'The Service is for your personal, lawful use. You agree not to:',
        {
          list: [
            'resell, sublicense or commercially exploit the Service or its content;',
            'copy, scrape, reverse-engineer or attempt to extract the source or underlying data, except where the law expressly allows it;',
            'disrupt, overload or interfere with the Service or its security;',
            'use the Service to break the law or another person’s rights.',
          ],
        },
      ],
    },
    {
      heading: '6. Free and Pro subscriptions',
      blocks: [
        'The Service has a free tier and a paid "Pro" subscription. Pro is billed monthly or yearly through our payment processor, Stripe, and renews automatically until you cancel.',
        'You can cancel at any time from your account; your Pro access continues until the end of the period you have already paid for. Except where the law requires otherwise, payments already made are non-refundable. We may change prices or features, and will give reasonable notice of material changes before they affect you.',
      ],
    },
    {
      heading: '7. No financial or gambling advice',
      blocks: [
        'Anything the Service shows — including strategy charts, bet-spread suggestions, bankroll figures and risk-of-ruin estimates — is for education only. It is not financial, investment or gambling advice, and it does not guarantee any result. Any decision you make about real gambling is entirely your own.',
        'Gamble only if it is legal where you are, only with money you can afford to lose, and responsibly.',
      ],
    },
    {
      heading: '8. Card counting and casinos',
      blocks: [
        'Counting cards mentally is legal — it is thinking. However, casinos are private businesses that set their own rules and may refuse or restrict play. We are not affiliated with any casino and are not responsible for how any casino treats you.',
      ],
    },
    {
      heading: '9. Intellectual property',
      blocks: [
        'The Service, its content and its design are owned by the operator or its licensors. We grant you a limited, personal, non-transferable right to use the Service under these Terms; no other rights are granted.',
      ],
    },
    {
      heading: '10. Disclaimers',
      blocks: [
        'The Service is provided "as is" and "as available". We do not warrant that it will be uninterrupted, error-free, or that its content is complete or accurate for any particular purpose.',
      ],
    },
    {
      heading: '11. Limitation of liability',
      blocks: [
        'To the fullest extent permitted by law, the operator is not liable for any indirect, incidental or consequential loss, or for any gambling losses, arising from your use of the Service. Nothing in these Terms limits liability that cannot be limited by law.',
      ],
    },
    {
      heading: '12. Suspension and termination',
      blocks: [
        'You may stop using the Service and delete your account at any time. We may suspend or end your access if you breach these Terms or misuse the Service.',
      ],
    },
    {
      heading: '13. Changes to these Terms',
      blocks: [
        'We may update these Terms. When we do, we will update this page and its date, and continued use after a change means you accept the updated Terms.',
      ],
    },
    {
      heading: '14. Governing law',
      blocks: [
        `These Terms are governed by the laws of ${M.governingLaw}, without affecting any mandatory consumer protections you have where you live.`,
      ],
    },
    {
      heading: '15. Contact',
      blocks: [
        `Questions about these Terms: ${M.contactEmail}.`,
      ],
    },
  ],
}
