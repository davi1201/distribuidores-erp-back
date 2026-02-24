import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinancialCategoryService } from './financial-category.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/financial-category.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator'; // Ajuste o caminho
import { CategoryType } from '@prisma/client';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('categories') // A rota final será /categories
@UseGuards(ClerkAuthGuard) // Protege todas as rotas do controlador
export class FinancialCategoryController {
  constructor(private readonly categoryService: FinancialCategoryService) {}

  @Post()
  create(@Body() createDto: CreateCategoryDto, @CurrentUser() user: any) {
    return this.categoryService.create(createDto, user.tenantId);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('type') type?: CategoryType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const showInactive = includeInactive === 'true';
    return this.categoryService.findAll(user.tenantId, type, showInactive);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.categoryService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.categoryService.update(id, updateDto, user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.categoryService.remove(id, user.tenantId);
  }
}
