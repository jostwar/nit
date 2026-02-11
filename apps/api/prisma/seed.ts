import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.alertEvent.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.metricsDaily.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.credit.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { name: process.env.TENANT_NAME ?? 'NITIQ Demo' },
  });

  const adminPassword = await bcrypt.hash('Admin123', 10);
  const analystPassword = await bcrypt.hash('analyst123', 10);

  await prisma.user.createMany({
    data: [
      { tenantId: tenant.id, email: 'jarrieta@gsp.com.co', passwordHash: adminPassword, role: Role.ADMIN },
      { tenantId: tenant.id, email: 'analyst@nitiq.local', passwordHash: analystPassword, role: Role.ANALYST },
    ],
  });

  console.log('Seed: tenant y usuarios creados. Sin datos de prueba (clientes/facturas). Sincroniza con tu API para cargar datos reales.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
