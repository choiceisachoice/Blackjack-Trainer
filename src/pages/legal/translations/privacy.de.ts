import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Datenschutzerklärung — German translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together. Swiss spelling ("ss", never "ß"), like the rest of the German UI.
 */
export const PRIVACY_DE: LegalDoc = {
  title: 'Datenschutzerklärung',
  intro: `Wie ${M.productName} deine Daten erhebt, verwendet und schützt — in verständlicher Sprache. Zuletzt aktualisiert am ${legalDate('de')}.`,
  sections: [
    {
      heading: '1. Wer verantwortlich ist',
      blocks: [
        `${M.productName} wird von ${M.operator} mit Sitz in ${legalLocation('de')} betrieben (der «Betreiber», «wir», «uns»). Wir sind der Verantwortliche für die hier beschriebenen Personendaten.`,
        `Bei Fragen zum Datenschutz oder um deine Rechte auszuüben, erreichst du uns unter ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. Welche Daten wir erheben und warum',
      blocks: [
        'Wir erheben nur, was die App zum Funktionieren braucht. Im Einzelnen:',
        {
          list: [
            'Konto: deine E-Mail-Adresse und ein Passwort. Das Passwort wird von unserem Authentifizierungsanbieter ausschliesslich als sicherer Hash gespeichert — wir sehen und speichern es nie in lesbarer Form. Die E-Mail-Adresse dient dazu, dich anzumelden, dein Konto zu sichern und dir Nachrichten zu Konto und Zahlung zu senden.',
            'Profil und Fortschritt: ein Anzeigename, dein Level und deine XP, Serien, freigeschaltete Auszeichnungen, das gewählte Zählsystem und App-Einstellungen (Design, Ton, Austeilgeschwindigkeit). Damit läuft das Produkt, und dein Fortschritt wird zwischen deinen Geräten synchronisiert.',
            'Trainingsdaten: jede Übungseinheit, die du abschliesst — der Modus, deine Genauigkeit, die Dauer, die Anzahl Hände und ähnliche Werte. Daraus entstehen deine Auswertung und dein Fortschritt.',
            'Bankroll-Protokoll (freiwillig): Wenn du das Echtgeld-Logbuch verwendest, speichern wir genau das, was du eingibst — ein Datum, gespielte Stunden, einen Casino-Namen, den du eintippst, und die Geldbeträge, die du erfasst (Gewinn oder Verlust sowie deine Bankroll). Du entscheidest, ob du diese Funktion überhaupt nutzt, und du kannst diese Einträge bearbeiten oder löschen.',
            'Zahlung: Wenn du Pro abonnierst, wird die Zahlung von Stripe abgewickelt. Wir geben deine E-Mail-Adresse und eine interne Kontokennung an Stripe weiter und erhalten deinen Abostatus zurück. Deine vollständige Kartennummer erhalten und speichern wir nie.',
            'Lokaler Gerätespeicher: Deine Einstellungen und eine Offline-Kopie deines Fortschritts werden in deinem Browser gespeichert (localStorage), und ein Sitzungs-Cookie hält dich angemeldet. Wir verwenden keine Werbe-Cookies und keine Cookies für seitenübergreifendes Tracking.',
            'Bot-Prüfung: Wenn du dich anmeldest, registrierst oder das Zurücksetzen des Passworts anforderst, prüft Cloudflare Turnstile, ob ein Mensch — und kein Skript — das Formular absendet. Für diese Prüfung verarbeitet Cloudflare deine IP-Adresse und technische Merkmale deines Browsers gemäss seiner eigenen Datenschutzerklärung. Wir erhalten nur ein Token «bestanden» oder «nicht bestanden» und sehen diese Angaben nie.',
            'Besuchsstatistik: Um zu wissen, wie viele Personen die Website besuchen, welche Seiten sie lesen und wie lange sie bleiben, erfassen wir jeden Seitenaufruf in unserer eigenen Datenbank — den Pfad der Seite, die Uhrzeit, die Website, die auf uns verlinkt hat (nur deren Domain), ob das Gerät ein Telefon, ein Tablet oder ein Desktop-Computer ist, und eine zufällige Besucherkennung, die in deinem Browser gespeichert ist. Diese Kennung ist eine Zufallszahl; sie wird weder aus dir noch aus deinem Gerät abgeleitet, wird mit niemandem geteilt und wird beim Abmelden ersetzt. Wir speichern weder deine IP-Adresse noch die Kennzeichnung deines Browsers. Wenn du angemeldet bist, wird ein Besuch mit deinem Konto verknüpft. Mit derselben Kennung erfassen wir ausserdem, welche Schritte der Registrierung und des Upgrades erreicht wurden — dass das Registrierformular oder das Upgrade-Angebot angezeigt wurde, dass ein Konto erstellt, eine erste Trainingssitzung abgeschlossen und ein Bezahlvorgang gestartet wurde — und zwar nur als Name des Schritts und Zeitpunkt, ohne weitere Angaben. Browser, die das Signal Global Privacy Control oder Do Not Track senden, werden überhaupt nicht gezählt. Diese Statistik wird 13 Monate aufbewahrt. Wir tun dies nur, wenn du zustimmst: Bei deinem ersten Besuch fragt eine Leiste am unteren Seitenrand, ob du Cookies akzeptierst, und bis du «Akzeptieren» wählst, wird nichts erfasst und keine Kennung gespeichert. (Genau genommen handelt es sich um einen Eintrag im lokalen Speicher deines Browsers und nicht um ein Cookie; wir verwenden das geläufige Wort, weil es dieselbe Aufgabe erfüllt und unter dieselben Regeln fällt.) «Ablehnen» entfernt eine früher gespeicherte Kennung. Du kannst deine Antwort jederzeit unter «Cookie-Einstellungen» am Fuss jeder öffentlichen Seite ändern. Ein Browser, der Global Privacy Control oder Do Not Track sendet, wird ohne Nachfrage als «Nein» behandelt.',
            'Fehlerberichte: Wenn ein Kauf oder eine Kontoaktion (das Öffnen des Abrechnungsportals, das Exportieren oder Zurücksetzen deiner Daten, das Ändern deines Namens oder Bildes) aus technischen Gründen fehlschlägt, erfassen wir die Fehlermeldung, die Seite, auf der du warst, die Uhrzeit, die Version der App und — falls du angemeldet warst — die Verknüpfung mit deinem Konto, damit wir den Fehler finden und beheben können. Alles in der Meldung, was wie eine E-Mail-Adresse oder ein Zugriffstoken aussieht, wird vor dem Senden entfernt. Diese Berichte werden 90 Tage aufbewahrt.',
          ],
        },
      ],
    },
    {
      heading: '3. Was wir nicht tun',
      blocks: [
        'Wir verkaufen deine Daten nicht. Wir nutzen keine Werbenetzwerke, und wir setzen keine Analyse- oder Tracking-Dienste Dritter ein, die über das Web hinweg ein Profil von dir erstellen. Die oben beschriebene Besuchsstatistik wird ausschliesslich von uns erhoben, bleibt in unserer eigenen Datenbank und wird nicht mit Daten anderer Websites zusammengeführt.',
      ],
    },
    {
      heading: '4. Wer in unserem Auftrag Daten bearbeitet',
      blocks: [
        'Wir setzen eine kleine Zahl von Dienstleistern ein, die Daten nur nach unseren Weisungen bearbeiten:',
        {
          list: [
            'Supabase — hostet unsere Datenbank, übernimmt die Authentifizierung und führt unsere serverseitigen Funktionen aus.',
            'Stripe — wickelt Abozahlungen als unabhängiger Zahlungsdienstleister ab. Stripe bearbeitet deine Kartendaten gemäss seiner eigenen Datenschutzerklärung.',
            'Cloudflare — führt die Bot-Prüfung (Turnstile) in den Formularen für Anmeldung, Registrierung und Passwort-Zurücksetzung durch.',
          ],
        },
      ],
    },
    {
      heading: '5. Wo deine Daten gespeichert werden',
      blocks: [
        `Deine Konto- und Trainingsdaten werden von Supabase in der Region ${M.hostingRegion} gespeichert. Soweit Daten ausserhalb deines eigenen Landes bearbeitet werden, stützt sich diese Übermittlung auf die Garantien, die diese Anbieter bieten (etwa Standardvertragsklauseln).`,
      ],
    },
    {
      heading: '6. Wie lange wir sie aufbewahren',
      blocks: [
        'Wir bewahren deine Daten so lange auf, wie dein Konto besteht. Wenn du dein Konto löschst, werden die damit verknüpften Personendaten entfernt, und allfällige Besuchsstatistiken werden davon gelöst. Beim Abmelden wird die in deinem Browser gespeicherte Offline-Kopie gelöscht. Besuchsstatistiken werden 13 Monate und Fehlerberichte 90 Tage aufbewahrt; beide werden von einem wöchentlichen Job gelöscht, sodass ein Eintrag bis zu eine Woche über seine Frist hinaus bestehen bleiben kann.',
      ],
    },
    {
      heading: '7. Wie wir sie schützen',
      blocks: [
        'Daten werden bei der Übertragung verschlüsselt (HTTPS). Der Zugriff ist pro Benutzer durch Sicherheitsregeln auf Zeilenebene der Datenbank (Row-Level Security) beschränkt, sodass kein Konto die Daten eines anderen Kontos lesen kann. Passwörter werden von unserem Authentifizierungsanbieter gehasht.',
      ],
    },
    {
      heading: '8. Deine Rechte',
      blocks: [
        'Du kannst von uns verlangen, dir eine Kopie deiner Daten zu geben, sie zu berichtigen, zu löschen oder zu exportieren oder bestimmte Bearbeitungen einzuschränken oder ihnen zu widersprechen, und du kannst eine Einwilligung jederzeit widerrufen. Nach dem Schweizer Bundesgesetz über den Datenschutz (revDSG) und, für Besucherinnen und Besucher in der EU/im EWR, nach der DSGVO stehen dir diese Rechte zu.',
        `Um eines davon auszuüben, schreibe an ${M.contactEmail}. Du hast ausserdem das Recht, bei deiner Datenschutzbehörde Beschwerde einzureichen.`,
      ],
    },
    {
      heading: '9. Kinder',
      blocks: [
        `${M.productName} richtet sich nicht an Personen unter ${M.minimumAge} Jahren, und wir erheben nicht wissentlich Daten von ihnen.`,
      ],
    },
    {
      heading: '10. Änderungen dieser Erklärung',
      blocks: [
        'Wenn wir ändern, wie wir mit Daten umgehen, aktualisieren wir diese Seite und ihr Datum «zuletzt aktualisiert». Wesentliche Änderungen heben wir hervor, wo es angebracht ist.',
      ],
    },
    {
      heading: '11. Kontakt',
      blocks: [
        `Fragen zu dieser Erklärung oder zu deinen Daten: ${M.contactEmail}.`,
      ],
    },
  ],
}
