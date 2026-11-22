import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Términos de uso — Spanish translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const TERMS_ES: LegalDoc = {
  title: 'Términos de uso',
  intro: `Las normas para utilizar ${M.productName}. Última actualización: ${legalDate('es')}.`,
  sections: [
    {
      heading: '1. Acuerdo',
      blocks: [
        `Al crear una cuenta o utilizar ${M.productName} (el «Servicio»), aceptas estos Términos. Si no estás de acuerdo, te rogamos que no utilices el Servicio.`,
        `El Servicio es operado por ${M.operator}, con domicilio en ${legalLocation('es')}.`,
      ],
    },
    {
      heading: '2. Qué es el Servicio y qué no es',
      blocks: [
        'El Servicio es una herramienta de entrenamiento con fines educativos para aprender la estrategia básica del blackjack y el conteo de cartas. Todo el juego es simulado.',
        'No es un juego de azar. No ofrece apuestas con dinero real, no te permite apostar ni ganar dinero, y no es un casino ni un servicio de juegos de azar. Ningún resultado obtenido en el Servicio tiene valor monetario.',
      ],
    },
    {
      heading: '3. Requisitos',
      blocks: [
        `Para utilizar el Servicio debes tener al menos ${M.minimumAge} años y capacidad para celebrar un acuerdo vinculante.`,
      ],
    },
    {
      heading: '4. Tu cuenta',
      blocks: [
        'Mantén la confidencialidad de tus datos de acceso y facilita información veraz. Eres responsable de la actividad realizada con tu cuenta. Avísanos sin demora si crees que alguien ha accedido a ella sin tu permiso.',
      ],
    },
    {
      heading: '5. Uso aceptable',
      blocks: [
        'El Servicio es para tu uso personal y lícito. Te comprometes a no:',
        {
          list: [
            'revender, sublicenciar ni explotar comercialmente el Servicio o su contenido;',
            'copiar, extraer de forma automatizada (scraping), aplicar ingeniería inversa ni intentar extraer el código fuente o los datos subyacentes, salvo cuando la ley lo permita expresamente;',
            'perturbar, sobrecargar o interferir en el Servicio o en su seguridad;',
            'utilizar el Servicio para infringir la ley o los derechos de otra persona.',
          ],
        },
      ],
    },
    {
      heading: '6. Plan gratuito y suscripción Pro',
      blocks: [
        'El Servicio tiene un plan gratuito y una suscripción de pago «Pro». Pro se factura mensual o anualmente a través de nuestro proveedor de servicios de pago, Stripe, y se renueva automáticamente hasta que la canceles.',
        'Puedes cancelar en cualquier momento desde tu cuenta; tu acceso Pro continúa hasta el final del periodo que ya has pagado. Salvo que la ley exija otra cosa, los pagos ya realizados no son reembolsables. Podemos modificar los precios o las funciones, y avisaremos con una antelación razonable de los cambios sustanciales antes de que te afecten.',
      ],
    },
    {
      heading: '7. Precios e IVA suizo',
      blocks: [
        'Todos los precios que se muestran en este sitio web y dentro del Servicio están expresados en francos suizos y son precios finales para consumidores: el importe mostrado es el importe que se cobra. No se añade nada al pagar.',
        `Para los clientes en Suiza, estos precios incluyen el impuesto sobre el valor añadido (IVA) suizo al tipo legal aplicable (actualmente el ${legalNumber('es', CH_VAT_PERCENT)} %). El IVA está contenido en el precio mostrado y figura por separado en tu factura y en tu recibo de pago.`,
        'El Servicio se ofrece a particulares. Por ello, los precios se indican con el IVA incluido y nunca sin IVA.',
        'Si en el lugar donde vives, fuera de Suiza, se aplican impuestos o aranceles, estos corren por tu cuenta.',
      ],
    },
    {
      heading: '8. Sin asesoramiento financiero ni sobre juegos de azar',
      blocks: [
        'Todo lo que el Servicio muestra —incluidas las tablas de estrategia, las sugerencias de escala de apuestas (bet spread) y las cifras de bankroll— tiene fines exclusivamente educativos. No constituye asesoramiento financiero, de inversión ni sobre juegos de azar, y no garantiza ningún resultado. Cualquier decisión que tomes sobre el juego con dinero real es exclusivamente tuya.',
        'Juega solo si es legal donde te encuentras, solo con dinero que puedas permitirte perder, y de forma responsable.',
      ],
    },
    {
      heading: '9. Conteo de cartas y casinos',
      blocks: [
        'Contar cartas mentalmente es legal: es pensar. No obstante, los casinos son empresas privadas que fijan sus propias normas y pueden denegar o restringir el juego. No estamos afiliados a ningún casino y no somos responsables de cómo te trate un casino.',
      ],
    },
    {
      heading: '10. Propiedad intelectual',
      blocks: [
        'El Servicio, su contenido y su diseño pertenecen al operador o a sus licenciantes. Te concedemos un derecho limitado, personal e intransferible a utilizar el Servicio conforme a estos Términos; no se concede ningún otro derecho.',
      ],
    },
    {
      heading: '11. Exclusión de garantías',
      blocks: [
        'El Servicio se presta «tal cual» y «según disponibilidad». No garantizamos que vaya a funcionar sin interrupciones ni errores, ni que su contenido sea completo o exacto para un fin determinado.',
      ],
    },
    {
      heading: '12. Limitación de responsabilidad',
      blocks: [
        'En la máxima medida permitida por la ley, el operador no responde de ninguna pérdida indirecta, incidental o consecuente, ni de ninguna pérdida en el juego, derivada de tu uso del Servicio. Nada de lo dispuesto en estos Términos limita una responsabilidad que por ley no pueda limitarse.',
      ],
    },
    {
      heading: '13. Suspensión y terminación',
      blocks: [
        'Puedes dejar de utilizar el Servicio y eliminar tu cuenta en cualquier momento. Podemos suspender o dar por terminado tu acceso si incumples estos Términos o haces un uso indebido del Servicio.',
      ],
    },
    {
      heading: '14. Cambios en estos Términos',
      blocks: [
        'Podemos actualizar estos Términos. Cuando lo hagamos, actualizaremos esta página y su fecha, y el uso continuado tras un cambio significa que aceptas los Términos actualizados.',
      ],
    },
    {
      heading: '15. Ley aplicable',
      blocks: [
        `Estos Términos se rigen por ${legalGoverningLaw('es')}, sin perjuicio de las normas imperativas de protección de los consumidores que te amparen en el lugar donde vives.`,
      ],
    },
    {
      heading: '16. Contacto',
      blocks: [
        `Preguntas sobre estos Términos: ${M.contactEmail}.`,
      ],
    },
  ],
}
