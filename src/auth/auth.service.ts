import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { addDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from './dto/login.dto';
import { RegisterSimpleDto } from './dto/register-simple.dto';
import { RegisterWithSubscriptionDto } from './dto/register-with-subscription.dto';
import { RegisterDto } from './dto/create-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly paymentService: PaymentService,
  ) {}

  private async generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
      },
    };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) throw new UnauthorizedException('E-mail ou senha incorretos.');
    return this.generateToken(user);
  }

  async validateGoogleUser(googleUser: any) {
    const { email, firstName, lastName, googleId } = googleUser;
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId },
      });
    } else {
      const defaultPlan = await this.prisma.plan.findUnique({
        where: { slug: 'pro' },
      });
      if (!defaultPlan)
        throw new NotFoundException('Plano padrão não encontrado.');

      const tempSlug = `tenant-${uuidv4().substring(0, 8)}`;

      user = await this.prisma.$transaction(async (tx) => {
        const newTenant = await tx.tenant.create({
          data: {
            name: `Empresa de ${firstName}`,
            slug: tempSlug,
            isActive: true,
            trialEndsAt: addDays(new Date(), 7),
            planId: defaultPlan.id,
          },
        });

        return tx.user.create({
          data: {
            email,
            name: `${firstName} ${lastName}`,
            role: Role.OWNER,
            tenantId: newTenant.id,
            googleId,
            password: await bcrypt.hash(uuidv4(), 10),
          },
        });
      });
    }
    return this.generateToken(user);
  }

  async registerSimple(data: RegisterSimpleDto) {
    const emailExists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (emailExists) throw new BadRequestException('E-mail já cadastrado.');

    const planSlug = data.planSlug || 'start';
    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado.');

    const tempSlug = `tenant-${uuidv4().substring(0, 8)}`;
    const tempCompanyName = `Empresa de ${data.name.split(' ')[0]}`;
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.$transaction(async (prisma) => {
      const tenant = await prisma.tenant.create({
        data: {
          name: tempCompanyName,
          slug: tempSlug,
          isActive: true,
          trialEndsAt: addDays(new Date(), 7),
          planId: plan.id,
        },
      });

      return prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: Role.OWNER,
          tenantId: tenant.id,
        },
      });
    });

    return this.generateToken(user);
  }

  async registerWithSubscription(data: RegisterWithSubscriptionDto) {
    const emailExists = await this.prisma.user.findUnique({
      where: { email: data.userEmail },
    });
    if (emailExists) throw new BadRequestException('E-mail já cadastrado.');

    const tenantExists = await this.prisma.tenant.findUnique({
      where: { slug: data.companySlug },
    });
    if (tenantExists)
      throw new BadRequestException('URL da empresa já existe.');

    const plan = await this.prisma.plan.findUnique({
      where: { slug: data.planSlug },
    });
    if (!plan) throw new NotFoundException('Plano selecionado inválido.');

    const pagarmeSubscription =
      await this.paymentService.createPagarmeSubscription(
        {
          name: data.companyName,
          email: data.userEmail,
          document: data.document,
        },
        plan,
        data.cardToken,
        data.cycle || 'monthly',
      );

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.$transaction(async (prisma) => {
      const tenant = await prisma.tenant.create({
        data: {
          name: data.companyName,
          slug: data.companySlug,
          isActive: true,
          planId: plan.id,
        },
      });

      const createdUser = await prisma.user.create({
        data: {
          name: data.userName,
          email: data.userEmail,
          password: hashedPassword,
          role: Role.OWNER,
          tenantId: tenant.id,
        },
      });

      await prisma.subscription.create({
        data: {
          externalId: pagarmeSubscription.id,
          customerId: pagarmeSubscription.customer.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(
            pagarmeSubscription.current_cycle.start_at,
          ),
          currentPeriodEnd: new Date(pagarmeSubscription.current_cycle.end_at),
          tenantId: tenant.id,
          planId: plan.id,
        },
      });

      return createdUser;
    });

    return this.generateToken(user);
  }

  async register(data: RegisterDto) {
    const userExists = await this.prisma.user.findUnique({
      where: { email: data.userEmail },
    });
    if (userExists) throw new BadRequestException('E-mail já cadastrado.');

    const tenantExists = await this.prisma.tenant.findUnique({
      where: { slug: data.companySlug },
    });
    if (tenantExists)
      throw new BadRequestException('Este subdomínio/slug já está em uso.');

    const plan = await this.prisma.plan.findUnique({
      where: { slug: data.planSlug },
    });
    if (!plan) throw new NotFoundException('Plano inválido.');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const result = await this.prisma.$transaction(async (prisma) => {
      const tenant = await prisma.tenant.create({
        data: {
          name: data.companyName,
          slug: data.companySlug,
          planId: plan.id,
        },
      });

      const user = await prisma.user.create({
        data: {
          name: data.userName,
          email: data.userEmail,
          password: hashedPassword,
          role: Role.OWNER,
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    return {
      message: 'Empresa registrada com sucesso!',
      tenant: { id: result.tenant.id, name: result.tenant.name },
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
    };
  }
}
