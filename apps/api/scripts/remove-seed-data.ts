/**
 * Elimina de la BD los datos de prueba creados por el seed anterior
 * (clientes 900001..900008, facturas INV-90000x-x, créditos, métricas, alertas).
 * No toca datos reales que vengan de la API.
 *
 * Uso desde nit/apps/api (con DATABASE_URL en .env):
 *   npx ts-node -r tsconfig-paths/register scripts/remove-seed-data.ts
 * O: npm run remove-seed-data
 *
 * Opcional: TENANT_NAME para limitar a un tenant.
 */

import * as path from 'path';
try {
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
} catch {
  // ignore
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_NITS = ['900001', '900002', '900003', '900004', '900005', '900006', '900007', '900008'];

async function main() {
  const tenantName = process.env.TENANT_NAME ?? null;
  const tenants = tenantName
    ? await prisma.tenant.findMany({ where: { name: tenantName } })
    : await prisma.tenant.findMany();

  if (tenants.length === 0) {
    console.log('No hay tenants. Nada que limpiar.');
    return;
  }

  for (const tenant of tenants) {
    const seedCustomers = await prisma.customer.findMany({
      where: { tenantId: tenant.id, nit: { in: SEED_NITS } },
      select: { id: true },
    });
    const seedCustomerIds = seedCustomers.map((c) => c.id);
    if (seedCustomerIds.length === 0) {
      console.log(`Tenant ${tenant.name}: no hay clientes de prueba (900001..900008).`);
      continue;
    }

    const seedInvoices = await prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        customerId: { in: seedCustomerIds },
        invoiceNumber: { startsWith: 'INV-' },
      },
      select: { id: true },
    });
    const seedInvoiceIds = seedInvoices.map((i) => i.id);

    let deletedPayments = 0;
    let deletedItems = 0;
    let deletedInvoices = 0;
    let deletedCredits = 0;
    let deletedMetrics = 0;
    let deletedEvents = 0;
    let deletedCustomers = 0;

    if (seedInvoiceIds.length > 0) {
      const pay = await prisma.payment.deleteMany({
        where: { invoiceId: { in: seedInvoiceIds } },
      });
      deletedPayments = pay.count;
      const items = await prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: seedInvoiceIds } },
      });
      deletedItems = items.count;
      const inv = await prisma.invoice.deleteMany({
        where: { id: { in: seedInvoiceIds } },
      });
      deletedInvoices = inv.count;
    }

    const cred = await prisma.credit.deleteMany({
      where: { customerId: { in: seedCustomerIds } },
    });
    deletedCredits = cred.count;
    const metrics = await prisma.metricsDaily.deleteMany({
      where: { customerId: { in: seedCustomerIds } },
    });
    deletedMetrics = metrics.count;
    const events = await prisma.alertEvent.deleteMany({
      where: { customerId: { in: seedCustomerIds } },
    });
    deletedEvents = events.count;
    const cust = await prisma.customer.deleteMany({
      where: { id: { in: seedCustomerIds } },
    });
    deletedCustomers = cust.count;

    console.log(
      `Tenant ${tenant.name}: eliminados ${deletedPayments} pagos, ${deletedItems} ítems, ${deletedInvoices} facturas, ${deletedCredits} créditos, ${deletedMetrics} métricas diarias, ${deletedEvents} eventos de alerta, ${deletedCustomers} clientes de prueba.`,
    );
  }

  console.log('Listo. Solo quedan datos reales (sincronizados con la API).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
