import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Condizioni d’uso — Italian translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const TERMS_IT: LegalDoc = {
  title: 'Condizioni d’uso',
  intro: `Le regole per l’utilizzo di ${M.productName}. Ultimo aggiornamento: ${legalDate('it')}.`,
  sections: [
    {
      heading: '1. Accordo',
      blocks: [
        `Creando un account o utilizzando ${M.productName} (il «Servizio»), accetti le presenti Condizioni. Se non sei d’accordo, ti preghiamo di non utilizzare il Servizio.`,
        `Il Servizio è gestito da ${M.operator}, con sede in ${legalLocation('it')}.`,
      ],
    },
    {
      heading: '2. Che cos’è il Servizio — e che cosa non è',
      blocks: [
        'Il Servizio è uno strumento di allenamento a scopo didattico per imparare la strategia di base del blackjack e il conteggio delle carte. Tutto il gioco è simulato.',
        'Non è gioco d’azzardo. Non offre scommesse con denaro reale, non ti consente di puntare né di vincere denaro e non è un casinò né un servizio di gioco d’azzardo. Nessun risultato ottenuto nel Servizio ha valore monetario.',
      ],
    },
    {
      heading: '3. Requisiti',
      blocks: [
        `Per utilizzare il Servizio devi avere almeno ${M.minimumAge} anni ed essere in grado di concludere un accordo vincolante.`,
      ],
    },
    {
      heading: '4. Il tuo account',
      blocks: [
        'Mantieni riservati i tuoi dati di accesso e fornisci informazioni corrette. Sei responsabile dell’attività svolta con il tuo account. Comunicaci tempestivamente se ritieni che qualcuno vi abbia avuto accesso senza la tua autorizzazione.',
      ],
    },
    {
      heading: '5. Uso consentito',
      blocks: [
        'Il Servizio è destinato al tuo uso personale e lecito. Ti impegni a non:',
        {
          list: [
            'rivendere, concedere in sublicenza o sfruttare commercialmente il Servizio o i suoi contenuti;',
            'copiare, estrarre in modo automatizzato (scraping), decompilare o tentare di estrarre il codice sorgente o i dati sottostanti, salvo nei casi in cui la legge lo consenta espressamente;',
            'disturbare, sovraccaricare o interferire con il Servizio o con la sua sicurezza;',
            'utilizzare il Servizio per violare la legge o i diritti di un’altra persona.',
          ],
        },
      ],
    },
    {
      heading: '6. Piano gratuito e abbonamento Pro',
      blocks: [
        'Il Servizio prevede un piano gratuito e un abbonamento a pagamento «Pro». Pro è fatturato mensilmente o annualmente tramite il nostro fornitore di servizi di pagamento, Stripe, e si rinnova automaticamente finché non lo disdici.',
        'Puoi disdire in qualsiasi momento dal tuo account; il tuo accesso Pro prosegue fino alla fine del periodo che hai già pagato. Salvo ove la legge disponga diversamente, i pagamenti già effettuati non sono rimborsabili. Possiamo modificare prezzi o funzionalità e daremo un ragionevole preavviso delle modifiche sostanziali prima che ti riguardino.',
      ],
    },
    {
      heading: '7. Prezzi e IVA svizzera',
      blocks: [
        'Tutti i prezzi indicati su questo sito e all’interno del Servizio sono espressi in franchi svizzeri e sono prezzi finali per i consumatori: l’importo mostrato è l’importo addebitato. Al momento del pagamento non viene aggiunto nulla.',
        `Per i clienti in Svizzera, questi prezzi comprendono l’imposta sul valore aggiunto (IVA) svizzera all’aliquota legale applicabile (attualmente ${legalNumber('it', CH_VAT_PERCENT)} %). L’IVA è compresa nel prezzo indicato ed è esposta separatamente nella tua fattura e nella ricevuta di pagamento.`,
        'Il Servizio è offerto a persone private. I prezzi sono pertanto indicati IVA inclusa e mai IVA esclusa.',
        'Se nel luogo in cui vivi, fuori dalla Svizzera, si applicano imposte o dazi, questi sono a tuo carico.',
      ],
    },
    {
      heading: '8. Nessuna consulenza finanziaria o sul gioco d’azzardo',
      blocks: [
        'Tutto ciò che il Servizio mostra — comprese le tabelle di strategia, i suggerimenti sulla scala delle puntate (bet spread) e le cifre della bankroll — ha esclusivamente finalità didattiche. Non costituisce consulenza finanziaria, in materia di investimenti o di gioco d’azzardo, e non garantisce alcun risultato. Ogni decisione che prendi riguardo al gioco d’azzardo reale è interamente tua.',
        'Gioca solo se è legale nel luogo in cui ti trovi, solo con denaro che puoi permetterti di perdere, e in modo responsabile.',
      ],
    },
    {
      heading: '9. Conteggio delle carte e casinò',
      blocks: [
        'Contare le carte a mente è legale — è pensare. Tuttavia i casinò sono imprese private che stabiliscono le proprie regole e possono rifiutare o limitare il gioco. Non siamo affiliati ad alcun casinò e non siamo responsabili di come un casinò ti tratta.',
      ],
    },
    {
      heading: '10. Proprietà intellettuale',
      blocks: [
        'Il Servizio, i suoi contenuti e il suo design appartengono al gestore o ai suoi licenzianti. Ti concediamo un diritto limitato, personale e non trasferibile di utilizzare il Servizio ai sensi delle presenti Condizioni; non è concesso alcun altro diritto.',
      ],
    },
    {
      heading: '11. Esclusione di garanzie',
      blocks: [
        'Il Servizio è fornito «così com’è» e «secondo disponibilità». Non garantiamo che sarà ininterrotto o privo di errori, né che i suoi contenuti siano completi o accurati per uno scopo particolare.',
      ],
    },
    {
      heading: '12. Limitazione di responsabilità',
      blocks: [
        'Nella misura massima consentita dalla legge, il gestore non risponde di perdite indirette, incidentali o consequenziali, né di perdite di gioco, derivanti dal tuo utilizzo del Servizio. Nulla nelle presenti Condizioni limita una responsabilità che per legge non può essere limitata.',
      ],
    },
    {
      heading: '13. Sospensione e cessazione',
      blocks: [
        'Puoi smettere di utilizzare il Servizio ed eliminare il tuo account in qualsiasi momento. Possiamo sospendere o far cessare il tuo accesso se violi le presenti Condizioni o fai un uso improprio del Servizio.',
      ],
    },
    {
      heading: '14. Modifiche alle presenti Condizioni',
      blocks: [
        'Possiamo aggiornare le presenti Condizioni. In tal caso aggiorneremo questa pagina e la sua data, e l’uso continuato dopo una modifica significa che accetti le Condizioni aggiornate.',
      ],
    },
    {
      heading: '15. Diritto applicabile',
      blocks: [
        `Le presenti Condizioni sono disciplinate dal ${legalGoverningLaw('it')}, fatte salve le tutele inderogabili dei consumatori di cui godi nel luogo in cui vivi.`,
      ],
    },
    {
      heading: '16. Contatti',
      blocks: [
        `Domande sulle presenti Condizioni: ${M.contactEmail}.`,
      ],
    },
  ],
}
