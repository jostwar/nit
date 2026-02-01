import { Controller, Delete, Get, Param, Patch, Body } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('ADMIN')
  @Get()
  list(@TenantId() tenantId: string) {
    return this.usersService.listUsers(tenantId);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(tenantId, userId, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') userId: string) {
    return this.usersService.deleteUser(tenantId, userId);
  }
}
