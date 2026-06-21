import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!admin) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = { sub: admin.id, email: admin.email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '7d'),
    });

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email },
    };
  }

  async seedAdmin() {
    const email = this.config.get('ADMIN_EMAIL', 'admin@yora.com.br');
    const existing = await this.prisma.admin.findUnique({ where: { email } });

    if (existing) {
      return;
    }

    const password = this.config.get('ADMIN_PASSWORD', 'Admin@123');
    await this.prisma.admin.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
  }
}
