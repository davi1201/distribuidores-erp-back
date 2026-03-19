import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as path from 'path';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class StorageService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ url: string; name: string }> {
    try {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname);
      const publicId = `${folder}/${uniqueSuffix}${extension}`;

      const uploadResult: UploadApiResponse = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        {
          public_id: publicId,
          folder,
          resource_type: 'auto',
        },
      );

      return {
        url: uploadResult.secure_url,
        name: file.originalname,
      };
    } catch (error: any) {
      console.error('Erro no upload Cloudinary:', error);
      throw new InternalServerErrorException(
        'Falha ao fazer upload do arquivo.',
      );
    }
  }

  async getSignedUrl(fileUrl: string): Promise<string> {
    // Cloudinary já fornece URLs públicas seguras em `secure_url`,
    // então apenas retornamos a URL recebida.
    return fileUrl;
  }
}
