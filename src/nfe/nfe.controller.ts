import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  UseGuards,
  Req,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NfeService } from './nfe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('nfe')
@UseGuards(JwtAuthGuard)
export class NfeController {
  constructor(private readonly nfeService: NfeService) {}

  @Post('parse')
  @UseInterceptors(FileInterceptor('file'))
  async parseXml(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    if (file.mimetype !== 'text/xml' && !file.originalname.endsWith('.xml')) {
      throw new BadRequestException('Formato inválido. Envie um XML.');
    }

    return this.nfeService.parseNfeXml(file.buffer);
  }

  @Post('import')
  async importNfe(@Body() data: any, @CurrentUser() user: User) {
    return this.nfeService.importNfe(data, user.tenantId || '', user);
  }

  @Get('inbox')
  getInbox(@CurrentUser() user: any) {
    return this.nfeService.getInbox(user.tenantId);
  }

  @Patch('inbox/:id/complete')
  async completeInboxImport(@Param('id') id: string, @CurrentUser() user: any) {
    return this.nfeService.completeInboxImport(id, user.tenantId);
  }

  // 2. Processar (Aprovar) - Transforma o XML salvo em Importação Real
  @Post('inbox/:id/process')
  async processInboxItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.nfeService.processInboxItem(id, user.tenantId, user);
  }

  // 3. Ignorar (Rejeitar)
  @Post('inbox/:id/ignore')
  async ignoreInboxItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.nfeService.ignoreInboxItem(id, user.tenantId);
  }
}
