import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async updateUser(tenantId: string, userId: string, dto: UpdateUserDto) {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: dto,
    });
    if (updated.count === 0) {
      throw new NotFoundException('User not found');
    }
    return { ok: true };
  }

  async deleteUser(tenantId: string, userId: string) {
    const deleted = await this.prisma.user.deleteMany({
      where: { id: userId, tenantId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('User not found');
    }
    return { ok: true };
  }
}
