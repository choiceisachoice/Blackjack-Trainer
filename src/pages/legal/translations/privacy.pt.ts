import { LEGAL_META as M } from '../legal-meta'
import { legalDate, legalLocation } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Política de privacidade — Portuguese translation of `privacy-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const PRIVACY_PT: LegalDoc = {
  title: 'Política de privacidade',
  intro: `Como ${M.productName} recolhe, utiliza e protege os seus dados — em linguagem clara. Última atualização: ${legalDate('pt')}.`,
  sections: [
    {
      heading: '1. Quem é o responsável',
      blocks: [
        `${M.productName} é operado por ${M.operator}, com sede em ${legalLocation('pt')} (o «operador», «nós»). Somos o responsável pelo tratamento dos dados pessoais aqui descritos.`,
        `Para qualquer questão sobre privacidade ou para exercer os seus direitos, contacte-nos através de ${M.contactEmail}.`,
      ],
    },
    {
      heading: '2. Os dados que recolhemos, e porquê',
      blocks: [
        'Recolhemos apenas o que a aplicação precisa para funcionar. Em concreto:',
        {
          list: [
            'Conta: o seu endereço de e-mail e uma palavra-passe. A palavra-passe é guardada apenas como um hash seguro pelo nosso fornecedor de autenticação — nunca a vemos nem a guardamos de forma legível. O e-mail é utilizado para iniciar a sua sessão, proteger a sua conta e enviar mensagens relacionadas com a conta e com pagamentos.',
            'Perfil e progresso: um nome de apresentação, o seu nível e XP, sequências, prémios desbloqueados, o sistema de contagem escolhido e as preferências da aplicação (tema, som, velocidade de distribuição). Isto faz funcionar o produto e sincroniza o seu progresso entre os seus dispositivos.',
            'Registos de treino: cada sessão de prática que conclui — o modo, a sua precisão, a duração, o número de mãos e valores semelhantes. É com isto que são elaboradas as suas análises e o seu progresso.',
            'Registo de bankroll (opcional): se utilizar o registo de bankroll, guardamos exatamente o que introduz — uma data, as horas jogadas, o nome de um casino que escreve e os montantes que regista (lucro ou perda, e a sua bankroll). É o utilizador que escolhe se usa esta funcionalidade, e pode editar ou eliminar estas entradas.',
            'Pagamento: se subscrever o Pro, o pagamento é tratado pela Stripe. Partilhamos com a Stripe o seu e-mail e um identificador interno da conta e recebemos de volta o estado da sua subscrição. Nunca recebemos nem guardamos o número completo do seu cartão.',
            'Armazenamento local no dispositivo: as suas preferências e uma cópia offline do seu progresso são guardadas no seu navegador (localStorage), e um cookie de sessão mantém a sua sessão iniciada. Não utilizamos cookies de publicidade nem cookies de rastreio entre sites.',
            'Verificação antibots: quando inicia sessão, se regista ou pede a reposição da palavra-passe, o Cloudflare Turnstile verifica que é uma pessoa — e não um script — a submeter o formulário. Para essa verificação, a Cloudflare trata o seu endereço IP e características técnicas do seu navegador ao abrigo da sua própria política de privacidade. Recebemos apenas um token de «aprovado» ou «reprovado» e nunca vemos esses dados.',
            'Estatísticas de visitas: para saber quantas pessoas visitam o site, que páginas leem e quanto tempo ficam, registamos cada visualização de página na nossa própria base de dados — o caminho da página, a hora, o site que tinha a ligação para nós (apenas o seu domínio), se o dispositivo é um telemóvel, um tablet ou um computador de secretária, e um identificador de visitante aleatório guardado no seu navegador. Esse identificador é um número aleatório; não é derivado de si nem do seu dispositivo, não é partilhado com ninguém e é substituído ao terminar sessão. Não guardamos o seu endereço IP nem a cadeia de identificação do seu navegador. Se tiver sessão iniciada, a visita fica associada à sua conta. Com o mesmo identificador registamos ainda que passos do registo e da mudança para o plano pago foram alcançados — que o formulário de registo ou a oferta do plano pago foi apresentado, que foi criada uma conta, que foi concluída uma primeira sessão de treino e que foi iniciado um pagamento — apenas como o nome do passo e a hora, sem qualquer outro detalhe. Os navegadores que enviam o sinal Global Privacy Control ou Do Not Track não são contados de todo. Estas estatísticas são conservadas durante 13 meses. Só o fazemos se der o seu consentimento: na sua primeira visita, uma barra no fundo da página pergunta se aceita cookies, e até escolher «Aceitar» nada é registado e nenhum identificador é guardado. (Em rigor, trata-se de uma entrada no armazenamento local do seu navegador e não de um cookie; usamos a palavra habitual porque cumpre a mesma função e está sujeita às mesmas regras.) «Recusar» remove um identificador guardado anteriormente. Pode alterar a sua resposta em qualquer momento em «Definições de cookies», no rodapé de cada página pública. Um navegador que envie Global Privacy Control ou Do Not Track é tratado como um «não» sem que a pergunta seja feita.',
            'Relatórios de erro: quando uma compra ou uma ação da conta (abrir o portal de faturação, exportar ou repor os seus dados, alterar o seu nome ou a sua imagem) falha por um motivo técnico, registamos a mensagem de erro, a página em que se encontrava, a hora, a versão da aplicação e — se tinha sessão iniciada — a ligação à sua conta, para podermos encontrar e corrigir a falha. Tudo o que na mensagem se assemelhe a um endereço de e-mail ou a um token de acesso é removido antes do envio. Estes relatórios são conservados durante 90 dias.',
          ],
        },
      ],
    },
    {
      heading: '3. O que não fazemos',
      blocks: [
        'Não vendemos os seus dados. Não utilizamos redes de publicidade nem recorremos a ferramentas de análise ou de rastreio de terceiros que tracem o seu perfil através da web. As estatísticas de visitas acima descritas são recolhidas apenas por nós, permanecem na nossa própria base de dados e não são combinadas com dados de nenhum outro site.',
      ],
    },
    {
      heading: '4. Quem trata dados por nossa conta',
      blocks: [
        'Recorremos a um pequeno número de prestadores de serviços que tratam os dados apenas segundo as nossas instruções:',
        {
          list: [
            'Supabase — aloja a nossa base de dados, trata da autenticação e executa as nossas funções do lado do servidor.',
            'Stripe — processa os pagamentos das subscrições enquanto prestador de serviços de pagamento independente. A Stripe trata os dados do seu cartão ao abrigo da sua própria política de privacidade.',
            'Cloudflare — executa a verificação antibots (Turnstile) nos formulários de início de sessão, registo e reposição da palavra-passe.',
          ],
        },
      ],
    },
    {
      heading: '5. Onde os seus dados são guardados',
      blocks: [
        `Os dados da sua conta e dos seus treinos são guardados pela Supabase na região ${M.hostingRegion}. Quando os dados são tratados fora do seu próprio país, essa transferência assenta nas garantias oferecidas por esses prestadores (como as cláusulas contratuais-tipo).`,
      ],
    },
    {
      heading: '6. Durante quanto tempo os conservamos',
      blocks: [
        'Conservamos os seus dados enquanto a sua conta existir. Quando elimina a sua conta, os dados pessoais a ela associados são removidos e as eventuais estatísticas de visitas são dela desassociadas. Terminar sessão apaga a cópia offline guardada no seu navegador. As estatísticas de visitas são conservadas durante 13 meses e os relatórios de erro durante 90 dias; ambos são eliminados por uma tarefa semanal, pelo que uma entrada pode permanecer até uma semana para além do seu prazo.',
      ],
    },
    {
      heading: '7. Como os protegemos',
      blocks: [
        'Os dados são cifrados em trânsito (HTTPS). O acesso é restringido por utilizador através da segurança ao nível da linha da base de dados (row-level security), de modo que nenhuma conta pode ler os dados de outra conta. As palavras-passe são convertidas em hash pelo nosso fornecedor de autenticação.',
      ],
    },
    {
      heading: '8. Os seus direitos',
      blocks: [
        'Pode pedir-nos que lhe facultemos uma cópia dos seus dados, que os retifiquemos, eliminemos ou exportemos, ou que limitemos determinados tratamentos, ou opor-se a eles, e pode retirar o consentimento em qualquer momento. Ao abrigo da Lei Federal suíça sobre a Proteção de Dados (revDSG) e, para os visitantes na UE/EEE, do RGPD, estes direitos assistem-lhe.',
        `Para exercer qualquer um deles, escreva para ${M.contactEmail}. Tem igualmente o direito de apresentar reclamação junto da sua autoridade de proteção de dados.`,
      ],
    },
    {
      heading: '9. Menores',
      blocks: [
        `${M.productName} não se destina a pessoas com menos de ${M.minimumAge} anos, e não recolhemos conscientemente dados que lhes digam respeito.`,
      ],
    },
    {
      heading: '10. Alterações a esta política',
      blocks: [
        'Se alterarmos a forma como tratamos os dados, atualizaremos esta página e a respetiva data de «última atualização». As alterações significativas serão destacadas quando tal se justificar.',
      ],
    },
    {
      heading: '11. Contacto',
      blocks: [
        `Questões sobre esta política ou sobre os seus dados: ${M.contactEmail}.`,
      ],
    },
  ],
}
