import { Module, forwardRef } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { AdminNewsletterController } from './admin-newsletter.controller';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';

@Module({
  imports: [forwardRef(() => EmailModule)],
  controllers: [NewsletterController, AdminNewsletterController],
  providers: [NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
