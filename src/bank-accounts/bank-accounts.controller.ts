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
import { BankAccountsService } from './bank-accounts.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator'; // Ajuste o caminho para o seu decorator de usuário
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('bank-accounts')
@UseGuards(ClerkAuthGuard) // Protege todas as rotas do controlador, ajuste para o guard que você utiliza
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  create(
    @Body() createBankAccountDto: CreateBankAccountDto,
    @CurrentUser() user: any,
  ) {
    return this.bankAccountsService.createBankAccount(
      createBankAccountDto,
      user.tenantId,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const showInactive = includeInactive === 'true';
    return this.bankAccountsService.findAllBankAccounts(
      user.tenantId,
      showInactive,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bankAccountsService.findOneBankAccount(id, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
    @CurrentUser() user: any,
  ) {
    return this.bankAccountsService.updateBankAccount(
      id,
      updateBankAccountDto,
      user.tenantId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bankAccountsService.removeBankAccount(id, user.tenantId);
  }
}
