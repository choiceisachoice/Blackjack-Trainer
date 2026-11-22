import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Gizlilik Politikası — Turkish translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const PRIVACY_TR: LegalDoc = {
  title: 'Gizlilik Politikası',
  intro: `${M.productName} verilerinizi nasıl toplar, kullanır ve korur — sade bir dille. Son güncelleme: ${legalDate('tr')}.`,
  sections: [
    {
      heading: '1. Sorumlu kim',
      blocks: [
        `${M.productName}, merkezi ${legalLocation('tr')} adresinde bulunan ${M.operator} tarafından işletilmektedir (“işletmeci”, “biz”, “bize”). Burada açıklanan kişisel verilerin veri sorumlusu biziz.`,
        `Gizlilikle ilgili her türlü soru için veya haklarınızı kullanmak üzere bize şu adresten ulaşabilirsiniz: ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. Topladığımız veriler ve nedenleri',
      blocks: [
        'Yalnızca uygulamanın çalışması için gerekenleri topluyoruz. Ayrıntılı olarak:',
        {
          list: [
            'Hesap: e-posta adresiniz ve bir parola. Parola, kimlik doğrulama sağlayıcımız tarafından yalnızca güvenli bir özet (hash) olarak saklanır — onu okunabilir biçimde asla görmeyiz ve saklamayız. E-posta, oturum açmanızı sağlamak, hesabınızı güvence altına almak ve hesap ile ödemeyle ilgili iletiler göndermek için kullanılır.',
            'Profil ve ilerleme: bir görünen ad, seviyeniz ve XP’niz, seriler, açılan ödüller, seçilen sayma sistemi ve uygulama tercihleri (tema, ses, dağıtma hızı). Bunlar ürünü çalıştırır ve ilerlemenizi cihazlarınız arasında eşitler.',
            'Antrenman kayıtları: tamamladığınız her alıştırma oturumu — mod, doğruluğunuz, süre, el sayısı ve benzeri değerler. Analizleriniz ve ilerlemeniz bunlara dayanır.',
            'Bankroll kaydı (isteğe bağlı): bankroll takibi özelliğini kullanırsanız, tam olarak girdiğiniz bilgileri saklarız — bir tarih, oynanan saatler, yazdığınız bir casino adı ve kaydettiğiniz para tutarları (kâr veya zarar ve bankroll’unuz). Bu özelliği kullanıp kullanmayacağınıza siz karar verirsiniz; bu kayıtları düzenleyebilir veya silebilirsiniz.',
            'Ödeme: Pro’ya abone olursanız ödeme Stripe tarafından gerçekleştirilir. E-postanızı ve dahili bir hesap tanımlayıcısını Stripe ile paylaşırız ve karşılığında abonelik durumunuzu alırız. Kart numaranızın tamamını asla almayız ve saklamayız.',
            'Cihazdaki yerel depolama: tercihleriniz ve ilerlemenizin çevrimdışı bir kopyası tarayıcınızda (localStorage) tutulur ve bir oturum çerezi oturumunuzu açık tutar. Reklam çerezleri veya siteler arası izleme çerezleri kullanmıyoruz.',
            'Bot kontrolü: oturum açtığınızda, kaydolduğunuzda veya parola sıfırlama talep ettiğinizde Cloudflare Turnstile, formu gönderenin bir komut dosyası değil, bir insan olduğunu denetler. Bu kontrol için Cloudflare, IP adresinizi ve tarayıcınızın teknik özelliklerini kendi gizlilik politikası uyarınca işler. Biz yalnızca “geçti” veya “kaldı” bilgisini taşıyan bir belirteç alırız ve bu ayrıntıları asla görmeyiz.',
            'Ziyaret istatistikleri: siteyi kaç kişinin ziyaret ettiğini, hangi sayfaları okuduklarını ve ne kadar kaldıklarını bilmek için her sayfa görüntülemesini kendi veritabanımıza kaydederiz — sayfanın yolu, saat, bize bağlantı veren site (yalnızca alan adı), cihazın telefon, tablet veya masaüstü bilgisayar olup olmadığı ve tarayıcınızda saklanan rastgele bir ziyaretçi tanımlayıcısı. Bu tanımlayıcı rastgele bir sayıdır; sizden veya cihazınızdan türetilmez, kimseyle paylaşılmaz ve oturumu kapattığınızda yenisiyle değiştirilir. IP adresinizi ve tarayıcınızın kimlik dizgesini saklamayız. Oturum açmışsanız ziyaret hesabınızla ilişkilendirilir. Aynı tanımlayıcıyla, kayıt olma ve ücretli plana geçme adımlarından hangilerine ulaşıldığını da kaydederiz — kayıt formunun veya yükseltme teklifinin gösterildiğini, bir hesap oluşturulduğunu, ilk antrenman oturumunun tamamlandığını ve bir ödemenin başlatıldığını — yalnızca adımın adı ve zamanı olarak, başka hiçbir ayrıntı olmadan. Global Privacy Control veya Do Not Track sinyali gönderen tarayıcılar hiç sayılmaz. Bu istatistikler 13 ay süreyle saklanır. Bunu yalnızca onay verirseniz yaparız: ilk ziyaretinizde sayfanın altındaki bir çubuk çerezleri kabul edip etmediğinizi sorar ve siz “Kabul et” seçeneğini seçene kadar hiçbir şey kaydedilmez ve hiçbir tanımlayıcı saklanmaz. (Kesin bir ifadeyle bu, bir çerez değil, tarayıcınızın yerel depolamasındaki bir kayıttır; aynı işi gördüğü ve aynı kurallara tabi olduğu için bilinen sözcüğü kullanıyoruz.) “Reddet” daha önce saklanmış bir tanımlayıcıyı kaldırır. Yanıtınızı her zaman, herkese açık her sayfanın altındaki “Çerez ayarları” bölümünden değiştirebilirsiniz. Global Privacy Control veya Do Not Track gönderen bir tarayıcı, sorulmadan “hayır” olarak değerlendirilir.',
            'Hata raporları: bir satın alma veya bir hesap işlemi (faturalandırma portalını açma, verilerinizi dışa aktarma veya sıfırlama, adınızı veya resminizi değiştirme) teknik bir nedenle başarısız olduğunda, arızayı bulup giderebilmemiz için hata iletisini, bulunduğunuz sayfayı, saati, uygulamanın sürümünü ve — oturum açmış idiyseniz — hesabınızla olan bağlantıyı kaydederiz. İletide e-posta adresine veya erişim belirtecine benzeyen her şey gönderilmeden önce çıkarılır. Bu raporlar 90 gün süreyle saklanır.',
          ],
        },
      ],
    },
    {
      heading: '3. Yapmadıklarımız',
      blocks: [
        'Verilerinizi satmayız. Reklam ağları kullanmayız ve web genelinde profilinizi çıkaran üçüncü taraf analiz veya izleme araçları çalıştırmayız. Yukarıda açıklanan ziyaret istatistikleri yalnızca bizim tarafımızdan toplanır, kendi veritabanımızda kalır ve başka hiçbir sitenin verileriyle birleştirilmez.',
      ],
    },
    {
      heading: '4. Verileri bizim adımıza kimler işler',
      blocks: [
        'Verileri yalnızca talimatlarımız doğrultusunda işleyen az sayıda hizmet sağlayıcıdan yararlanıyoruz:',
        {
          list: [
            'Supabase — veritabanımızı barındırır, kimlik doğrulamayı yürütür ve sunucu tarafı işlevlerimizi çalıştırır.',
            'Stripe — abonelik ödemelerini bağımsız bir ödeme hizmeti sağlayıcısı olarak işler. Stripe, kart bilgilerinizi kendi gizlilik politikası uyarınca işler.',
            'Cloudflare — oturum açma, kayıt ve parola sıfırlama formlarında bot kontrolünü (Turnstile) yürütür.',
          ],
        },
      ],
    },
    {
      heading: '5. Verileriniz nerede saklanır',
      blocks: [
        `Hesap ve antrenman verileriniz Supabase tarafından ${M.hostingRegion} bölgesinde saklanır. Verilerin kendi ülkeniz dışında işlendiği durumlarda bu aktarım, söz konusu sağlayıcıların sunduğu güvencelere (standart sözleşme maddeleri gibi) dayanır.`,
      ],
    },
    {
      heading: '6. Verileri ne kadar süre saklarız',
      blocks: [
        'Verilerinizi hesabınız var olduğu sürece saklarız. Hesabınızı sildiğinizde, ona bağlı kişisel veriler kaldırılır ve varsa ziyaret istatistiklerinin hesapla bağlantısı kesilir. Oturumu kapatmak, tarayıcınızda saklanan çevrimdışı kopyayı temizler. Ziyaret istatistikleri 13 ay, hata raporları 90 gün süreyle saklanır; her ikisi de haftalık bir görevle silinir, bu nedenle bir kayıt süresinin bitiminden sonra bir haftaya kadar kalabilir.',
      ],
    },
    {
      heading: '7. Verileri nasıl koruruz',
      blocks: [
        'Veriler aktarım sırasında şifrelenir (HTTPS). Erişim, veritabanının satır düzeyinde güvenliği (row-level security) ile kullanıcı bazında kısıtlanır; böylece hiçbir hesap başka bir hesabın verilerini okuyamaz. Parolalar kimlik doğrulama sağlayıcımız tarafından özetlenir (hash).',
      ],
    },
    {
      heading: '8. Haklarınız',
      blocks: [
        'Bizden verilerinizin bir kopyasını vermemizi, onları düzeltmemizi, silmemizi, dışa aktarmamızı veya belirli işlemleri kısıtlamamızı isteyebilir ya da bu işlemlere itiraz edebilirsiniz; ayrıca onayınızı her zaman geri çekebilirsiniz. İsviçre Federal Veri Koruma Kanunu (revDSG) ve AB/AEA’daki ziyaretçiler için GDPR uyarınca bu haklara sahipsiniz.',
        `Bunlardan herhangi birini kullanmak için ${M.contactEmail} adresine e-posta gönderin. Ayrıca veri koruma makamınıza şikâyette bulunma hakkınız vardır.`,
      ],
    },
    {
      heading: '9. Çocuklar',
      blocks: [
        `${M.productName}, ${M.minimumAge} yaşından küçükler için tasarlanmamıştır ve onlardan bilerek veri toplamayız.`,
      ],
    },
    {
      heading: '10. Bu politikadaki değişiklikler',
      blocks: [
        'Verileri işleme biçimimizi değiştirirsek bu sayfayı ve “son güncelleme” tarihini güncelleriz. Önemli değişiklikler uygun olan yerlerde vurgulanır.',
      ],
    },
    {
      heading: '11. İletişim',
      blocks: [
        `Bu politika veya verileriniz hakkındaki sorular: ${M.contactEmail}.`,
      ],
    },
  ],
}
