import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customer/customers.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthUser } from './decorators/current-user.decorator';
import {
  LoginAttemptService,
  assertPasswordsMatch,
} from './login-attempt.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private loginAttempts: LoginAttemptService,
    private customersService: CustomersService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim(),
        passwordHash,
        role: Role.CUSTOMER,
      },
    });

    await this.customersService.linkUserOnRegister({
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto, requiredRole?: Role) {
    const email = dto.email.toLowerCase().trim();
    this.loginAttempts.assertCanAttempt(email);

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      this.loginAttempts.registerFailure(email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.loginAttempts.registerFailure(email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (requiredRole && user.role !== requiredRole) {
      throw new ForbiddenException('Acesso negado');
    }

    this.loginAttempts.reset(email);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    if (updated.role === Role.CUSTOMER) {
      await this.customersService.linkUserOnRegister({
        userId: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone ?? undefined,
      });
    }

    return this.buildAuthResponse(updated);
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.buildAuthResponse(stored.user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.deleteMany({
        where: { userId, token: tokenHash },
      });
      return { message: 'Logout realizado com sucesso' };
    }

    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Logout realizado com sucesso' };
  }

  async getProfile(userId: string) {
    const user = await this.findActiveUser(userId);
    return this.mapUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl.trim() } : {}),
      },
    });

    return this.mapUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    assertPasswordsMatch(dto.newPassword, dto.confirmPassword);

    const user = await this.findActiveUser(userId);
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Senha atual inválida');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return { message: 'Senha alterada com sucesso' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user?.isActive) {
      const plainToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: this.hashToken(plainToken),
          expiresAt,
        },
      });

      const resetUrl = `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/redefinir-senha?token=${plainToken}`;
      console.log(`[yoraback] Link de recuperação para ${email}: ${resetUrl}`);
    }

    return {
      message:
        'Se o e-mail existir, enviaremos instruções para redefinir a senha.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    assertPasswordsMatch(dto.password, dto.confirmPassword);

    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt < new Date() ||
      !resetToken.user.isActive
    ) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso' };
  }

  async seedAdmin() {
    const email = this.config
      .get<string>('ADMIN_EMAIL', 'admin@yora.com.br')
      .toLowerCase()
      .trim();
    const password = this.config.get<string>('ADMIN_PASSWORD', 'Admin@123');
    const passwordHash = await bcrypt.hash(password, 10);
    const name = this.config.get<string>('ADMIN_NAME', 'Administrador');

    await this.prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        name,
      },
      create: {
        email,
        passwordHash,
        role: Role.ADMIN,
        name,
        emailVerified: true,
      },
    });

    await this.prisma.admin.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    console.log(`[yoraback] Admin sincronizado: ${email}`);
  }

  private async buildAuthResponse(user: User) {
    const tokens = await this.issueTokens(user);

    return {
      ...tokens,
      user: this.mapUser(user),
      admin:
        user.role === Role.ADMIN
          ? { id: user.id, email: user.email }
          : undefined,
    };
  }

  private async issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshDays = Number(this.config.get('JWT_REFRESH_DAYS', '7'));
    const expiresAt = new Date(
      Date.now() + refreshDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    };
  }

  private async findActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  private mapUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      emailVerified: user.emailVerified,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async resolveLinkedUserIdFromAuthorization(
    authorization?: string,
  ): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) {
      return undefined;
    }

    try {
      const token = authorization.slice(7);
      const payload = await this.jwtService.verifyAsync<{ sub: string; role: Role }>(
        token,
        { secret: this.config.getOrThrow<string>('JWT_SECRET') },
      );

      if (payload.role !== Role.CUSTOMER) {
        return undefined;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user?.isActive) {
        return undefined;
      }

      return user.id;
    } catch {
      return undefined;
    }
  }

  async resolveCustomerIdFromAuthorization(
    authorization?: string,
  ): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) {
      return undefined;
    }

    try {
      const token = authorization.slice(7);
      const payload = await this.jwtService.verifyAsync<{ sub: string; role: Role }>(
        token,
        { secret: this.config.getOrThrow<string>('JWT_SECRET') },
      );

      if (payload.role !== Role.CUSTOMER) {
        return undefined;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { customer: true },
      });

      if (!user?.isActive || !user.customer) {
        return undefined;
      }

      return user.customer.id;
    } catch {
      return undefined;
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
