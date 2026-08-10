import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsOptional() @IsString() @MaxLength(120) organizationName?: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
