// src/routes/admin.js
import { prisma } from '../utils/prisma.js'
import { z } from 'zod'
import { sendBookingConfirmation } from '../services/notifications.js'

export default async function adminRoutes(app) {
  // Todas as rotas aqui requerem autenticação
  // Admin vê tudo; Barbeiro vê só as suas reservas

  // GET /api/admin/dashboard — métricas resumidas (admin only)
  app.get('/dashboard', { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalBookings,
      todayBookings,
      monthRevenue,
      pendingBookings,
      noShows,
      recentBookings,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({
        where: { startAt: { gte: todayStart, lt: todayEnd }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      }),
      prisma.booking.aggregate({
        where: { status: 'COMPLETED', startAt: { gte: monthStart } },
        _sum: { amountPaid: true },
      }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'NO_SHOW' } }),
      prisma.booking.findMany({
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gte: now } },
        include: { barber: { select: { name: true } }, service: { select: { name: true, price: true } } },
        orderBy: { startAt: 'asc' },
        take: 10,
      }),
    ])

    // Taxa de no-show
    const completedOrNoShow = await prisma.booking.count({
      where: { status: { in: ['COMPLETED', 'NO_SHOW'] } },
    })
    const noShowRate = completedOrNoShow > 0
      ? ((noShows / completedOrNoShow) * 100).toFixed(1)
      : '0.0'

    return reply.send({
      stats: {
        totalBookings,
        todayBookings,
        monthRevenue: Number(monthRevenue._sum.amountPaid ?? 0).toFixed(2),
        pendingBookings,
        noShows,
        noShowRate: `${noShowRate}%`,
      },
      upcoming: recentBookings.map(b => ({
        id: b.id,
        client: b.clientName,
        service: b.service.name,
        barber: b.barber.name,
        startAt: b.startAt,
        status: b.status,
        price: b.service.price,
      })),
    })
  })

  // GET /api/admin/bookings — lista completa com filtros
  app.get('/bookings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
      status: z.enum(['PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW']).optional(),
      barberId: z.string().optional(),
      date: z.string().optional(),
      search: z.string().optional(),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const { page, limit, status, barberId, date, search } = parsed.data
    const skip = (page - 1) * limit

    // Barbeiros só vêem as suas próprias reservas
    const filterBarberId = request.user.role === 'BARBER'
      ? request.user.barberId
      : barberId

    const where = {
      ...(status && { status }),
      ...(filterBarberId && { barberId: filterBarberId }),
      ...(date && {
        startAt: {
          gte: new Date(`${date}T00:00:00`),
          lte: new Date(`${date}T23:59:59`),
        },
      }),
      ...(search && {
        OR: [
          { clientName: { contains: search, mode: 'insensitive' } },
          { clientEmail: { contains: search, mode: 'insensitive' } },
          { clientPhone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          barber: { select: { name: true } },
          service: { select: { name: true, price: true } },
        },
        orderBy: { startAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ])

    return reply.send({
      data: bookings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  })

  // PATCH /api/admin/bookings/:id/status — alterar estado
  app.patch('/bookings/:id/status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const booking = await prisma.booking.findUnique({
      where: { id: request.params.id },
      include: { barber: true },
    })
    if (!booking) return reply.code(404).send({ error: 'Reserva não encontrada.' })

    // Barbeiro só pode atualizar as suas próprias reservas
    if (request.user.role === 'BARBER' && booking.barberId !== request.user.barberId) {
      return reply.code(403).send({ error: 'Sem permissão.' })
    }

    const updated = await prisma.booking.update({
      where: { id: request.params.id },
      data: { status: parsed.data.status },
    })

    return reply.send(updated)
  })

  // GET /api/admin/barbers/:id/schedule — ver horário
  app.get('/barbers/:id/schedule', { onRequest: [app.authenticate] }, async (request, reply) => {
    const schedule = await prisma.schedule.findMany({
      where: { barberId: request.params.id },
      orderBy: { dayOfWeek: 'asc' },
    })
    return reply.send(schedule)
  })

  // PUT /api/admin/barbers/:id/schedule — atualizar horário
  app.put('/barbers/:id/schedule', { onRequest: [app.authenticate] }, async (request, reply) => {
    const barberId = request.params.id

    // Validar permissão
    if (request.user.role === 'BARBER' && request.user.barberId !== barberId) {
      return reply.code(403).send({ error: 'Sem permissão.' })
    }

    const schema = z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      active: z.boolean(),
    }))

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    // Upsert cada dia
    await Promise.all(parsed.data.map(day =>
      prisma.schedule.upsert({
        where: { barberId_dayOfWeek: { barberId, dayOfWeek: day.dayOfWeek } },
        update: { startTime: day.startTime, endTime: day.endTime, active: day.active },
        create: { barberId, ...day },
      })
    ))

    const updated = await prisma.schedule.findMany({
      where: { barberId },
      orderBy: { dayOfWeek: 'asc' },
    })
    return reply.send(updated)
  })

  // GET /api/admin/stats/revenue — receita por período (admin only)
  app.get('/stats/revenue', { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const schema = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    const { from, to } = schema.parse(request.query)

    const where = {
      status: 'COMPLETED',
      ...(from && { startAt: { gte: new Date(from) } }),
      ...(to && { startAt: { lte: new Date(`${to}T23:59:59`) } }),
    }

    const [total, byBarber, byService] = await Promise.all([
      prisma.booking.aggregate({ where, _sum: { amountPaid: true }, _count: true }),
      prisma.booking.groupBy({
        by: ['barberId'],
        where,
        _sum: { amountPaid: true },
        _count: true,
      }),
      prisma.booking.groupBy({
        by: ['serviceId'],
        where,
        _sum: { amountPaid: true },
        _count: true,
      }),
    ])

    // Enriquecer com nomes
    const barbers = await prisma.barber.findMany({ select: { id: true, name: true } })
    const services = await prisma.service.findMany({ select: { id: true, name: true } })

    const barberMap = Object.fromEntries(barbers.map(b => [b.id, b.name]))
    const serviceMap = Object.fromEntries(services.map(s => [s.id, s.name]))

    return reply.send({
      total: {
        revenue: Number(total._sum.amountPaid ?? 0).toFixed(2),
        bookings: total._count,
      },
      byBarber: byBarber.map(b => ({
        barber: barberMap[b.barberId] ?? b.barberId,
        revenue: Number(b._sum.amountPaid ?? 0).toFixed(2),
        bookings: b._count,
      })),
      byService: byService.map(s => ({
        service: serviceMap[s.serviceId] ?? s.serviceId,
        revenue: Number(s._sum.amountPaid ?? 0).toFixed(2),
        bookings: s._count,
      })),
    })
  })
}
