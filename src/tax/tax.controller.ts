import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { TaxService } from './tax.service';
import { SearchTaxDto } from './dto/search-tax.dto';
import { ClerkAuthGuard } from '../auth/guards/clerk-auth.guard';

@Controller('tax')
@UseGuards(ClerkAuthGuard)
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('ncm')
  async searchNcms(@Query() dto: SearchTaxDto) {
    return this.taxService.searchNcms(dto);
  }

  @Get('ncm/:code')
  async getNcmByCode(@Param('code') code: string) {
    return this.taxService.findNcmByCode(code);
  }

  @Get('cest')
  async searchCests(@Query() dto: SearchTaxDto) {
    return this.taxService.findAllCests(dto);
  }

  @Get('cest/:code')
  async getCestByCode(@Param('code') code: string) {
    return this.taxService.findCestByCode(code);
  }

  @Get('cfop')
  async searchCfops(@Query() dto: SearchTaxDto) {
    return this.taxService.findAllCfops(dto);
  }

  @Get('cfop/:code')
  async getCfopByCode(@Param('code') code: string) {
    return this.taxService.findCfopByCode(code);
  }
}
