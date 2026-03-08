import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PlansModule } from './plans/plans.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit/audit.interceptor';
import { PaymentModule } from './payment/payment.module';
import { CustomersModule } from './customers/customers.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { LocationsModule } from './locations/locations.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProductsModule } from './products/products.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { StockModule } from './stock/stock.module';
import { SalesModule } from './sales/sales.module';
import { FinancialModule } from './financial/financial.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TeamModule } from './team/team.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { NfeModule } from './nfe/nfe.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PaymentTermModule } from './payment-term/payment-term.module';
import { CommissionsModule } from './commissions/commissions.module';
import { ConfigModule } from '@nestjs/config';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { AsaasModule } from './asaas/asaas.module';
import { MailModule } from './mail/mail.module';
import { SystemModule } from './system/system.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import configuration from './config/configuration';

// Clean Architecture Modules
import { DatabaseModule } from './infrastructure/database/database.module';
import { FinancialModuleV2 } from './modules/financial/financial.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { LoggingModule } from './core/logging/logging.module';
import { ThrottlerModule } from './infrastructure/throttler/throttler.module';
import { QueueModule } from './infrastructure/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // Infrastructure
    LoggingModule,
    CacheModule,
    ThrottlerModule, // Rate Limiting
    QueueModule.forRoot(), // Background Jobs (requires REDIS_ENABLED=true)
    DatabaseModule,
    CommonModule,
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
    // Clean Architecture Modules
    FinancialModuleV2,
    DashboardModule,
    TeamModule,
    SuppliersModule,
    NfeModule,
    NotificationsModule,
    WebhooksModule,
    PaymentTermModule,
    CommissionsModule,
    BankReconciliationModule,
    BankAccountsModule,
    AsaasModule,
    MailModule,
    SystemModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
