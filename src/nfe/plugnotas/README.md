# PlugNotas Integration

Integração com a API do PlugNotas para emissão de NF-e (Nota Fiscal Eletrônica).

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```bash
# PlugNotas Integration
PLUGNOTAS_API_KEY=sua_api_key_aqui
PLUGNOTAS_AMBIENTE=sandbox   # 'sandbox' para homologação ou 'producao' para produção
PLUGNOTAS_WEBHOOK_TOKEN=token_para_validar_webhooks  # Opcional
```

### URLs da API

- **Sandbox (Homologação):** `https://api.sandbox.plugnotas.com.br`
- **Produção:** `https://api.plugnotas.com.br`

## Configuração por Tenant

Cada tenant pode ter suas próprias credenciais configuradas no banco de dados:

- `plugnotasApiKey` - API Key específica do tenant
- `plugnotasEmpresaCnpj` - CNPJ da empresa emitente
- `plugnotasCertificadoValido` - Status do certificado digital
- `plugnotasCertificadoVencimento` - Data de vencimento do certificado
- `plugnotasAmbiente` - 1=Produção, 2=Homologação

## Endpoints Disponíveis

### Empresa

| Método | Endpoint             | Descrição                          |
| ------ | -------------------- | ---------------------------------- |
| POST   | `/plugnotas/empresa` | Cadastra/atualiza empresa emitente |
| GET    | `/plugnotas/empresa` | Consulta empresa emitente          |

### Certificado Digital

| Método | Endpoint                 | Descrição                                  |
| ------ | ------------------------ | ------------------------------------------ |
| POST   | `/plugnotas/certificado` | Envia certificado A1 (multipart/form-data) |
| GET    | `/plugnotas/certificado` | Consulta status do certificado             |

### NF-e

| Método | Endpoint                           | Descrição                     |
| ------ | ---------------------------------- | ----------------------------- |
| POST   | `/plugnotas/nfe/emitir`            | Emite NF-e manual             |
| POST   | `/plugnotas/nfe/emitir-pedido`     | Emite NF-e a partir de pedido |
| GET    | `/plugnotas/nfe/:idIntegracao`     | Consulta status da NF-e       |
| GET    | `/plugnotas/nfe`                   | Lista NF-es da API            |
| GET    | `/plugnotas/nfe-local`             | Lista NF-es do banco local    |
| GET    | `/plugnotas/nfe/:idIntegracao/pdf` | Download PDF da NF-e          |
| GET    | `/plugnotas/nfe/:idIntegracao/xml` | Download XML da NF-e          |
| POST   | `/plugnotas/nfe/cancelar`          | Cancela NF-e                  |
| POST   | `/plugnotas/nfe/carta-correcao`    | Emite carta de correção       |
| POST   | `/plugnotas/nfe/inutilizar`        | Inutiliza faixa de numeração  |

### Webhook

| Método | Endpoint             | Descrição                     |
| ------ | -------------------- | ----------------------------- |
| POST   | `/plugnotas/webhook` | Recebe atualizações de status |

## Fluxo de Uso

### 1. Configuração Inicial

1. Cadastrar empresa emitente:

```json
POST /plugnotas/empresa
{
  "cpfCnpj": "00000000000000",
  "razaoSocial": "Razão Social da Empresa",
  "nomeFantasia": "Nome Fantasia",
  "inscricaoEstadual": "123456789",
  "regimeTributario": 1,
  "email": "contato@empresa.com",
  "telefone": "11999999999",
  "endereco": {
    "logradouro": "Rua Exemplo",
    "numero": "123",
    "bairro": "Centro",
    "codigoCidade": "3550308",
    "descricaoCidade": "São Paulo",
    "estado": "SP",
    "cep": "01310100"
  },
  "ambiente": 2
}
```

2. Enviar certificado digital A1:

```
POST /plugnotas/certificado
Content-Type: multipart/form-data

arquivo: [arquivo.pfx]
cpfCnpj: 00000000000000
senha: senha_do_certificado
```

### 2. Emissão de NF-e

A partir de um pedido existente:

```json
POST /plugnotas/nfe/emitir-pedido
{
  "orderId": "uuid-do-pedido",
  "naturezaOperacao": "Venda de Mercadoria"
}
```

Manualmente:

```json
POST /plugnotas/nfe/emitir
{
  "naturezaOperacao": "Venda de Mercadoria",
  "destinatario": {
    "cpfCnpj": "12345678901",
    "razaoSocial": "Cliente Exemplo",
    "email": "cliente@email.com",
    "indicadorInscricaoEstadual": 9,
    "endereco": {
      "logradouro": "Rua do Cliente",
      "numero": "456",
      "bairro": "Bairro",
      "codigoCidade": "3550308",
      "descricaoCidade": "São Paulo",
      "estado": "SP",
      "cep": "01310200"
    }
  },
  "itens": [
    {
      "codigo": "SKU001",
      "descricao": "Produto Exemplo",
      "ncm": "12345678",
      "cfop": "5102",
      "unidadeComercial": "UN",
      "quantidadeComercial": 10,
      "valorUnitarioComercial": 100.00,
      "impostos": {
        "icms": { "origem": 0, "csosn": "102" },
        "pis": { "cst": "07" },
        "cofins": { "cst": "07" }
      }
    }
  ]
}
```

### 3. Consulta e Downloads

```
GET /plugnotas/nfe/{idIntegracao}       # Status
GET /plugnotas/nfe/{idIntegracao}/pdf   # Download PDF
GET /plugnotas/nfe/{idIntegracao}/xml   # Download XML
```

### 4. Cancelamento

```json
POST /plugnotas/nfe/cancelar
{
  "idIntegracao": "uuid-da-nfe",
  "justificativa": "Motivo do cancelamento com no mínimo 15 caracteres"
}
```

### 5. Carta de Correção

```json
POST /plugnotas/nfe/carta-correcao
{
  "idIntegracao": "uuid-da-nfe",
  "correcao": "Texto da correção com no mínimo 15 caracteres"
}
```

## Regimes Tributários

| Código | Descrição                               |
| ------ | --------------------------------------- |
| 1      | Simples Nacional                        |
| 2      | Simples Nacional - Excesso de sublimite |
| 3      | Regime Normal                           |

## Formas de Pagamento

| Código | Descrição              |
| ------ | ---------------------- |
| 01     | Dinheiro               |
| 02     | Cheque                 |
| 03     | Cartão de Crédito      |
| 04     | Cartão de Débito       |
| 15     | Boleto Bancário        |
| 17     | PIX                    |
| 18     | Transferência Bancária |
| 90     | Sem Pagamento          |
| 99     | Outros                 |

## Webhook

Configure o webhook no painel do PlugNotas apontando para:

```
POST https://seu-dominio.com/plugnotas/webhook
```

Opcionalmente, configure o header `x-webhook-token` com o valor de `PLUGNOTAS_WEBHOOK_TOKEN`.

## Documentação Oficial

- [Documentação PlugNotas](https://docs.plugnotas.com.br/)
- [API Reference](https://docs.plugnotas.com.br/#nfe)
