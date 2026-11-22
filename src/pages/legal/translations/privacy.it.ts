import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Informativa sulla privacy — Italian translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const PRIVACY_IT: LegalDoc = {
  title: 'Informativa sulla privacy',
  intro: `Come ${M.productName} raccoglie, utilizza e protegge i tuoi dati — in un linguaggio chiaro. Ultimo aggiornamento: ${legalDate('it')}.`,
  sections: [
    {
      heading: '1. Chi è il titolare',
      blocks: [
        `${M.productName} è gestito da ${M.operator}, con sede in ${legalLocation('it')} (il «gestore», «noi»). Siamo il titolare del trattamento dei dati personali qui descritti.`,
        `Per qualsiasi domanda sulla privacy o per esercitare i tuoi diritti, contattaci all’indirizzo ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. I dati che raccogliamo, e perché',
      blocks: [
        'Raccogliamo solo ciò che serve all’app per funzionare. In particolare:',
        {
          list: [
            'Account: il tuo indirizzo e-mail e una password. La password è conservata soltanto come hash sicuro dal nostro fornitore di autenticazione — non la vediamo né la conserviamo mai in forma leggibile. L’e-mail serve per farti accedere, proteggere il tuo account e inviarti messaggi relativi all’account e ai pagamenti.',
            'Profilo e progressi: un nome visualizzato, il tuo livello e i tuoi XP, le serie, i riconoscimenti sbloccati, il sistema di conteggio scelto e le preferenze dell’app (tema, audio, velocità di distribuzione). Questo fa funzionare il prodotto e sincronizza i tuoi progressi tra i tuoi dispositivi.',
            'Dati di allenamento: ogni sessione di pratica che completi — la modalità, la tua precisione, la durata, il numero di mani e valori simili. Su questo si basano le tue analisi e i tuoi progressi.',
            'Registro della bankroll (facoltativo): se usi il registro della bankroll, conserviamo esattamente ciò che inserisci — una data, le ore giocate, il nome di un casinò che digiti e gli importi di denaro che registri (profitto o perdita, e la tua bankroll). Sei tu a scegliere se usare questa funzione, e puoi modificare o eliminare queste voci.',
            'Pagamento: se ti abboni a Pro, il pagamento è gestito da Stripe. Comunichiamo a Stripe la tua e-mail e un identificativo interno dell’account e riceviamo in cambio lo stato del tuo abbonamento. Non riceviamo né conserviamo mai il numero completo della tua carta.',
            'Archiviazione locale sul dispositivo: le tue preferenze e una copia offline dei tuoi progressi sono conservate nel tuo browser (localStorage), e un cookie di sessione ti mantiene connesso. Non utilizziamo cookie pubblicitari né cookie di tracciamento tra siti.',
            'Controllo anti-bot: quando accedi, ti registri o richiedi la reimpostazione della password, Cloudflare Turnstile verifica che a inviare il modulo sia una persona — non uno script. Per questo controllo Cloudflare tratta il tuo indirizzo IP e le caratteristiche tecniche del tuo browser in base alla propria informativa sulla privacy. Noi riceviamo soltanto un token «superato» o «non superato» e non vediamo mai quei dettagli.',
            'Statistiche delle visite: per sapere quante persone visitano il sito, quali pagine leggono e quanto a lungo restano, registriamo ogni visualizzazione di pagina nel nostro database — il percorso della pagina, l’ora, il sito che rimandava a noi (solo il suo dominio), se il dispositivo è un telefono, un tablet o un computer desktop, e un identificativo casuale del visitatore conservato nel tuo browser. Quell’identificativo è un numero casuale; non è ricavato da te né dal tuo dispositivo, non è condiviso con nessuno e viene sostituito quando esci dall’account. Non conserviamo il tuo indirizzo IP né la stringa di identificazione del tuo browser. Se hai effettuato l’accesso, la visita è collegata al tuo account. Con lo stesso identificativo registriamo inoltre quali passaggi della registrazione e dell’upgrade sono stati raggiunti — che è stato mostrato il modulo di registrazione o l’offerta di upgrade, che è stato creato un account, che è stata completata una prima sessione di allenamento e che è stato avviato un pagamento — soltanto come nome del passaggio e ora, senza altri dettagli. I browser che inviano il segnale Global Privacy Control o Do Not Track non vengono conteggiati affatto. Queste statistiche sono conservate per 13 mesi. Lo facciamo solo se acconsenti: alla tua prima visita una barra in fondo alla pagina chiede se accetti i cookie, e finché non scegli «Accetta» non viene registrato nulla e non viene conservato alcun identificativo. (A rigore si tratta di una voce nell’archiviazione locale del tuo browser e non di un cookie; usiamo la parola consueta perché svolge la stessa funzione ed è soggetta alle stesse regole.) «Rifiuta» rimuove un identificativo conservato in precedenza. Puoi cambiare la tua risposta in qualsiasi momento in «Impostazioni dei cookie» in fondo a ogni pagina pubblica. Un browser che invia Global Privacy Control o Do Not Track è trattato come un «no» senza che la domanda venga posta.',
            'Segnalazioni di errore: quando un acquisto o un’azione sull’account (aprire il portale di fatturazione, esportare o azzerare i tuoi dati, cambiare il tuo nome o la tua immagine) non riesce per un motivo tecnico, registriamo il messaggio di errore, la pagina in cui ti trovavi, l’ora, la versione dell’app e — se avevi effettuato l’accesso — il collegamento al tuo account, così da poter individuare e correggere il guasto. Tutto ciò che nel messaggio somiglia a un indirizzo e-mail o a un token di accesso viene rimosso prima dell’invio. Queste segnalazioni sono conservate per 90 giorni.',
          ],
        },
      ],
    },
    {
      heading: '3. Che cosa non facciamo',
      blocks: [
        'Non vendiamo i tuoi dati. Non utilizziamo reti pubblicitarie e non impieghiamo strumenti di analisi o di tracciamento di terze parti che ti profilino attraverso il web. Le statistiche delle visite descritte sopra sono raccolte soltanto da noi, restano nel nostro database e non vengono combinate con i dati di nessun altro sito.',
      ],
    },
    {
      heading: '4. Chi tratta i dati per nostro conto',
      blocks: [
        'Ci avvaliamo di un numero ristretto di fornitori di servizi che trattano i dati soltanto secondo le nostre istruzioni:',
        {
          list: [
            'Supabase — ospita il nostro database, gestisce l’autenticazione ed esegue le nostre funzioni lato server.',
            'Stripe — elabora i pagamenti degli abbonamenti come fornitore di servizi di pagamento indipendente. Stripe tratta i dati della tua carta in base alla propria informativa sulla privacy.',
            'Cloudflare — esegue il controllo anti-bot (Turnstile) nei moduli di accesso, registrazione e reimpostazione della password.',
          ],
        },
      ],
    },
    {
      heading: '5. Dove sono conservati i tuoi dati',
      blocks: [
        `I dati del tuo account e dei tuoi allenamenti sono conservati da Supabase nella regione ${M.hostingRegion}. Quando i dati sono trattati al di fuori del tuo Paese, tale trasferimento si fonda sulle garanzie offerte da quei fornitori (come le clausole contrattuali tipo).`,
      ],
    },
    {
      heading: '6. Per quanto tempo li conserviamo',
      blocks: [
        'Conserviamo i tuoi dati finché esiste il tuo account. Quando elimini il tuo account, i dati personali a esso collegati vengono rimossi e le eventuali statistiche delle visite ne vengono scollegate. L’uscita dall’account cancella la copia offline conservata nel tuo browser. Le statistiche delle visite sono conservate per 13 mesi e le segnalazioni di errore per 90 giorni; entrambe vengono eliminate da un processo settimanale, per cui una voce può restare fino a una settimana oltre il suo termine.',
      ],
    },
    {
      heading: '7. Come li proteggiamo',
      blocks: [
        'I dati sono cifrati in transito (HTTPS). L’accesso è limitato per singolo utente dalla sicurezza a livello di riga del database (row-level security), cosicché nessun account può leggere i dati di un altro account. Le password sono sottoposte a hash dal nostro fornitore di autenticazione.',
      ],
    },
    {
      heading: '8. I tuoi diritti',
      blocks: [
        'Puoi chiederci di fornirti una copia dei tuoi dati, di rettificarli, cancellarli, esportarli, oppure di limitare determinati trattamenti o di opporti a essi, e puoi revocare il consenso in qualsiasi momento. Ai sensi della legge federale svizzera sulla protezione dei dati (nLPD) e, per i visitatori nell’UE/SEE, del GDPR, questi diritti ti spettano.',
        `Per esercitarne uno, scrivi a ${M.contactEmail}. Hai inoltre il diritto di presentare reclamo alla tua autorità per la protezione dei dati.`,
      ],
    },
    {
      heading: '9. Minori',
      blocks: [
        `${M.productName} non è destinato a persone di età inferiore a ${M.minimumAge} anni, e non raccogliamo consapevolmente dati che le riguardano.`,
      ],
    },
    {
      heading: '10. Modifiche alla presente informativa',
      blocks: [
        'Se cambiamo il modo in cui trattiamo i dati, aggiorneremo questa pagina e la sua data di «ultimo aggiornamento». Le modifiche rilevanti saranno messe in evidenza ove opportuno.',
      ],
    },
    {
      heading: '11. Contatti',
      blocks: [
        `Domande sulla presente informativa o sui tuoi dati: ${M.contactEmail}.`,
      ],
    },
  ],
}
