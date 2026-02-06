/**
 * Carga en la base de datos los mapeos clase (código→nombre) y marca (código→nombre)
 * desde nit/scripts/class-mapping.json y nit/scripts/brand-mapping.json.
 *
 * Uso desde la raíz del monorepo (nit):
 *   pnpm run load-mappings
 * O desde nit/apps/api (con DATABASE_URL en el entorno o en nit/.env):
 *   npm run load-mappings
 *
 * Requiere: DATABASE_URL. Opcional: TENANT_NAME (por defecto usa el primer tenant).
 */

import * as path from 'path';
try {
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
} catch {
  // Si no hay dotenv, usar variables de entorno ya definidas
}

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

const ROOT = path.resolve(__dirname, '../..');
const NIT_SCRIPTS = path.join(ROOT, '..', '..', 'scripts');

async function main() {
  const tenantName = process.env.TENANT_NAME ?? null;
  const tenant = tenantName
    ? await prisma.tenant.findFirst({ where: { name: tenantName } })
    : await prisma.tenant.findFirst();

  if (!tenant) {
    throw new Error(
      tenantName
        ? `No se encontró tenant con nombre "${tenantName}". Revisa TENANT_NAME.`
        : 'No hay ningún tenant en la base de datos. Ejecuta antes el seed o crea un tenant.',
    );
  }

  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenantId})\n`);

  const classPath = path.join(NIT_SCRIPTS, 'class-mapping.json');
  const brandPath = path.join(NIT_SCRIPTS, 'brand-mapping.json');

  if (!fs.existsSync(classPath)) {
    console.warn(`No existe ${classPath}; se omite clase.`);
  } else {
    const classContent = JSON.parse(fs.readFileSync(classPath, 'utf-8'));
    const mappings = (classContent.mappings ?? []) as Array<{ code: string; name: string }>;
    for (const { code, name } of mappings) {
      const c = String(code ?? '').trim();
      if (!c) continue;
      await prisma.productClass.upsert({
        where: { tenantId_code: { tenantId, code: c } },
        update: { name: String(name ?? '').trim() },
        create: { tenantId, code: c, name: (String(name ?? '').trim()) || c },
      });
    }
    console.log(`Clase: ${mappings.length} mapeos cargados.`);
  }

  if (!fs.existsSync(brandPath)) {
    console.warn(`No existe ${brandPath}; se omite marca.`);
  } else {
    const brandContent = JSON.parse(fs.readFileSync(brandPath, 'utf-8'));
    const mappings = (brandContent.mappings ?? []) as Array<{ code: string; name: string }>;
    for (const { code, name } of mappings) {
      const c = String(code ?? '').trim();
      if (!c) continue;
      await prisma.productBrand.upsert({
        where: { tenantId_code: { tenantId, code: c } },
        update: { name: String(name ?? '').trim() },
        create: { tenantId, code: c, name: (String(name ?? '').trim()) || c },
      });
    }
    console.log(`Marca: ${mappings.length} mapeos cargados.`);
  }

  console.log('\nListo. Puedes volver a sincronizar ventas para que los ítems usen nombres de clase/marca.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
