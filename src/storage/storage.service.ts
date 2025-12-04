import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import * as path from 'path';

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucket: string;

  constructor() {
    const projectId = process.env.GCS_PROJECT_ID;
    const bucketName = process.env.GCS_BUCKET_NAME;

    // Configuração Dinâmica
    const storageOptions: any = {
      projectId,
    };

    // 1. PRIORIDADE: Variável de Ambiente (Produção/Vercel)
    // O JSON da chave deve estar em Base64 para evitar erros de quebra de linha
    if (process.env.GCS_CREDENTIALS_BASE64) {
      try {
        const credentialsJson = Buffer.from(
          process.env.GCS_CREDENTIALS_BASE64,
          'base64',
        ).toString('utf-8');
        storageOptions.credentials = JSON.parse(credentialsJson);
      } catch (error) {
        console.error('Erro ao decodificar GCS_CREDENTIALS_BASE64', error);
      }
    }
    // 2. FALLBACK: Arquivo Local (Desenvolvimento)
    else if (process.env.GCS_KEY_FILE_PATH) {
      storageOptions.keyFilename = process.env.GCS_KEY_FILE_PATH;
    }

    this.storage = new Storage(storageOptions);
    this.bucket = bucketName || '';
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ url: string; name: string }> {
    try {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname);
      const filename = `${folder}/${uniqueSuffix}${extension}`;

      const bucket = this.storage.bucket(this.bucket);
      const fileUpload = bucket.file(filename);

      await new Promise((resolve, reject) => {
        const blobStream = fileUpload.createWriteStream({
          resumable: false,
          contentType: file.mimetype,
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });

        blobStream.on('error', (error) => reject(error));

        blobStream.on('finish', () => {
          resolve(true);
        });

        blobStream.end(file.buffer);
      });

      const publicUrl = `https://storage.googleapis.com/${this.bucket}/${filename}`;

      return {
        url: publicUrl,
        name: file.originalname,
      };
    } catch (error) {
      console.error('Erro no upload GCS:', error);
      throw new InternalServerErrorException(
        'Falha ao fazer upload do arquivo.',
      );
    }
  }

  async getSignedUrl(fileUrl: string): Promise<string> {
    try {
      const bucketUrlPrefix = `https://storage.googleapis.com/${this.bucket}/`;

      if (!fileUrl.startsWith(bucketUrlPrefix)) {
        return fileUrl;
      }

      const filename = fileUrl.replace(bucketUrlPrefix, '');

      const [signedUrl] = await this.storage
        .bucket(this.bucket)
        .file(filename)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hora
        });

      return signedUrl;
    } catch (error) {
      console.error('Erro ao gerar Signed URL:', error);
      // Em caso de erro, retorna a original (pode ser pública) ou lança exceção
      return fileUrl;
    }
  }
}
