// prisma/seed.js
// Cria dados iniciais: admin, barbeiros, serviços, horários

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
    {
      email: 'marcus@royalcut.pt',
      password: 'marcus123',
      name: 'Marcus Silva',
      bio: 'Fundador e Head Barber. Mais de 10 anos a dominar a arte do fade. Formado em Londres e Lisboa.',
      specialty: 'Skin Fade',
      photoUrl: null,
    },
    {
      email: 'diogo@royalcut.pt',
      password: 'diogo123',
      name: 'Diogo Ferreira',
      bio: 'Especialista em barba. 7 anos atrás da cadeira, zero cortes maus.',
      specialty: 'Beard Sculpting',
      photoUrl: null,
    },
    {
      email: 'andre@royalcut.pt',
      password: 'andre123',
      name: 'André Costa',
      bio: 'Especialista em cabelos texturizados e estilos modernos.',
      specialty: 'Texture & Waves',
      photoUrl: null,
    },
  ]

  for (const b of barbers) {
    const hash = await bcrypt.hash(b.password, 12)
    const user = await prisma.user.upsert({
      where: { email: b.email },
      update: {},
      create: {
        email: b.email,
        passwordHash: hash,
        role: 'BARBER',
        barber: {
          create: {
            name: b.name,
            bio: b.bio,
            specialty: b.specialty,
            photoUrl: b.photoUrl,
          },
        },
      },
    })
    console.log(`✅ Barbeiro criado: ${b.name}`)
  }

  // ─── SERVIÇOS ────────────────────────────────────────────────────
  const services = [
    {
      name: 'Classic Cut',
      description: 'Corte a tesoura ou máquina, adaptado ao tipo de cabelo e formato do rosto.',
      price: 15.00,
      duration: 30,
    },
    {
      name: 'Skin Fade',
      description: 'Fade de precisão do zero à pele. Linhas limpas e gradiente impecável.',
      price: 18.00,
      duration: 45,
    },
    {
      name: 'Beard Trim',
      description: 'Forma, contorna e trata a barba na perfeição. Acabamento com toalha quente.',
      price: 10.00,
      duration: 20,
    },
    {
      name: 'Cut + Beard',
      description: 'Corte premium com escultura de barba. O combo mais popular.',
      price: 25.00,
      duration: 60,
    },
    {
      name: 'Premium Package',
      description: 'Corte completo, barba, barbear quente, massagem ao couro cabeludo e styling.',
      price: 35.00,
      duration: 90,
    },
  ]

  for (const s of services) {
    await prisma.service.upsert({
      where: { name: s.name },
      update: s,
      create: s,
    })
    console.log(`✅ Serviço criado: ${s.name} — ${s.price}€`)
  }

  // ─── HORÁRIOS (todos os barbeiros, Seg-Sab) ──────────────────────
  const allBarbers = await prisma.barber.findMany()

  const weekSchedule = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '20:00' }, // Seg
    { dayOfWeek: 2, startTime: '09:00', endTime: '20:00' }, // Ter
    { dayOfWeek: 3, startTime: '09:00', endTime: '20:00' }, // Qua
    { dayOfWeek: 4, startTime: '09:00', endTime: '20:00' }, // Qui
    { dayOfWeek: 5, startTime: '09:00', endTime: '20:00' }, // Sex
    { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' }, // Sab
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

  console.log('\n🎉 Seed completo!\n')
  console.log('─────────────────────────────────────')
  console.log('Logins de acesso:')
  console.log(`  Admin   : ${process.env.ADMIN_EMAIL || 'admin@royalcut.pt'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`)
  console.log('  Marcus  : marcus@royalcut.pt / marcus123')
  console.log('  Diogo   : diogo@royalcut.pt / diogo123')
  console.log('  André   : andre@royalcut.pt / andre123')
  console.log('─────────────────────────────────────\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
