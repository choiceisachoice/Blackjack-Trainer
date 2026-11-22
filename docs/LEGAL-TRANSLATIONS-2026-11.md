# Legal pages in seven languages (21 Nov 2026)

## What was done

The Privacy Policy and the Terms of Use existed in English only, while the
site runs in seven languages: a German visitor on `/de/privacy` read English.
Both documents are now translated into German, French, Italian, Spanish,
Portuguese and Turkish and shown in the language of the page.

**The English version is the legally binding one.** Every translated page
says so at the top, in its own language, with a link to the English page.
The English page carries no such notice.

The Contact page was not touched: it holds no legal prose, only UI strings
that were already translated.

## Status of the translations — read this before relying on them

- They are **machine-made**. No lawyer and no native speaker has reviewed
  any of the six languages.
- They were written to be faithful and complete: same sections, same
  paragraphs, same bullets, nothing summarised, nothing added.
- What the test suite guarantees is *structure and facts*, not *meaning*:
  it cannot tell whether a sentence says the same thing as its English
  original, or whether a legal term is the one a court in that country
  would expect.
- Until reviewed, treat them as a reading aid. The notice on each page says
  exactly that, and it is the reason the notice exists.

## Where things live

| What | File |
|---|---|
| English originals (binding) | `src/pages/legal/privacy-content.ts`, `terms-content.ts` |
| Translations, one file per document per language | `src/pages/legal/translations/{privacy,terms}.{de,fr,it,es,pt,tr}.ts` |
| Language → document map, English fallback, the notice texts | `src/pages/legal/legal-docs.ts` |
| Per-language spelling of the facts (date, decimal mark, country, governing law) | `src/pages/legal/legal-locale.ts` |
| The facts themselves, once | `src/pages/legal/legal-meta.ts` (VAT rate: `services/pro-features.ts`) |
| Renderer, notice, footer date | `src/pages/legal/LegalPage.tsx` |

`LegalPage` takes the active language from i18next (which the URL prefix
sets), asks `legalDoc(kind, locale)` for the document and falls back to
English for a language that has none. No fact is typed into a translation:
operator, address, e-mail, hosting region, minimum age, VAT rate and date are
interpolated from the same constants the English text uses.

The date is written once, as `LAST_UPDATED_ISO` in `legal-meta.ts`, and
formatted per language (`18 November 2026`, `18. November 2026`,
`18 de noviembre de 2026`, `18 Kasım 2026`, …).

The link to the English version is a plain `<a href="/privacy">`, because the
router is rooted at the language prefix. On click it stores English as the
chosen language first — an unprefixed URL is drawn in the stored language,
and without that the English page would turn German again a moment later.
This is the same thing the language switcher does.

## When the English text changes

1. Edit the English file.
2. Make the same change in all six files under `translations/`.
3. Set `LAST_UPDATED_ISO` in `legal-meta.ts`.
4. Run `npx vitest run src/pages/legal`. `legal-translations.test.ts` fails
   if any language now has a different number of sections, paragraphs or
   bullets; if an e-mail address, URL, number or amount in an English block
   is missing from the same block of a translation (or a translation has one
   the English does not); if the operator, the product or a processor named
   in an English block is not named in its translation; if a block was left
   in English; or if the consent-bar button labels quoted in the policy no
   longer match the labels on the bar.

## Choices a reviewer should know about

- **Form of address** follows each language's UI, not a uniform formal
  register: German *du*, Spanish *tú*, Italian *tu*; French *vous*,
  Portuguese third person (*o seu*), Turkish *siz*. Decide per language
  whether legal text should be formal regardless of the UI.
- **Titles** match the site's own footer links (`contact.privacy`,
  `contact.terms`): "Datenschutzerklärung" / "Nutzungsbedingungen",
  "Politique de confidentialité" / "Conditions d’utilisation", and so on.
  "Terms of Use" was translated as such, not as "Allgemeine
  Geschäftsbedingungen" / "Conditions générales", which would be a different
  kind of document.
- **German** uses Swiss spelling (ss, no ß), Swiss terms (*Personendaten*,
  *bearbeiten*, *MWST*, *Konsumentinnen und Konsumenten*) and «…» quotes.
- **Swiss data protection act**: the English says "revDSG". German keeps
  "revDSG", French and Italian use "nLPD", Spanish, Portuguese and Turkish
  keep "revDSG" beside the translated name of the act. GDPR is "DSGVO" /
  "RGPD" / "GDPR" as each language says it.
- **Dates and decimals** use `de-CH`, `fr-CH`, `it-CH`, `es-ES`, `pt-PT`,
  `tr-TR`: the VAT rate reads 8.1 in German and Italian, 8,1 elsewhere.
- **Portuguese** is European Portuguese, like the UI (*palavra-passe*,
  *telemóvel*, *subscrição*).
- **Kept in English** in every language: product name, Pro, Stripe, Supabase,
  Cloudflare Turnstile, Global Privacy Control, Do Not Track, localStorage,
  and "row-level security" / "bet spread" / "scraping" in brackets after
  the translated term.

## Review checklist

For each of de, fr, it, es, pt, tr — ideally by a lawyer qualified for that
market, at minimum by a native speaker reading it against the English:

- [ ] Every sentence means what its English sentence means; nothing is
      stronger or weaker (watch "non-refundable", "to the fullest extent
      permitted by law", "without affecting mandatory consumer protections").
- [ ] Legal terms are the established ones: controller / processor,
      consent, standard contractual clauses, limitation of liability,
      governing law, "as is" / "as available".
- [ ] The form of address is right for a legal text in that language (see
      above) and is used consistently.
- [ ] The names of statutes and their abbreviations are the official ones
      in that language (Swiss FADP, GDPR).
- [ ] Terms 2 ("not gambling") uses the legally relevant word for gambling
      in that jurisdiction (*Glücksspiel*, *jeu d’argent*, *gioco d’azzardo*,
      *juego de azar*, *jogos de fortuna ou azar*, *kumar*).
- [ ] Terms 7 (prices and VAT): "final prices for consumers", "included",
      "stated separately on invoice and receipt" read as price-disclosure
      language, and the VAT abbreviation is the local one (MWST, TVA, IVA,
      KDV).
- [ ] Privacy 2, visit statistics: the consent bar's button labels quoted
      in the text are the ones on the bar (the test checks this) and the
      paragraph still reads naturally.
- [ ] The notice at the top is clear and unambiguous that English prevails.
- [ ] The meta titles/descriptions in `src/i18n/messages/<lang>.json`
      (`meta.pages.privacy`, `meta.pages.terms`) fit the reviewed text. They
      existed before this change and were not altered; note that several
      use the informal address ("deine Rechte", "tes droits", "os teus
      direitos") where the page itself may not.
- [ ] Decide whether a market needs more than a translation — a consumer in
      the EU may be entitled to the contract terms in their language, in
      which case "English prevails" may not hold against them. That is a
      legal question, not a translation question.

When a language has been reviewed, record it here with the date and the
reviewer.

| Language | Reviewed by | Date |
|---|---|---|
| de | — | — |
| fr | — | — |
| it | — | — |
| es | — | — |
| pt | — | — |
| tr | — | — |
