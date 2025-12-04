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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { CalculatePriceDto } from './dto/calculate-price.dto';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
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
  calculatePrice(@Body() dto: CalculatePriceDto, @CurrentUser() user: User) {
    return this.productsService.calculatePricing(dto, user.tenantId || '');
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.productsService.findAll(user.tenantId || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.productsService.findOne(id, user.tenantId || '');
  }

  @Patch(':id')
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
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.productsService.remove(id, user.tenantId || '');
  }
}
