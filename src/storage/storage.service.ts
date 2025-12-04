import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import * as path from 'path';

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucket: string;

  constructor() {
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE_PATH,
    });
    this.bucket = process.env.GCS_BUCKET_NAME || 'default-bucket-name';
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ url: string; name: string }> {
    try {
      // 1. Gerar nome único para evitar sobreposição
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname);
      const filename = `${folder}/${uniqueSuffix}${extension}`;

      // 2. Referência ao Bucket
      const bucket = this.storage.bucket(this.bucket);
      const fileUpload = bucket.file(filename);

      // 3. Upload via Stream
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
          // Opcional: Se o bucket não for público por padrão, você pode torná-lo público aqui
          // await fileUpload.makePublic();
          resolve(true);
        });

        blobStream.end(file.buffer);
      });

      // 4. Montar a URL Pública
      // Formato padrão: https://storage.googleapis.com/NOME_DO_BUCKET/NOME_DO_ARQUIVO
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
      // A URL vem assim: https://storage.googleapis.com/NOME_DO_BUCKET/pasta/arquivo.pdf
      // Precisamos extrair apenas: pasta/arquivo.pdf

      const bucketUrlPrefix = `https://storage.googleapis.com/${this.bucket}/`;

      if (!fileUrl.startsWith(bucketUrlPrefix)) {
        // Se for um arquivo antigo ou de outro lugar, retorna a url original ou erro
        return fileUrl;
      }

      const filename = fileUrl.replace(bucketUrlPrefix, '');

      const [signedUrl] = await this.storage
        .bucket(this.bucket)
        .file(filename)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // Expira em 1 hora (60 min)
        });

      return signedUrl;
    } catch (error) {
      console.error('Erro ao gerar Signed URL:', error);
      throw new BadRequestException('Não foi possível gerar link seguro.');
    }
  }
}
