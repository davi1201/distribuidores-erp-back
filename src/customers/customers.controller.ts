import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CategoryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingGuard } from '../auth/guards/billing.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('customers')
@UseGuards(ClerkAuthGuard, RolesGuard, BillingGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ==================================================================
  // CUSTOMER CATEGORY ROUTES
  // ==================================================================

  @Get('customer-categories')
  getCustomerCategories(@CurrentUser() user: any) {
    return this.customersService.getCustomerCategories(user.tenantId);
  }

  @Post('customer-categories')
  createCustomerCategory(
    @Body() categoryDto: CategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.createCustomerCategory(
      categoryDto,
      user.tenantId,
    );
  }

  @Put('customer-categories/:id')
  updateCustomerCategory(
    @Param('id') id: string,
    @Body() categoryDto: CategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.updateCustomerCategory(
      id,
      categoryDto,
      user.tenantId,
    );
  }

  @Delete('customer-categories/:id')
  deleteCustomerCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.deleteCustomerCategory(id, user.tenantId);
  }

  // ==================================================================
  // ADDRESS CATEGORY ROUTES
  // ==================================================================

  @Get('address-categories')
  getAddressCategories(@CurrentUser() user: any) {
    return this.customersService.getAddressCategories(user.tenantId);
  }

  @Post('address-categories')
  createAddressCategory(
    @Body() categoryDto: CategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.createAddressCategory(
      categoryDto,
      user.tenantId,
    );
  }

  @Put('address-categories/:id')
  updateAddressCategory(
    @Param('id') id: string,
    @Body() categoryDto: CategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.updateAddressCategory(
      id,
      categoryDto,
      user.tenantId,
    );
  }

  @Delete('address-categories/:id')
  deleteAddressCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.deleteAddressCategory(id, user.tenantId);
  }

  // ==================================================================
  // CUSTOMER CORE ROUTES (CRUD)
  // ==================================================================
  // Nota: Mantenha estas rotas por último para evitar conflito com rotas fixas

  @Post()
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.create(createCustomerDto, user.tenantId, user);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.customersService.findAll(user.tenantId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomerDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.update(id, updateDto, user.tenantId, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.remove(id, user.tenantId);
  }
}
