import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Res,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { RegisterWithSubscriptionDto } from './dto/register-with-subscription.dto';
import { RegisterSimpleDto } from './dto/register-simple.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // --- HELPER PRIVADO PARA COOKIES (Centraliza a config) ---
  private setAuthCookie(response: Response, token: string) {
    response.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24, // 1 dia
      path: '/',
    });
  }

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    // Esse método antigo apenas registra, não loga automaticamente
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Reutiliza a lógica
    this.setAuthCookie(response, result.access_token);

    return {
      user: result.user,
      message: 'Login realizado com sucesso',
    };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.cookie('access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
      path: '/',
    });

    return { message: 'Logout realizado' };
  }

  // @Post('register-full')
  // async registerFull(
  //   @Body() dto: RegisterWithSubscriptionDto,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   const result = await this.authService.registerWithSubscription(dto);

  //   // Reutiliza a lógica
  //   this.setAuthCookie(res, result.access_token);

  //   return result;
  // }

  @Post('register-simple')
  async registerSimple(
    @Body() dto: RegisterSimpleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerSimple(dto);

    this.setAuthCookie(res, result.access_token);

    return result;
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    const result = await this.authService.validateGoogleUser(req.user);

    res.cookie('access_token', result.access_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.redirect('http://localhost:3005/dashboard');
  }
}
