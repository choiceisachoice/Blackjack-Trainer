import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Kullanım Koşulları — Turkish translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const TERMS_TR: LegalDoc = {
  title: 'Kullanım Koşulları',
  intro: `${M.productName} kullanımına ilişkin kurallar. Son güncelleme: ${legalDate('tr')}.`,
  sections: [
    {
      heading: '1. Sözleşme',
      blocks: [
        `Bir hesap oluşturarak veya ${M.productName} ürününü (“Hizmet”) kullanarak bu Koşulları kabul etmiş olursunuz. Kabul etmiyorsanız lütfen Hizmeti kullanmayın.`,
        `Hizmet, merkezi ${legalLocation('tr')} adresinde bulunan ${M.operator} tarafından işletilmektedir.`,
      ],
    },
    {
      heading: '2. Hizmet nedir — ve ne değildir',
      blocks: [
        'Hizmet, blackjack temel stratejisini ve kart saymayı öğrenmeye yönelik eğitim amaçlı bir antrenman aracıdır. Oyunun tamamı simülasyondur.',
        'Kumar değildir. Gerçek parayla bahis sunmaz, para yatırmanıza veya para kazanmanıza olanak tanımaz ve bir casino ya da kumar hizmeti değildir. Hizmetteki hiçbir sonucun parasal değeri yoktur.',
      ],
    },
    {
      heading: '3. Kullanım koşulları',
      blocks: [
        `Hizmeti kullanmak için en az ${M.minimumAge} yaşında olmanız ve bağlayıcı bir sözleşme yapma ehliyetine sahip olmanız gerekir.`,
      ],
    },
    {
      heading: '4. Hesabınız',
      blocks: [
        'Giriş bilgilerinizi gizli tutun ve doğru bilgi verin. Hesabınız üzerinden yapılan işlemlerden siz sorumlusunuz. Hesabınıza izniniz olmadan erişildiğini düşünüyorsanız bize derhal bildirin.',
      ],
    },
    {
      heading: '5. Kabul edilebilir kullanım',
      blocks: [
        'Hizmet, kişisel ve hukuka uygun kullanımınız içindir. Aşağıdakileri yapmamayı kabul edersiniz:',
        {
          list: [
            'Hizmeti veya içeriğini yeniden satmak, alt lisansla vermek veya ticari olarak kullanmak;',
            'kaynak kodunu veya temeldeki verileri kopyalamak, otomatik yöntemlerle toplamak (scraping), tersine mühendislik uygulamak veya bunları elde etmeye çalışmak; kanunun açıkça izin verdiği durumlar hariç;',
            'Hizmeti veya güvenliğini aksatmak, aşırı yüklemek veya bunlara müdahale etmek;',
            'Hizmeti, kanunu veya başka bir kişinin haklarını ihlal etmek için kullanmak.',
          ],
        },
      ],
    },
    {
      heading: '6. Ücretsiz kullanım ve Pro aboneliği',
      blocks: [
        'Hizmetin ücretsiz bir kademesi ve ücretli bir “Pro” aboneliği vardır. Pro, ödeme hizmeti sağlayıcımız Stripe aracılığıyla aylık veya yıllık olarak faturalandırılır ve siz iptal edene kadar otomatik olarak yenilenir.',
        'Hesabınızdan istediğiniz zaman iptal edebilirsiniz; Pro erişiminiz, ödemesini yapmış olduğunuz dönemin sonuna kadar devam eder. Kanunun aksini gerektirdiği durumlar dışında, yapılmış ödemeler iade edilmez. Fiyatları veya özellikleri değiştirebiliriz; esaslı değişiklikleri, sizi etkilemeden önce makul bir süre öncesinden bildiririz.',
      ],
    },
    {
      heading: '7. Fiyatlar ve İsviçre KDV’si',
      blocks: [
        'Bu web sitesinde ve Hizmet içinde gösterilen tüm fiyatlar İsviçre frangı cinsindendir ve tüketiciler için nihai fiyatlardır: gösterilen tutar, tahsil edilen tutardır. Ödeme sırasında hiçbir şey eklenmez.',
        `İsviçre’deki müşteriler için bu fiyatlara, yürürlükteki yasal oran üzerinden (şu anda %${legalNumber('tr', CH_VAT_PERCENT)}) İsviçre katma değer vergisi (KDV) dahildir. KDV, gösterilen fiyatın içindedir ve faturanızda ve ödeme makbuzunuzda ayrıca belirtilir.`,
        'Hizmet, özel kişilere sunulmaktadır. Bu nedenle fiyatlar KDV dahil olarak belirtilir, hiçbir zaman KDV hariç belirtilmez.',
        'İsviçre dışında yaşadığınız yerde vergi veya harç uygulanıyorsa, bunlar sizin sorumluluğunuzdadır.',
      ],
    },
    {
      heading: '8. Finansal tavsiye veya kumar tavsiyesi değildir',
      blocks: [
        'Hizmetin gösterdiği her şey — strateji tabloları, bahis aralığı (bet spread) önerileri ve bankroll rakamları dahil — yalnızca eğitim amaçlıdır. Finansal tavsiye, yatırım tavsiyesi veya kumar tavsiyesi değildir ve herhangi bir sonucu garanti etmez. Gerçek kumarla ilgili verdiğiniz her karar tamamen size aittir.',
        'Yalnızca bulunduğunuz yerde yasalsa, yalnızca kaybetmeyi göze alabileceğiniz parayla ve sorumlu bir şekilde oynayın.',
      ],
    },
    {
      heading: '9. Kart sayma ve casinolar',
      blocks: [
        'Kartları akıldan saymak yasaldır — bu, düşünmektir. Bununla birlikte casinolar, kendi kurallarını koyan ve oyunu reddedebilen veya kısıtlayabilen özel işletmelerdir. Hiçbir casinoyla bağlantımız yoktur ve herhangi bir casinonun size nasıl davrandığından sorumlu değiliz.',
      ],
    },
    {
      heading: '10. Fikri mülkiyet',
      blocks: [
        'Hizmet, içeriği ve tasarımı işletmeciye veya lisans verenlerine aittir. Size, Hizmeti bu Koşullar çerçevesinde kullanmanız için sınırlı, kişisel ve devredilemez bir hak tanıyoruz; başka hiçbir hak tanınmamaktadır.',
      ],
    },
    {
      heading: '11. Garanti reddi',
      blocks: [
        'Hizmet “olduğu gibi” ve “mevcut olduğu şekliyle” sunulur. Kesintisiz veya hatasız olacağını ya da içeriğinin belirli bir amaç için eksiksiz veya doğru olduğunu garanti etmiyoruz.',
      ],
    },
    {
      heading: '12. Sorumluluğun sınırlandırılması',
      blocks: [
        'Kanunun izin verdiği azami ölçüde, işletmeci, Hizmeti kullanmanızdan doğan dolaylı, arızi veya netice kabilinden zararlardan ya da kumar kayıplarından sorumlu değildir. Bu Koşullardaki hiçbir hüküm, kanunen sınırlandırılamayan sorumluluğu sınırlamaz.',
      ],
    },
    {
      heading: '13. Askıya alma ve sona erdirme',
      blocks: [
        'Hizmeti kullanmayı istediğiniz zaman bırakabilir ve hesabınızı silebilirsiniz. Bu Koşulları ihlal ederseniz veya Hizmeti kötüye kullanırsanız erişiminizi askıya alabilir veya sona erdirebiliriz.',
      ],
    },
    {
      heading: '14. Bu Koşullardaki değişiklikler',
      blocks: [
        'Bu Koşulları güncelleyebiliriz. Güncellediğimizde bu sayfayı ve tarihini güncelleriz; bir değişiklikten sonra kullanıma devam etmeniz, güncellenmiş Koşulları kabul ettiğiniz anlamına gelir.',
      ],
    },
    {
      heading: '15. Uygulanacak hukuk',
      blocks: [
        `Bu Koşullar, yaşadığınız yerde sahip olduğunuz emredici tüketici koruma hükümlerine halel gelmeksizin, ${legalGoverningLaw('tr')} tabidir.`,
      ],
    },
    {
      heading: '16. İletişim',
      blocks: [
        `Bu Koşullar hakkındaki sorular: ${M.contactEmail}.`,
      ],
    },
  ],
}
