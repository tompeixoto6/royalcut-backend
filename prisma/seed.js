// prisma/seed.js
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 A iniciar seed...')

  // ─── ADMIN ───────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12)
  const adminUser = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@royalcut.pt' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@royalcut.pt',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })
  console.log(`✅ Admin criado: ${adminUser.email}`)

  // ─── BARBEIROS ───────────────────────────────────────────────────
  const barbers = [
    { email: 'marcus@royalcut.pt', password: 'marcus123', name: 'Marcus Silva', bio: 'Fundador e Head Barber. Mais de 10 anos a dominar a arte do fade.', specialty: 'Skin Fade' },
    { email: 'diogo@royalcut.pt',  password: 'diogo123',  name: 'Diogo Ferreira', bio: 'Especialista em barba. 7 anos atrás da cadeira, zero cortes maus.', specialty: 'Beard Sculpting' },
    { email: 'andre@royalcut.pt',  password: 'andre123',  name: 'André Costa', bio: 'Especialista em cabelos texturizados e estilos modernos.', specialty: 'Texture & Waves' },
  ]

  for (const b of barbers) {
    const hash = await bcrypt.hash(b.password, 12)
    await prisma.user.upsert({
      where: { email: b.email },
      update: {},
      create: {
        email: b.email,
        passwordHash: hash,
        role: 'BARBER',
        barber: {
          create: { name: b.name, bio: b.bio, specialty: b.specialty },
        },
      },
    })
    console.log(`✅ Barbeiro criado: ${b.name}`)
  }

  // ─── SERVIÇOS — usa createMany com skipDuplicates ────────────────
  const services = [
    { name: 'Classic Cut',       description: 'Corte a tesoura ou máquina, adaptado ao tipo de cabelo e formato do rosto.', price: 15, duration: 30 },
    { name: 'Skin Fade',         description: 'Fade de precisão do zero à pele. Linhas limpas e gradiente impecável.',        price: 18, duration: 45 },
    { name: 'Beard Trim',        description: 'Forma, contorna e trata a barba na perfeição. Acabamento com toalha quente.',  price: 10, duration: 20 },
    { name: 'Cut + Beard',       description: 'Corte premium com escultura de barba. O combo mais popular.',                  price: 25, duration: 60 },
    { name: 'Premium Package',   description: 'Corte completo, barba, barbear quente, massagem e styling.',                   price: 35, duration: 90 },
  ]

  for (const s of services) {
    // Verifica se já existe pelo nome antes de criar
    const existing = await prisma.service.findFirst({ where: { name: s.name } })
    if (!existing) {
      await prisma.service.create({ data: s })
      console.log(`✅ Serviço criado: ${s.name} — ${s.price}€`)
    } else {
      console.log(`⏭️  Serviço já existe: ${s.name}`)
    }
  }

  // ─── HORÁRIOS (todos os barbeiros, Seg-Sab) ──────────────────────
  const allBarbers = await prisma.barber.findMany()

  const weekSchedule = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '20:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '20:00' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '20:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '20:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '20:00' },
    { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' },
  ]

  for (const barber of allBarbers) {
    for (const slot of weekSchedule) {
      await prisma.schedule.upsert({
        where: { barberId_dayOfWeek: { barberId: barber.id, dayOfWeek: slot.dayOfWeek } },
        update: {},
        create: { barberId: barber.id, ...slot },
      })
    }
  }
  console.log('✅ Horários criados para todos os barbeiros')

  console.log('\n🎉 Seed completo!')
  console.log('─────────────────────────────────────')
  console.log(`Admin: ${process.env.ADMIN_EMAIL || 'admin@royalcut.pt'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`)
  console.log('─────────────────────────────────────\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
