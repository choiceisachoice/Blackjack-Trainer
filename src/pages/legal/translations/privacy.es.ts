import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Política de privacidad — Spanish translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const PRIVACY_ES: LegalDoc = {
  title: 'Política de privacidad',
  intro: `Cómo ${M.productName} recopila, utiliza y protege tus datos, en lenguaje claro. Última actualización: ${legalDate('es')}.`,
  sections: [
    {
      heading: '1. Quién es el responsable',
      blocks: [
        `${M.productName} es operado por ${M.operator}, con domicilio en ${legalLocation('es')} (el «operador», «nosotros»). Somos el responsable del tratamiento de los datos personales que aquí se describen.`,
        `Para cualquier consulta sobre privacidad o para ejercer tus derechos, escríbenos a ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. Los datos que recopilamos y por qué',
      blocks: [
        'Solo recopilamos lo que la aplicación necesita para funcionar. En concreto:',
        {
          list: [
            'Cuenta: tu dirección de correo electrónico y una contraseña. La contraseña se almacena únicamente como un hash seguro por parte de nuestro proveedor de autenticación; nunca la vemos ni la almacenamos en forma legible. El correo electrónico se utiliza para iniciar tu sesión, proteger tu cuenta y enviarte mensajes relacionados con la cuenta y los pagos.',
            'Perfil y progreso: un nombre visible, tu nivel y tus XP, rachas, logros desbloqueados, el sistema de conteo elegido y las preferencias de la aplicación (tema, sonido, velocidad de reparto). Esto hace funcionar el producto y sincroniza tu progreso entre tus dispositivos.',
            'Registros de entrenamiento: cada sesión de práctica que completas: el modo, tu precisión, la duración, el número de manos y cifras similares. Con ello se elaboran tus análisis y tu progreso.',
            'Registro de bankroll (opcional): si utilizas el diario de casino real, almacenamos exactamente lo que introduces: una fecha, las horas jugadas, el nombre de un casino que escribes y los importes de dinero que anotas (ganancia o pérdida, y tu bankroll). Tú decides si utilizas esta función, y puedes editar o eliminar estas entradas.',
            'Pago: si te suscribes a Pro, el pago lo gestiona Stripe. Compartimos con Stripe tu correo electrónico y un identificador interno de la cuenta, y recibimos a cambio el estado de tu suscripción. Nunca recibimos ni almacenamos el número completo de tu tarjeta.',
            'Almacenamiento local en el dispositivo: tus preferencias y una copia sin conexión de tu progreso se guardan en tu navegador (localStorage), y una cookie de sesión mantiene tu sesión iniciada. No utilizamos cookies publicitarias ni cookies de seguimiento entre sitios.',
            'Comprobación antibots: cuando inicias sesión, te registras o solicitas restablecer la contraseña, Cloudflare Turnstile comprueba que quien envía el formulario es una persona y no un script. Para esa comprobación, Cloudflare trata tu dirección IP y características técnicas de tu navegador conforme a su propia política de privacidad. Nosotros solo recibimos un token de «superado» o «no superado» y nunca vemos esos datos.',
            'Estadísticas de visitas: para saber cuántas personas visitan el sitio, qué páginas leen y cuánto tiempo permanecen, registramos cada página vista en nuestra propia base de datos: la ruta de la página, la hora, el sitio que enlazaba hacia nosotros (solo su dominio), si el dispositivo es un teléfono, una tableta o un ordenador de escritorio, y un identificador de visitante aleatorio almacenado en tu navegador. Ese identificador es un número aleatorio; no se deriva de ti ni de tu dispositivo, no se comparte con nadie y se sustituye al cerrar sesión. No almacenamos tu dirección IP ni la cadena de identificación de tu navegador. Si has iniciado sesión, la visita se vincula a tu cuenta. Con el mismo identificador registramos además qué pasos del registro y de la mejora del plan se alcanzaron — que se mostró el formulario de registro o la oferta de mejora, que se creó una cuenta, que se completó una primera sesión de entrenamiento y que se inició un pago —, únicamente como el nombre del paso y la hora, sin ningún otro dato. Los navegadores que envían la señal Global Privacy Control o Do Not Track no se contabilizan en absoluto. Estas estadísticas se conservan durante 13 meses. Solo lo hacemos si das tu consentimiento: en tu primera visita, una barra en la parte inferior de la página te pregunta si aceptas las cookies, y hasta que elijas «Aceptar» no se registra nada ni se almacena ningún identificador. (En sentido estricto se trata de una entrada en el almacenamiento local de tu navegador y no de una cookie; usamos la palabra habitual porque cumple la misma función y está sujeta a las mismas normas.) «Rechazar» elimina un identificador almacenado anteriormente. Puedes cambiar tu respuesta en cualquier momento en «Configuración de cookies», al pie de cada página pública. Un navegador que envía Global Privacy Control o Do Not Track se trata como un «no» sin que se le pregunte.',
            'Informes de errores: cuando una compra o una acción de la cuenta (abrir el portal de facturación, exportar o restablecer tus datos, cambiar tu nombre o tu imagen) falla por un motivo técnico, registramos el mensaje de error, la página en la que estabas, la hora, la versión de la aplicación y, si habías iniciado sesión, el vínculo con tu cuenta, para poder localizar y corregir el fallo. Todo lo que en el mensaje parezca una dirección de correo electrónico o un token de acceso se elimina antes de enviarlo. Estos informes se conservan durante 90 días.',
          ],
        },
      ],
    },
    {
      heading: '3. Lo que no hacemos',
      blocks: [
        'No vendemos tus datos. No utilizamos redes publicitarias ni empleamos herramientas de análisis o seguimiento de terceros que elaboren un perfil tuyo a través de la web. Las estadísticas de visitas descritas más arriba las recopilamos únicamente nosotros, permanecen en nuestra propia base de datos y no se combinan con datos de ningún otro sitio.',
      ],
    },
    {
      heading: '4. Quién trata datos por cuenta nuestra',
      blocks: [
        'Recurrimos a un número reducido de proveedores de servicios que tratan los datos únicamente siguiendo nuestras instrucciones:',
        {
          list: [
            'Supabase: aloja nuestra base de datos, gestiona la autenticación y ejecuta nuestras funciones del lado del servidor.',
            'Stripe: procesa los pagos de las suscripciones como proveedor de servicios de pago independiente. Stripe trata los datos de tu tarjeta conforme a su propia política de privacidad.',
            'Cloudflare: ejecuta la comprobación antibots (Turnstile) en los formularios de inicio de sesión, registro y restablecimiento de contraseña.',
          ],
        },
      ],
    },
    {
      heading: '5. Dónde se almacenan tus datos',
      blocks: [
        `Los datos de tu cuenta y de tus entrenamientos los almacena Supabase en la región ${M.hostingRegion}. Cuando los datos se tratan fuera de tu propio país, esa transferencia se basa en las garantías que ofrecen dichos proveedores (como las cláusulas contractuales tipo).`,
      ],
    },
    {
      heading: '6. Durante cuánto tiempo los conservamos',
      blocks: [
        'Conservamos tus datos mientras exista tu cuenta. Cuando eliminas tu cuenta, los datos personales vinculados a ella se eliminan y las estadísticas de visitas que hubiera se desvinculan de ella. Al cerrar sesión se borra la copia sin conexión almacenada en tu navegador. Las estadísticas de visitas se conservan durante 13 meses y los informes de errores durante 90 días; ambos se eliminan mediante una tarea semanal, por lo que una entrada puede permanecer hasta una semana más allá de su plazo.',
      ],
    },
    {
      heading: '7. Cómo los protegemos',
      blocks: [
        'Los datos se cifran en tránsito (HTTPS). El acceso está restringido por usuario mediante la seguridad a nivel de fila de la base de datos (row-level security), de modo que ninguna cuenta puede leer los datos de otra cuenta. Las contraseñas las convierte en hash nuestro proveedor de autenticación.',
      ],
    },
    {
      heading: '8. Tus derechos',
      blocks: [
        'Puedes pedirnos que te facilitemos una copia de tus datos, que los rectifiquemos, los eliminemos o los exportemos, o que limitemos determinados tratamientos, o bien oponerte a ellos, y puedes retirar tu consentimiento en cualquier momento. En virtud de la Ley Federal suiza de Protección de Datos (revDSG) y, para los visitantes de la UE/EEE, del RGPD, te corresponden estos derechos.',
        `Para ejercer cualquiera de ellos, escribe a ${M.contactEmail}. También tienes derecho a presentar una reclamación ante tu autoridad de protección de datos.`,
      ],
    },
    {
      heading: '9. Menores',
      blocks: [
        `${M.productName} no está dirigido a personas menores de ${M.minimumAge} años, y no recopilamos datos suyos a sabiendas.`,
      ],
    },
    {
      heading: '10. Cambios en esta política',
      blocks: [
        'Si cambiamos la forma en que tratamos los datos, actualizaremos esta página y su fecha de «última actualización». Los cambios significativos se destacarán cuando proceda.',
      ],
    },
    {
      heading: '11. Contacto',
      blocks: [
        `Preguntas sobre esta política o sobre tus datos: ${M.contactEmail}.`,
      ],
    },
  ],
}
