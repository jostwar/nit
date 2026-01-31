import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  getTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, createdAt: true },
    });
  }
}
