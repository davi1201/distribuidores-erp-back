import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Body,
} from '@nestjs/common';
// CORREÇÃO AQUI: O pacote correto é @nestjs/platform-express
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  // Upload de 1 arquivo
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.uploadFile(file, 'uploads');
  }

  // Upload de múltiplos arquivos
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 arquivos
  async uploadMultiple(@UploadedFiles() files: Array<Express.Multer.File>) {
    const uploadPromises = files.map((file) =>
      this.storageService.uploadFile(file, 'attachments'),
    );
    return Promise.all(uploadPromises);
  }

  @Post('signed-url')
  async generateSignedUrl(@Body('url') url: string) {
    const signedUrl = await this.storageService.getSignedUrl(url);
    return { url: signedUrl };
  }
}
