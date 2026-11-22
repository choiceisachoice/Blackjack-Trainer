import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Nutzungsbedingungen — German translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together. Swiss spelling ("ss", never "ß"), like the rest of the German UI.
 */
export const TERMS_DE: LegalDoc = {
  title: 'Nutzungsbedingungen',
  intro: `Die Regeln für die Nutzung von ${M.productName}. Zuletzt aktualisiert am ${legalDate('de')}.`,
  sections: [
    {
      heading: '1. Vereinbarung',
      blocks: [
        `Indem du ein Konto erstellst oder ${M.productName} (den «Dienst») nutzt, stimmst du diesen Nutzungsbedingungen zu. Wenn du nicht einverstanden bist, nutze den Dienst bitte nicht.`,
        `Der Dienst wird von ${M.operator} mit Sitz in ${legalLocation('de')} betrieben.`,
      ],
    },
    {
      heading: '2. Was der Dienst ist — und was er nicht ist',
      blocks: [
        'Der Dienst ist ein Trainingswerkzeug zu Bildungszwecken, mit dem man die Blackjack-Basisstrategie und das Kartenzählen lernt. Das gesamte Spiel ist simuliert.',
        'Er ist kein Glücksspiel. Er bietet keine Einsätze um echtes Geld an, lässt dich weder Geld setzen noch gewinnen und ist weder ein Casino noch ein Glücksspielangebot. Kein Ergebnis im Dienst hat einen Geldwert.',
      ],
    },
    {
      heading: '3. Berechtigung',
      blocks: [
        `Du musst mindestens ${M.minimumAge} Jahre alt und in der Lage sein, eine verbindliche Vereinbarung einzugehen, um den Dienst zu nutzen.`,
      ],
    },
    {
      heading: '4. Dein Konto',
      blocks: [
        'Halte deine Zugangsdaten geheim und mache zutreffende Angaben. Du bist für die Aktivitäten unter deinem Konto verantwortlich. Teile uns umgehend mit, wenn du glaubst, dass ohne deine Erlaubnis darauf zugegriffen wurde.',
      ],
    },
    {
      heading: '5. Zulässige Nutzung',
      blocks: [
        'Der Dienst ist für deine persönliche, rechtmässige Nutzung bestimmt. Du verpflichtest dich, Folgendes zu unterlassen:',
        {
          list: [
            'den Dienst oder seine Inhalte weiterzuverkaufen, unterzulizenzieren oder kommerziell zu verwerten;',
            'den Quellcode oder die zugrunde liegenden Daten zu kopieren, automatisiert auszulesen (Scraping), zurückzuentwickeln oder deren Extraktion zu versuchen, ausser soweit das Gesetz es ausdrücklich erlaubt;',
            'den Dienst oder seine Sicherheit zu stören, zu überlasten oder zu beeinträchtigen;',
            'den Dienst zu nutzen, um gegen das Gesetz oder die Rechte einer anderen Person zu verstossen.',
          ],
        },
      ],
    },
    {
      heading: '6. Kostenlose Nutzung und Pro-Abo',
      blocks: [
        'Der Dienst hat eine kostenlose Stufe und ein kostenpflichtiges Abo «Pro». Pro wird monatlich oder jährlich über unseren Zahlungsdienstleister Stripe abgerechnet und verlängert sich automatisch, bis du kündigst.',
        'Du kannst jederzeit in deinem Konto kündigen; dein Pro-Zugang bleibt bis zum Ende des Zeitraums bestehen, den du bereits bezahlt hast. Soweit das Gesetz nichts anderes verlangt, werden bereits geleistete Zahlungen nicht erstattet. Wir können Preise oder Funktionen ändern und werden wesentliche Änderungen mit angemessener Frist ankündigen, bevor sie dich betreffen.',
      ],
    },
    {
      heading: '7. Preise und Schweizer MWST',
      blocks: [
        'Alle Preise, die auf dieser Website und im Dienst angezeigt werden, sind in Schweizer Franken angegeben und sind Endpreise für Konsumentinnen und Konsumenten: Der angezeigte Betrag ist der Betrag, der belastet wird. Beim Bezahlen kommt nichts hinzu.',
        `Für Kundinnen und Kunden in der Schweiz enthalten diese Preise die Schweizer Mehrwertsteuer (MWST) zum jeweils geltenden gesetzlichen Satz (derzeit ${legalNumber('de', CH_VAT_PERCENT)} %). Die MWST ist im angezeigten Preis enthalten und wird auf deiner Rechnung und deinem Zahlungsbeleg separat ausgewiesen.`,
        'Der Dienst wird Privatpersonen angeboten. Die Preise werden deshalb inklusive MWST angegeben und nie exklusive MWST.',
        'Falls an deinem Wohnort ausserhalb der Schweiz Steuern oder Abgaben anfallen, liegen diese in deiner Verantwortung.',
      ],
    },
    {
      heading: '8. Keine Finanz- oder Glücksspielberatung',
      blocks: [
        'Alles, was der Dienst zeigt — einschliesslich Strategietabellen, Vorschlägen zur Einsatzspanne (Bet Spread) und Bankroll-Zahlen —, dient ausschliesslich der Bildung. Es ist keine Finanz-, Anlage- oder Glücksspielberatung und garantiert kein Ergebnis. Jede Entscheidung, die du über echtes Glücksspiel triffst, ist allein deine eigene.',
        'Spiele nur, wenn es an deinem Aufenthaltsort legal ist, nur mit Geld, dessen Verlust du dir leisten kannst, und verantwortungsbewusst.',
      ],
    },
    {
      heading: '9. Kartenzählen und Casinos',
      blocks: [
        'Karten im Kopf zu zählen ist legal — es ist Denken. Casinos sind jedoch private Unternehmen, die ihre eigenen Regeln festlegen und das Spiel verweigern oder einschränken können. Wir stehen mit keinem Casino in Verbindung und sind nicht dafür verantwortlich, wie ein Casino dich behandelt.',
      ],
    },
    {
      heading: '10. Geistiges Eigentum',
      blocks: [
        'Der Dienst, seine Inhalte und seine Gestaltung gehören dem Betreiber oder dessen Lizenzgebern. Wir räumen dir ein beschränktes, persönliches, nicht übertragbares Recht ein, den Dienst gemäss diesen Nutzungsbedingungen zu nutzen; weitere Rechte werden nicht eingeräumt.',
      ],
    },
    {
      heading: '11. Gewährleistungsausschluss',
      blocks: [
        'Der Dienst wird «wie besehen» und «wie verfügbar» bereitgestellt. Wir gewährleisten nicht, dass er ununterbrochen oder fehlerfrei funktioniert oder dass seine Inhalte für einen bestimmten Zweck vollständig oder richtig sind.',
      ],
    },
    {
      heading: '12. Haftungsbeschränkung',
      blocks: [
        'Soweit gesetzlich zulässig, haftet der Betreiber nicht für indirekte, beiläufige oder Folgeschäden und nicht für Glücksspielverluste, die aus deiner Nutzung des Dienstes entstehen. Nichts in diesen Nutzungsbedingungen beschränkt eine Haftung, die von Gesetzes wegen nicht beschränkt werden kann.',
      ],
    },
    {
      heading: '13. Sperrung und Beendigung',
      blocks: [
        'Du kannst die Nutzung des Dienstes jederzeit einstellen und dein Konto löschen. Wir können deinen Zugang sperren oder beenden, wenn du gegen diese Nutzungsbedingungen verstösst oder den Dienst missbrauchst.',
      ],
    },
    {
      heading: '14. Änderungen dieser Nutzungsbedingungen',
      blocks: [
        'Wir können diese Nutzungsbedingungen aktualisieren. In diesem Fall aktualisieren wir diese Seite und ihr Datum, und die fortgesetzte Nutzung nach einer Änderung bedeutet, dass du die aktualisierten Nutzungsbedingungen annimmst.',
      ],
    },
    {
      heading: '15. Anwendbares Recht',
      blocks: [
        `Diese Nutzungsbedingungen unterstehen ${legalGoverningLaw('de')}; zwingende Konsumentenschutzbestimmungen, die dir an deinem Wohnort zustehen, bleiben davon unberührt.`,
      ],
    },
    {
      heading: '16. Kontakt',
      blocks: [
        `Fragen zu diesen Nutzungsbedingungen: ${M.contactEmail}.`,
      ],
    },
  ],
}
