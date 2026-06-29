import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MelhorEnvioEnvironment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { MelhorEnvioApiClient } from './melhor-envio-api.client';
import { UpdateMelhorEnvioConfigDto } from '../dto/update-melhor-envio-config.dto';

@Injectable()
export class MelhorEnvioConfigService {
  private readonly logger = new Logger(MelhorEnvioConfigService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private apiClient: MelhorEnvioApiClient,
    private config: ConfigService,
  ) {}

  async getAdminConfig() {
    const config = await this.ensureConfigRow();

    return {
      clientId: config.clientId,
      hasClientSecret: Boolean(config.clientSecretEncrypted),
      hasAccessToken: Boolean(config.accessTokenEncrypted),
      hasRefreshToken: Boolean(config.refreshTokenEncrypted),
      environment: config.environment,
      isConnected: config.isConnected,
      tokenExpiresAt: config.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  async updateConfig(dto: UpdateMelhorEnvioConfigDto) {
    const current = await this.ensureConfigRow();

    const updated = await this.prisma.melhorEnvioConfig.update({
      where: { id: current.id },
      data: {
        clientId: dto.clientId?.trim() || current.clientId,
        clientSecretEncrypted:
          dto.clientSecret !== undefined
            ? dto.clientSecret
              ? this.encryption.encrypt(dto.clientSecret)
              : null
            : current.clientSecretEncrypted,
        environment: dto.environment ?? current.environment,
        isConnected:
          dto.isConnected !== undefined ? dto.isConnected : current.isConnected,
      },
    });

    return this.getAdminConfigFromRow(updated);
  }

  async getOAuthUrl() {
    const config = await this.ensureConfigRow();

    if (!config.clientId || !config.clientSecretEncrypted) {
      throw new BadRequestException(
        'Configure Client ID e Client Secret antes de autenticar',
      );
    }

    return {
      url: this.apiClient.getOAuthAuthorizeUrl(
        config.environment,
        config.clientId,
        this.getRedirectUri(),
      ),
    };
  }

  async handleOAuthCallback(code: string) {
    const config = await this.ensureConfigRow();

    if (!config.clientId || !config.clientSecretEncrypted) {
      throw new BadRequestException('Credenciais do Melhor Envio não configuradas');
    }

    const clientSecret = this.encryption.decrypt(config.clientSecretEncrypted);
    const tokenResponse = await this.apiClient.exchangeAuthorizationCode(
      config.environment,
      config.clientId,
      clientSecret,
      this.getRedirectUri(),
      code,
    );

    await this.saveTokens(tokenResponse);
    return this.getAdminConfig();
  }

  async getAccessToken(): Promise<string | null> {
    const config = await this.ensureConfigRow();

    if (!config.accessTokenEncrypted) {
      return null;
    }

    const expiresAt = config.tokenExpiresAt?.getTime() ?? 0;
    const shouldRefresh = expiresAt - Date.now() < 5 * 60 * 1000;

    if (shouldRefresh && config.refreshTokenEncrypted && config.clientId && config.clientSecretEncrypted) {
      try {
        const clientSecret = this.encryption.decrypt(config.clientSecretEncrypted);
        const refreshToken = this.encryption.decrypt(config.refreshTokenEncrypted);
        const tokenResponse = await this.apiClient.refreshAccessToken(
          config.environment,
          config.clientId,
          clientSecret,
          refreshToken,
        );
        await this.saveTokens(tokenResponse);
        return tokenResponse.access_token;
      } catch (error) {
        this.logger.error(
          'Falha ao renovar token Melhor Envio',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return this.encryption.decrypt(config.accessTokenEncrypted);
  }

  async isReady() {
    const config = await this.ensureConfigRow();
    return Boolean(
      config.isConnected &&
        config.clientId &&
        config.clientSecretEncrypted &&
        config.accessTokenEncrypted,
    );
  }

  async getEnvironment(): Promise<MelhorEnvioEnvironment> {
    const config = await this.ensureConfigRow();
    return config.environment;
  }

  private async saveTokens(tokenResponse: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }) {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    await this.prisma.melhorEnvioConfig.update({
      where: { id: 'default' },
      data: {
        accessTokenEncrypted: this.encryption.encrypt(tokenResponse.access_token),
        refreshTokenEncrypted: this.encryption.encrypt(tokenResponse.refresh_token),
        tokenExpiresAt: expiresAt,
        isConnected: true,
      },
    });
  }

  private async ensureConfigRow() {
    const config = await this.prisma.melhorEnvioConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      throw new NotFoundException('Configuração do Melhor Envio não encontrada');
    }

    return config;
  }

  private getRedirectUri() {
    const apiUrl =
      this.config.get<string>('API_PUBLIC_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3001';

    return `${apiUrl.replace(/\/$/, '')}/admin/shipping/providers/melhor-envio/oauth/callback`;
  }

  private getAdminConfigFromRow(config: {
    clientId: string | null;
    clientSecretEncrypted: string | null;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    environment: MelhorEnvioEnvironment;
    isConnected: boolean;
    tokenExpiresAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      clientId: config.clientId,
      hasClientSecret: Boolean(config.clientSecretEncrypted),
      hasAccessToken: Boolean(config.accessTokenEncrypted),
      hasRefreshToken: Boolean(config.refreshTokenEncrypted),
      environment: config.environment,
      isConnected: config.isConnected,
      tokenExpiresAt: config.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
