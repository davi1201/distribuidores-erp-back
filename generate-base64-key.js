const fs = require('fs');
const path = require('path');

// Nome do seu arquivo de chave
const KEY_FILE_NAME = 'key.json';

try {
  const keyPath = path.join(__dirname, KEY_FILE_NAME);

  // Lê o arquivo
  const fileBuffer = fs.readFileSync(keyPath);

  // Converte para Base64
  const base64String = fileBuffer.toString('base64');

  console.log(
    '\n✅ SUCESSO! Copie a string abaixo para a variável de ambiente GCS_CREDENTIALS_BASE64:\n',
  );
  console.log(base64String);
  console.log('\n');
} catch (error) {
  console.error(
    'Erro ao ler o arquivo key.json. Verifique se ele está na raiz do projeto.',
  );
  console.error(error.message);
}
