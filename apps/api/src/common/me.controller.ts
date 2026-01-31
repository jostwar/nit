import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller()
export class MeController {
  @Get('me')
  me(@CurrentUser() user: { id: string; email: string; role: string; tenantId: string }) {
    return user;
  }
}
