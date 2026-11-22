import { LEGAL_META as M } from '../legal-meta'
import { CH_VAT_PERCENT } from '../../../services/pro-features'
import { legalDate, legalGoverningLaw, legalLocation, legalNumber } from '../legal-locale'
import type { LegalDoc } from '../legal-types'

/**
 * Termos de utilização — Portuguese translation of `terms-content.ts`.
 *
 * A translation for convenience; the English text is the binding one. Same
 * sections, same blocks, same facts — `legal-translations.test.ts` holds the
 * two together.
 */
export const TERMS_PT: LegalDoc = {
  title: 'Termos de utilização',
  intro: `As regras de utilização de ${M.productName}. Última atualização: ${legalDate('pt')}.`,
  sections: [
    {
      heading: '1. Acordo',
      blocks: [
        `Ao criar uma conta ou ao utilizar ${M.productName} (o «Serviço»), aceita estes Termos. Se não concordar, pedimos-lhe que não utilize o Serviço.`,
        `O Serviço é operado por ${M.operator}, com sede em ${legalLocation('pt')}.`,
      ],
    },
    {
      heading: '2. O que o Serviço é — e o que não é',
      blocks: [
        'O Serviço é uma ferramenta de treino com fins educativos para aprender a estratégia básica do blackjack e a contagem de cartas. Todo o jogo é simulado.',
        'Não é jogo a dinheiro. Não oferece apostas com dinheiro real, não lhe permite apostar nem ganhar dinheiro, e não é um casino nem um serviço de jogos de fortuna ou azar. Nenhum resultado obtido no Serviço tem qualquer valor monetário.',
      ],
    },
    {
      heading: '3. Elegibilidade',
      blocks: [
        `Para utilizar o Serviço, tem de ter pelo menos ${M.minimumAge} anos e capacidade para celebrar um acordo vinculativo.`,
      ],
    },
    {
      heading: '4. A sua conta',
      blocks: [
        'Mantenha os seus dados de acesso confidenciais e forneça informações exatas. É responsável pela atividade realizada na sua conta. Informe-nos de imediato se julgar que alguém acedeu a ela sem a sua autorização.',
      ],
    },
    {
      heading: '5. Utilização aceitável',
      blocks: [
        'O Serviço destina-se ao seu uso pessoal e lícito. Compromete-se a não:',
        {
          list: [
            'revender, sublicenciar ou explorar comercialmente o Serviço ou o seu conteúdo;',
            'copiar, extrair de forma automatizada (scraping), fazer engenharia inversa ou tentar extrair o código-fonte ou os dados subjacentes, exceto quando a lei o permita expressamente;',
            'perturbar, sobrecarregar ou interferir com o Serviço ou com a sua segurança;',
            'utilizar o Serviço para violar a lei ou os direitos de outra pessoa.',
          ],
        },
      ],
    },
    {
      heading: '6. Plano gratuito e subscrição Pro',
      blocks: [
        'O Serviço tem um plano gratuito e uma subscrição paga «Pro». O Pro é faturado mensal ou anualmente através do nosso prestador de serviços de pagamento, a Stripe, e renova-se automaticamente até que o cancele.',
        'Pode cancelar em qualquer momento a partir da sua conta; o seu acesso Pro mantém-se até ao fim do período que já pagou. Salvo quando a lei exija o contrário, os pagamentos já efetuados não são reembolsáveis. Podemos alterar preços ou funcionalidades e avisaremos com antecedência razoável das alterações substanciais antes de estas o afetarem.',
      ],
    },
    {
      heading: '7. Preços e IVA suíço',
      blocks: [
        'Todos os preços apresentados neste site e dentro do Serviço estão expressos em francos suíços e são preços finais para consumidores: o montante apresentado é o montante cobrado. Nada é acrescentado no momento do pagamento.',
        `Para os clientes na Suíça, estes preços incluem o imposto sobre o valor acrescentado (IVA) suíço à taxa legal aplicável (atualmente ${legalNumber('pt', CH_VAT_PERCENT)} %). O IVA está contido no preço apresentado e é indicado separadamente na sua fatura e no seu recibo de pagamento.`,
        'O Serviço é oferecido a particulares. Por isso, os preços são indicados com IVA incluído e nunca sem IVA.',
        'Se no local onde vive, fora da Suíça, forem aplicáveis impostos ou direitos, estes são da sua responsabilidade.',
      ],
    },
    {
      heading: '8. Sem aconselhamento financeiro ou sobre jogo',
      blocks: [
        'Tudo o que o Serviço apresenta — incluindo tabelas de estratégia, sugestões de escala de apostas (bet spread) e valores de bankroll — tem fins exclusivamente educativos. Não constitui aconselhamento financeiro, de investimento ou sobre jogo, e não garante qualquer resultado. Qualquer decisão que tome sobre jogo a dinheiro real é inteiramente sua.',
        'Jogue apenas se for legal no local onde se encontra, apenas com dinheiro que possa dar-se ao luxo de perder, e de forma responsável.',
      ],
    },
    {
      heading: '9. Contagem de cartas e casinos',
      blocks: [
        'Contar cartas mentalmente é legal — é pensar. No entanto, os casinos são empresas privadas que definem as suas próprias regras e podem recusar ou restringir o jogo. Não temos qualquer ligação a nenhum casino e não somos responsáveis pela forma como um casino o trata.',
      ],
    },
    {
      heading: '10. Propriedade intelectual',
      blocks: [
        'O Serviço, o seu conteúdo e o seu design pertencem ao operador ou aos seus licenciantes. Concedemos-lhe um direito limitado, pessoal e intransmissível de utilizar o Serviço nos termos destes Termos; não é concedido nenhum outro direito.',
      ],
    },
    {
      heading: '11. Exclusão de garantias',
      blocks: [
        'O Serviço é fornecido «tal como está» e «conforme disponível». Não garantimos que funcione sem interrupções ou sem erros, nem que o seu conteúdo seja completo ou exato para qualquer fim específico.',
      ],
    },
    {
      heading: '12. Limitação de responsabilidade',
      blocks: [
        'Na máxima medida permitida por lei, o operador não é responsável por quaisquer perdas indiretas, incidentais ou consequenciais, nem por quaisquer perdas de jogo, decorrentes da sua utilização do Serviço. Nada nestes Termos limita uma responsabilidade que por lei não possa ser limitada.',
      ],
    },
    {
      heading: '13. Suspensão e cessação',
      blocks: [
        'Pode deixar de utilizar o Serviço e eliminar a sua conta em qualquer momento. Podemos suspender ou fazer cessar o seu acesso se violar estes Termos ou fizer uma utilização abusiva do Serviço.',
      ],
    },
    {
      heading: '14. Alterações a estes Termos',
      blocks: [
        'Podemos atualizar estes Termos. Quando o fizermos, atualizaremos esta página e a respetiva data, e a utilização continuada após uma alteração significa que aceita os Termos atualizados.',
      ],
    },
    {
      heading: '15. Lei aplicável',
      blocks: [
        `Estes Termos regem-se pelo ${legalGoverningLaw('pt')}, sem prejuízo das normas imperativas de proteção dos consumidores de que beneficie no local onde vive.`,
      ],
    },
    {
      heading: '16. Contacto',
      blocks: [
        `Questões sobre estes Termos: ${M.contactEmail}.`,
      ],
    },
  ],
}
