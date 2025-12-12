import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CreateProductBatchDto,
  CreateProductDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('batch')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  createBatch(
    @Body() createBatchDto: CreateProductBatchDto,
    @CurrentUser() user: User,
  ) {
    return this.productsService.createBatch(
      createBatchDto,
      user.tenantId || '',
      user,
    );
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: User,
  ) {
    // tenantId vem do user logado
    return this.productsService.create(
      createProductDto,
      user.tenantId || '',
      user,
    );
  }

  @Post('calculate-price')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  calculatePrice(@Body() dto: CalculatePriceDto, @CurrentUser() user: User) {
    return this.productsService.calculatePricing(dto, user.tenantId || '');
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.productsService.findAll(user.tenantId || '', user);
  }

  @Get('sellable')
  findSellable(@CurrentUser() user: User) {
    return this.productsService.findSellable(user.tenantId || '', user);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.productsService.findOne(id, user.tenantId || '');
  }

  @Patch('batch/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  updateBatch(
    @Param('id') id: string,
    @Body() updateBatchDto: CreateProductBatchDto,
    @CurrentUser() user: User,
  ) {
    return this.productsService.updateBatch(
      id,
      updateBatchDto,
      user.tenantId || '',
      user,
    );
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: User,
  ) {
    return this.productsService.update(
      id,
      updateProductDto,
      user.tenantId || '',
      user,
    );
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.productsService.remove(id, user.tenantId || '');
  }
}
