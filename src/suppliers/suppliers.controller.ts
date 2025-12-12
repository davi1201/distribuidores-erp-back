import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import {
  CreateSupplierDto,
  LinkProductSupplierDto,
} from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto'; // Crie este arquivo
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  // --- CRUD ---
  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: User) {
    return this.suppliersService.create(dto, user.tenantId ?? '');
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.suppliersService.findAll(user.tenantId ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.suppliersService.findOne(id, user.tenantId ?? '');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: User,
  ) {
    return this.suppliersService.update(id, dto, user.tenantId ?? '');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.suppliersService.remove(id, user.tenantId ?? '');
  }

  // --- VÍNCULOS ---

  @Post('link-product')
  linkProduct(@Body() dto: LinkProductSupplierDto, @CurrentUser() user: User) {
    return this.suppliersService.linkProduct(dto, user.tenantId ?? '');
  }

  @Get('product/:productId')
  getSuppliersByProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: User,
  ) {
    return this.suppliersService.getSuppliersByProduct(
      productId,
      user.tenantId ?? '',
    );
  }
}
