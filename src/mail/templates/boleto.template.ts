// src/mail/templates/boleto.template.ts

export interface BoletoTemplateData {
  customerName: string;
  orderId: string;
  amount: number;
  dueDate: Date;
  boletoUrl: string;
}

export function buildBoletoEmail(data: BoletoTemplateData): string {
  // Formatações
  const formattedAmount = data.amount.toFixed(2).replace('.', ',');
  const formattedDate = data.dueDate.toLocaleDateString('pt-BR');

  // Retorna o HTML limpo e isolado
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0056b3; margin: 0;">Sua Fatura Chegou</h1>
      </div>

      <h2 style="color: #333;">Olá, ${data.customerName}!</h2>
      <p style="color: #555; line-height: 1.5;">
        O boleto referente ao pedido <strong>#${data.orderId}</strong> já está disponível para pagamento.
      </p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 5px 0; font-size: 16px; color: #555;">
          Valor a pagar: <strong style="font-size: 18px; color: #333;">R$ ${formattedAmount}</strong>
        </p>
        <p style="margin: 5px 0; font-size: 16px; color: #555;">
          Vencimento: <strong style="color: #d9534f;">${formattedDate}</strong>
        </p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.boletoUrl}" target="_blank" style="background-color: #0056b3; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
          Visualizar e Imprimir Boleto
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
      <p style="color: #777; font-size: 12px; text-align: center;">
        Se você não reconhece essa cobrança ou já efetuou o pagamento, por favor desconsidere este e-mail.
      </p>
    </div>
  `;
}
