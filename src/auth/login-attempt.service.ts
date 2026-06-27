import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

@Injectable()
export class LoginAttemptService {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly maxAttempts = 5;
  private readonly lockMinutes = 15;

  assertCanAttempt(email: string) {
    const key = email.toLowerCase().trim();
    const record = this.attempts.get(key);
    const now = Date.now();

    if (record?.lockedUntil && record.lockedUntil > now) {
      const minutes = Math.ceil((record.lockedUntil - now) / 60000);
      throw new UnauthorizedException(
        `Muitas tentativas. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    if (record?.lockedUntil && record.lockedUntil <= now) {
      this.attempts.delete(key);
    }
  }

  registerFailure(email: string) {
    const key = email.toLowerCase().trim();
    const current = this.attempts.get(key) ?? { count: 0 };
    const nextCount = current.count + 1;

    if (nextCount >= this.maxAttempts) {
      this.attempts.set(key, {
        count: nextCount,
        lockedUntil: Date.now() + this.lockMinutes * 60 * 1000,
      });
      throw new UnauthorizedException(
        `Conta temporariamente bloqueada por ${this.lockMinutes} minutos.`,
      );
    }

    this.attempts.set(key, { count: nextCount });
  }

  reset(email: string) {
    this.attempts.delete(email.toLowerCase().trim());
  }
}

export function assertPasswordsMatch(
  password: string,
  confirmPassword: string,
  message = 'As senhas não conferem',
) {
  if (password !== confirmPassword) {
    throw new BadRequestException(message);
  }
}
