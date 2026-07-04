export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  providerId: string | null;
  status: 'sent' | 'failed';
  message?: string;
}

export interface UpsertContactInput {
  email: string;
  firstName?: string;
  segmentId?: string;
}

export interface UpsertContactResult {
  ok: boolean;
  contactId: string | null;
  message?: string;
}

export interface EmailProvider {
  readonly name: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  upsertContact(input: UpsertContactInput): Promise<UpsertContactResult>;
  unsubscribeContact(email: string): Promise<UpsertContactResult>;
}
