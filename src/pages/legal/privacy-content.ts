import { LEGAL_META as M } from './legal-meta'
import type { LegalDoc } from './legal-types'

/**
 * Privacy Policy — describes what this app actually does with data, drawn from
 * the real schema (profiles, training_sessions, user_achievements,
 * bankroll_sessions) and the real processors (Supabase, Stripe). Nothing here
 * is boilerplate that the code doesn't back up.
 *
 * This is a solid, specific draft. Because the service takes payments and holds
 * personal data, have it reviewed by a lawyer before launch — the review will
 * be quick precisely because this reflects the true data flows.
 */
export const PRIVACY_DOC: LegalDoc = {
  title: 'Privacy Policy',
  intro: `How ${M.productName} collects, uses and protects your data — in plain language. Last updated ${M.lastUpdated}.`,
  sections: [
    {
      heading: '1. Who is responsible',
      blocks: [
        `${M.productName} is operated by ${M.operator}, based in ${M.operatorLocation} (the "operator", "we", "us"). We are the controller of the personal data described here.`,
        `For any privacy question or to exercise your rights, contact us at ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. The data we collect, and why',
      blocks: [
        'We only collect what the app needs to work. Specifically:',
        {
          list: [
            'Account: your email address and a password. The password is stored only as a secure hash by our authentication provider — we never see or store it in readable form. Email is used to sign you in, secure your account, and send account and payment-related messages.',
            'Profile & progress: a display name, your level and XP, streaks, unlocked achievements, chosen counting system, and app preferences (theme, sound, dealing speed). This runs the product and syncs your progress across your devices.',
            'Training records: each practice session you complete — the mode, your accuracy, duration, number of hands and similar figures. This powers your analytics and progress.',
            'Bankroll log (optional): if you use the bankroll tracker, we store exactly what you enter — a date, hours played, a casino name you type in, and the money amounts you record (profit or loss, and your bankroll). You choose whether to use this feature at all, and you can edit or delete these entries.',
            'Payment: if you subscribe to Pro, payment is handled by Stripe. We share your email and an internal account identifier with Stripe and receive back your subscription status. We never receive or store your full card number.',
            'Local device storage: your preferences and an offline copy of your progress are kept in your browser (localStorage), and a session cookie keeps you signed in. We do not use advertising or cross-site tracking cookies.',
          ],
        },
      ],
    },
    {
      heading: '3. What we do not do',
      blocks: [
        'We do not sell your data. We do not use advertising networks, and we do not run third-party analytics or tracking that profiles you across the web.',
      ],
    },
    {
      heading: '4. Who processes data on our behalf',
      blocks: [
        'We use a small number of service providers that process data only on our instructions:',
        {
          list: [
            'Supabase — hosts our database, handles authentication, and runs our server-side functions.',
            'Stripe — processes subscription payments as an independent payment processor. Stripe handles your card details under its own privacy policy.',
          ],
        },
      ],
    },
    {
      heading: '5. Where your data is stored',
      blocks: [
        `Your account and training data are stored by Supabase in the ${M.hostingRegion} region. Where data is processed outside your own country, that transfer relies on the safeguards those providers offer (such as standard contractual clauses).`,
      ],
    },
    {
      heading: '6. How long we keep it',
      blocks: [
        'We keep your data for as long as your account exists. When you delete your account, the personal data linked to it is removed. Signing out clears the offline copy stored in your browser.',
      ],
    },
    {
      heading: '7. How we protect it',
      blocks: [
        'Data is encrypted in transit (HTTPS). Access is restricted per user by database row-level security, so no account can read another account’s data. Passwords are hashed by our authentication provider.',
      ],
    },
    {
      heading: '8. Your rights',
      blocks: [
        'You can ask us to give you a copy of your data, correct it, delete it, export it, or restrict or object to certain processing, and you can withdraw consent at any time. Under the Swiss Federal Act on Data Protection (revDSG) and, for visitors in the EU/EEA, the GDPR, these rights apply to you.',
        `To exercise any of them, email ${M.contactEmail}. You also have the right to complain to your data protection authority.`,
      ],
    },
    {
      heading: '9. Children',
      blocks: [
        `${M.productName} is not intended for anyone under ${M.minimumAge}, and we do not knowingly collect data from them.`,
      ],
    },
    {
      heading: '10. Changes to this policy',
      blocks: [
        'If we change how we handle data, we will update this page and its "last updated" date. Significant changes will be highlighted where appropriate.',
      ],
    },
    {
      heading: '11. Contact',
      blocks: [
        `Questions about this policy or your data: ${M.contactEmail}.`,
      ],
    },
  ],
}
