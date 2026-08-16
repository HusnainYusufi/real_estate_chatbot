import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { BotsService } from './bots/bots.service';
import { User } from './entities/user.entity';
import { KnowledgeService } from './knowledge/knowledge.service';
import { TemplatesService } from './templates/templates.service';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin-password-123';
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo-password-123';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const auth = app.get(AuthService);
  const bots = app.get(BotsService);
  const knowledge = app.get(KnowledgeService);
  const templates = app.get(TemplatesService);
  const users: Repository<User> = app.get(getRepositoryToken(User));

  // ── Platform admin (operates the Next.js admin panel) ────────────────────
  try {
    await auth.register({
      organizationName: 'Platform',
      name: 'Platform Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    await users.update({ email: ADMIN_EMAIL }, { platformAdmin: true });
    console.log(`Created PLATFORM ADMIN  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } catch {
    console.log(`Platform admin already exists (${ADMIN_EMAIL})`);
  }

  // ── Demo client with one bot per template ────────────────────────────────
  let session;
  try {
    session = await auth.register({
      organizationName: 'Demo Client Co',
      name: 'Demo User',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    console.log(`Created demo client     ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } catch {
    session = await auth.login(DEMO_EMAIL, DEMO_PASSWORD);
    console.log(`Demo client already exists (${DEMO_EMAIL})`);
  }
  const orgId = session.user.orgId;
  const existing = await bots.list(orgId);

  console.log('\nDemo bots:');
  for (const template of await templates.list()) {
    let bot = existing.find((b) => b.name === template.name);
    if (!bot) {
      bot = await templates.instantiate(bots, knowledge, orgId, template.id);
      console.log(`  created  ${bot.name}  (template: ${template.id})`);
    } else {
      console.log(`  exists   ${bot.name}`);
    }
    console.log(`           widget: http://localhost:4000/?bot=${bot.publicId}`);
  }

  console.log(`\nAdmin panel login:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
