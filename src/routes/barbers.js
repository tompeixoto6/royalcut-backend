// src/routes/barbers.js
import { prisma } from '../utils/prisma.js'
import { generateSlots } from '../utils/slots.js'
import { z } from 'zod'

export default async function barberRoutes(app) {

  // GET /api/barbers — lista pública
  app.get('/', async (request, reply) => {
    const barbers = await prisma.barber.findMany({
      where: { active: true },
      select: {
        id: true, name: true, bio: true, specialty: true, photoUrl: true,
        schedule: { select: { dayOfWeek: true, startTime: true, endTime: true, active: true } },
      },
      orderBy: { name: 'asc' },
    })
    return reply.send(barbers)
  })

  // GET /api/barbers/:id
  app.get('/:id', async (request, reply) => {
    const barber = await prisma.barber.findUnique({
      where: { id: request.params.id },
      select: {
        id: true, name: true, bio: true, specialty: true, photoUrl: true,
        schedule: true,
      },
    })
    if (!barber) return reply.code(404).send({ error: 'Barbeiro não encontrado.' })
    return reply.send(barber)
  })

  // GET /api/barbers/:id/slots?date=2024-12-20&serviceId=xxx
  // Retorna horários disponíveis para uma data e serviço
  app.get('/:id/slots', async (request, reply) => {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      serviceId: z.string(),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Parâmetros inválidos. Usa date=YYYY-MM-DD&serviceId=xxx' })
    }

    const { date, serviceId } = parsed.data
    const barberId = request.params.id

    const targetDate = new Date(date)
    const dayOfWeek = targetDate.getDay()

    // Verificar horário do barbeiro
    const schedule = await prisma.schedule.findUnique({
      where: { barberId_dayOfWeek: { barberId, dayOfWeek } },
    })

    if (!schedule || !schedule.active) {
      return reply.send({ date, slots: [], reason: 'Barbeiro não trabalha neste dia.' })
    }

    // Duração do serviço
    const service = await prisma.service.findUnique({ where: { id: serviceId } })
    if (!service) return reply.code(404).send({ error: 'Serviço não encontrado.' })

    // Reservas existentes nesse dia
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59`)

    const existingBookings = await prisma.booking.findMany({
      where: {
        barberId,
        startAt: { gte: dayStart, lte: dayEnd },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { startAt: true, endAt: true },
    })

    const slots = generateSlots({
      date,
      scheduleStart: schedule.startTime,
      scheduleEnd: schedule.endTime,
      duration: service.duration,
      existingBookings,
    })

    return reply.send({ date, barberId, serviceId, duration: service.duration, slots })
  })

  // PATCH /api/barbers/:id — atualizar perfil (próprio barbeiro ou admin)
  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const barber = await prisma.barber.findUnique({ where: { id: request.params.id } })
    if (!barber) return reply.code(404).send({ error: 'Barbeiro não encontrado.' })

    // Só o próprio barbeiro ou admin pode editar
    const isOwner = barber.userId === request.user.sub
    const isAdmin = request.user.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ error: 'Sem permissão.' })
    }

    const schema = z.object({
      name: z.string().min(2).optional(),
      bio: z.string().optional(),
      specialty: z.string().optional(),
      photoUrl: z.string().url().optional(),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const updated = await prisma.barber.update({
      where: { id: request.params.id },
      data: parsed.data,
    })
    return reply.send(updated)
  })
}
