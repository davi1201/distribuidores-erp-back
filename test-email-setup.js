import * as nodemailer from 'nodemailer';

// --- CONFIGURAÇÃO DA CONTA ---
// Se você já tem uma conta Ethereal criada, preencha aqui para reutilizar.
// Se deixar vazio, o script criará uma nova conta temporária a cada execução.
const EXISTING_ACCOUNT = {
  user: 'tkycaz634wh3r72g@ethereal.email', // <--- COLOQUE SEU EMAIL AQUI
  pass: 'H8yxfn6dmQhzh1E8v7', // <--- COLOQUE SUA SENHA AQUI
  host: 'smtp.ethereal.email',
  port: 587,
};

async function main() {
  console.log('🚀 Iniciando envio de e-mail de teste com NFe...');

  let account;

  if (
    EXISTING_ACCOUNT.user &&
    EXISTING_ACCOUNT.user !== 'seunome@ethereal.email'
  ) {
    // Usa a conta existente configurada acima
    console.log('Using existing account:', EXISTING_ACCOUNT.user);
    account = {
      user: EXISTING_ACCOUNT.user,
      pass: EXISTING_ACCOUNT.pass,
      smtp: {
        host: EXISTING_ACCOUNT.host,
        port: EXISTING_ACCOUNT.port,
        secure: false,
      },
      imap: { host: 'imap.ethereal.email', port: 993 }, // Ethereal padrão
    };
  } else {
    // Cria uma conta nova (fallback)
    console.log('Criando nova conta de teste no Ethereal...');
    account = await nodemailer.createTestAccount();

    console.log('--- 📧 NOVA CONTA CRIADA ---');
    console.log('Atualize a tabela TenantEmailConfig com estes dados:');
    console.log(`User: ${account.user}`);
    console.log(`Pass: ${account.pass}`);
    console.log(`IMAP Host: ${account.imap.host}`);
    console.log(`IMAP Port: ${account.imap.port}`);
    console.log('---------------------------');
  }

  // 2. Cria o transporte SMTP
  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  // 3. XML da Nota Fiscal (Simulado)
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc version="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe35231200000000000000550010000000011000000001">
          <ide>
            <cUF>35</cUF>
            <cNF>00000001</cNF>
            <natOp>Venda de Mercadoria</natOp>
            <mod>55</mod>
            <serie>1</serie>
            <nNF>100</nNF>
            <dhEmi>${new Date().toISOString()}</dhEmi>
            <tpNF>1</tpNF>
            <idDest>1</idDest>
            <cMunFG>3550308</cMunFG>
            <tpImp>1</tpImp>
            <tpEmis>1</tpEmis>
            <cDV>1</cDV>
            <tpAmb>2</tpAmb>
            <finNFe>1</finNFe>
            <indFinal>0</indFinal>
            <indPres>9</indPres>
            <procEmi>0</procEmi>
            <verProc>1.0</verProc>
          </ide>
          <emit>
            <CNPJ>12345678000199</CNPJ>
            <xNome>Fornecedor Recorrente LTDA</xNome>
            <enderEmit>
              <xLgr>Rua Exemplo</xLgr>
              <nro>100</nro>
              <xBairro>Centro</xBairro>
              <cMun>3550308</cMun>
              <xMun>São Paulo</xMun>
              <UF>SP</UF>
              <CEP>01001000</CEP>
            </enderEmit>
          </emit>
          <dest>
            <CNPJ>04866263180</CNPJ> <!-- CNPJ DO SEU TENANT -->
            <xNome>Sua Empresa Distribuidora</xNome>
          </dest>
          <det nItem="1">
            <prod>
              <cProd>PROD-TESTE-${Math.floor(Math.random() * 1000)}</cProd>
              <cEAN>SEM GTIN</cEAN>
              <xProd>Produto de Teste Recorrente</xProd>
              <NCM>33051000</NCM>
              <CFOP>5102</CFOP>
              <uCom>UN</uCom>
              <qCom>10.0000</qCom>
              <vUnCom>50.0000</vUnCom>
              <vProd>500.00</vProd>
              <cEANTrib>SEM GTIN</cEANTrib>
              <uTrib>UN</uTrib>
              <qTrib>10.0000</qTrib>
              <vUnTrib>50.0000</vUnTrib>
              <indTot>1</indTot>
            </prod>
          </det>
        </infNFe>
      </NFe>
      <protNFe version="4.00">
        <infProt>
          <tpAmb>2</tpAmb>
          <verAplic>1.0</verAplic>
          <chNFe>3523120000000000000055001000000001100000000${Math.floor(Math.random() * 9)}</chNFe>
          <dhRecbto>${new Date().toISOString()}</dhRecbto>
          <nProt>135230000000001</nProt>
          <digVal>xyz</digVal>
          <cStat>100</cStat>
          <xMotivo>Autorizado o uso da NF-e</xMotivo>
        </infProt>
      </protNFe>
    </nfeProc>`;

  // 4. Envia o email
  const info = await transporter.sendMail({
    from: '"Fornecedor XML" <xml@fornecedor-teste.com>',
    to: account.user,
    subject: `NFe Recebida - #${Math.floor(Math.random() * 1000)}`,
    text: 'Segue anexo o XML da nota fiscal.',
    attachments: [
      {
        filename: `nfe-${Date.now()}.xml`,
        content: xmlContent,
        contentType: 'text/xml',
      },
    ],
  });

  console.log('✅ E-mail enviado com sucesso!');
  console.log('🆔 ID da Mensagem:', info.messageId);
  console.log('🔗 URL de Preview:', nodemailer.getTestMessageUrl(info));
}

main().catch(console.error);
