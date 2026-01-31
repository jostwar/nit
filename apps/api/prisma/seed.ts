import { Prisma, PrismaClient, Role, AlertRuleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function randomBetween(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

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

  const adminPassword = await bcrypt.hash('admin123', 10);
  const analystPassword = await bcrypt.hash('analyst123', 10);

  await prisma.user.createMany({
    data: [
      { tenantId: tenant.id, email: 'admin@nitiq.local', passwordHash: adminPassword, role: Role.ADMIN },
      { tenantId: tenant.id, email: 'analyst@nitiq.local', passwordHash: analystPassword, role: Role.ANALYST },
    ],
  });

  const customers = await Promise.all(
    Array.from({ length: 8 }).map((_v, index) =>
      prisma.customer.create({
        data: {
          tenantId: tenant.id,
          nit: `90000${index + 1}`,
          name: `Cliente ${index + 1}`,
          segment: index % 2 === 0 ? 'Retail' : 'Mayorista',
          city: index % 2 === 0 ? 'Bogotá' : 'Medellín',
        },
      }),
    ),
  );

  const brands = ['Andes', 'Pacifico', 'Selva', 'Norte'];
  const categories = ['Bebidas', 'Abarrotes', 'Limpieza', 'Snacks'];

  for (const customer of customers) {
    const creditLimit = randomBetween(50000, 150000);
    const balance = randomBetween(5000, 40000);
    const overdue = randomBetween(0, 15000);
    const dsoDays = Math.round(randomBetween(20, 80));

    await prisma.credit.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        creditLimit: new Prisma.Decimal(creditLimit),
        balance: new Prisma.Decimal(balance),
        overdue: new Prisma.Decimal(overdue),
        dsoDays,
      },
    });

    for (let i = 0; i < 14; i++) {
      const issuedAt = daysAgo(Math.floor(Math.random() * 70));
      const units = Math.max(1, Math.round(randomBetween(5, 40)));
      const total = randomBetween(1500, 12000);
      const margin = total * randomBetween(0.15, 0.35);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          invoiceNumber: `INV-${customer.nit}-${i + 1}`,
          issuedAt,
          total: new Prisma.Decimal(total),
          margin: new Prisma.Decimal(margin),
          units,
        },
      });

      const items = Array.from({ length: 3 }).map((_v, idx) => {
        const quantity = Math.max(1, Math.round(units / 3));
        const unitPrice = total / units;
        const itemTotal = quantity * unitPrice;
        const itemMargin = itemTotal * 0.2;
        return prisma.invoiceItem.create({
          data: {
            tenantId: tenant.id,
            invoiceId: invoice.id,
            productName: `Producto ${idx + 1}`,
            brand: brands[(i + idx) % brands.length],
            category: categories[(i + idx) % categories.length],
            quantity,
            unitPrice: new Prisma.Decimal(unitPrice),
            total: new Prisma.Decimal(itemTotal),
            margin: new Prisma.Decimal(itemMargin),
          },
        });
      });

      await Promise.all(items);

      if (i % 2 === 0) {
        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            invoiceId: invoice.id,
            paidAt: daysAgo(Math.floor(Math.random() * 50)),
            amount: new Prisma.Decimal(total * randomBetween(0.7, 1)),
          },
        });
      }
    }
  }

  const allCustomers = await prisma.customer.findMany({ where: { tenantId: tenant.id } });
  for (const customer of allCustomers) {
    for (let day = 0; day < 30; day++) {
      const date = daysAgo(day);
      const daily = await prisma.invoice.aggregate({
        where: {
          tenantId: tenant.id,
          customerId: customer.id,
          issuedAt: { gte: date, lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) },
        },
        _sum: { total: true, margin: true, units: true },
        _count: { _all: true },
      });
      await prisma.metricsDaily.upsert({
        where: {
          tenantId_customerId_date: { tenantId: tenant.id, customerId: customer.id, date },
        },
        create: {
          tenantId: tenant.id,
          customerId: customer.id,
          date,
          totalSales: daily._sum.total ?? 0,
          totalInvoices: daily._count._all,
          totalUnits: daily._sum.units ?? 0,
          totalMargin: daily._sum.margin ?? 0,
          avgTicket:
            daily._count._all > 0
              ? Number(daily._sum.total ?? 0) / daily._count._all
              : 0,
          lastPurchaseAt: daily._count._all > 0 ? date : null,
        },
        update: {},
      });
    }
  }

  await prisma.alertRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'No compra 30 días',
        type: AlertRuleType.NO_PURCHASE_DAYS,
        params: { days: 30 },
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Caída 20%',
        type: AlertRuleType.DROP_PERCENT,
        params: { percent: 20 },
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Marca perdida Andes',
        type: AlertRuleType.BRAND_LOST,
        params: { brand: 'Andes' },
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'DSO alto',
        type: AlertRuleType.DSO_HIGH,
        params: { days: 60 },
        isActive: true,
      },
    ],
  });

  const rules = await prisma.alertRule.findMany({ where: { tenantId: tenant.id } });
  const sampleCustomer = customers[0];
  if (sampleCustomer && rules.length > 0) {
    await prisma.alertEvent.create({
      data: {
        tenantId: tenant.id,
        customerId: sampleCustomer.id,
        ruleId: rules[0].id,
        message: 'Cliente sin compra en los últimos 30 días',
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
