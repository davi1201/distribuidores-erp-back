import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PaymentService } from '../payment/payment.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { TenantsService } from '../tenants/tenants.service';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'default_secret_key',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, TenantsService],
})
export class AuthModule {}
