import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PlansModule } from './plans/plans.module';
import { AuthModule } from './auth/auth.module';
import { AuditService } from './audit/audit.service';
import { AuditModule } from './audit/audit.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit/audit.interceptor';
import { PaymentModule } from './payment/payment.module';
import { CustomersModule } from './customers/customers.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { LocationsService } from './locations/locations.service';
import { LocationsModule } from './locations/locations.module';
import { StorageService } from './storage/storage.service';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProductsModule } from './products/products.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { StockModule } from './stock/stock.module';
import { SalesModule } from './sales/sales.module';
import { FinancialModule } from './financial/financial.module';
import { DashboardService } from './dashboard/dashboard.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { TeamModule } from './team/team.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { NfeModule } from './nfe/nfe.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PaymentTermModule } from './payment-term/payment-term.module';
import { CommissionsService } from './commissions/commissions.service';
import { CommissionsController } from './commissions/commissions.controller';
import { CommissionsModule } from './commissions/commissions.module';
import { PrismaService } from './prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { AsaasService } from './asaas/asaas.service';
import { AsaasModule } from './asaas/asaas.module';
import { MailModule } from './mail/mail.module';
import { SystemController } from './system/system.controller';
import { SystemService } from './system/system.service';

@Module({
  imports: [
    PrismaModule,
    PlansModule,
    AuthModule,
    AuditModule,
    PaymentModule,
    CustomersModule,
    PriceListsModule,
    LocationsModule,
    StorageModule,
    UsersModule,
    TenantsModule,
    ProductsModule,
    TaxProfilesModule,
    StockModule,
    SalesModule,
    FinancialModule,
    DashboardModule,
    TeamModule,
    SuppliersModule,
    NfeModule,
    ScheduleModule.forRoot(),
    NotificationsModule,
    WebhooksModule,
    PaymentTermModule,
    CommissionsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BankReconciliationModule,
    BankAccountsModule,
    AsaasModule,
    MailModule,
  ],
  controllers: [CommissionsController, SystemController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    LocationsService,
    StorageService,
    DashboardService,
    SystemService,
  ],
})
export class AppModule {}
