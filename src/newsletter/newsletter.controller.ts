import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';
import { NewsletterService } from './newsletter.service';

@Controller('newsletter')
export class NewsletterController {
  constructor(private newsletterService: NewsletterService) {}

  @Post()
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Delete(':email')
  unsubscribe(@Param('email') email: string) {
    return this.newsletterService.unsubscribe(decodeURIComponent(email));
  }
}
