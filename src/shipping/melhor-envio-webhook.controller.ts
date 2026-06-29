import { Body, Controller, Headers, Post } from '@nestjs/common';
import { MelhorEnvioWebhookService } from './melhor-envio-webhook.service';
import { MelhorEnvioWebhookPayload } from './melhor-envio/melhor-envio.types';

@Controller('webhooks/melhor-envio')
export class MelhorEnvioWebhookController {
  constructor(private webhookService: MelhorEnvioWebhookService) {}

  @Post()
  handle(
    @Body() payload: MelhorEnvioWebhookPayload,
    @Headers('x-me-signature') _signature?: string,
  ) {
    return this.webhookService.handle(payload);
  }
}
