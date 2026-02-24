// src/routes/bookings.js
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { createCheckoutSession } from '../services/stripe.js'
import { sendBookingConfirmation } from '../services/notifications.js'

const createBookingSchema = z.object({
  clientName: z.string().min(2),
  clientEmail: z.string().email(),
  clientPhone: z.string().min(9),
  barberId: z.string(),
  serviceId: z.string(),
  startAt: z.string().datetime(),
  notes: z.string().optional(),
})

export default async function bookingRoutes(app) {

  // POST /api/bookings — criar reserva + sessão de pagamento Stripe
  app.post('/', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = createBookingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos.', details: parsed.error.flatten() })
    }

    const { clientName, clientEmail, clientPhone, barberId, serviceId, startAt, notes } = parsed.data

    // Verificar se barbeiro e serviço existem
    const [barber, service] = await Promise.all([
      prisma.barber.findUnique({ where: { id: barberId, active: true } }),
      prisma.service.findUnique({ where: { id: serviceId, active: true } }),
    ])

    if (!barber) return reply.code(404).send({ error: 'Barbeiro não encontrado.' })
    if (!service) return reply.code(404).send({ error: 'Serviço não encontrado.' })

    const start = new Date(startAt)
    const end = new Date(start.getTime() + service.duration * 60 * 1000)

    // Verificar conflito de horário
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [
          { startAt: { gte: start, lt: end } },
          { endAt: { gt: start, lte: end } },
          { startAt: { lte: start }, endAt: { gte: end } },
        ],
      },
    })

    if (conflict) {
      return reply.code(409).send({ error: 'Este horário já está ocupado. Por favor escolhe outro.' })
    }

    // Criar reserva com status PENDING
    const booking = await prisma.booking.create({
      data: {
        clientName,
        clientEmail,
        clientPhone,
        barberId,
        serviceId,
        startAt: start,
        endAt: end,
        notes,
        status: 'PENDING',
      },
      include: { barber: true, service: true },
    })

    // Criar sessão de checkout no Stripe
    const session = await createCheckoutSession({
      bookingId: booking.id,
      clientEmail,
      clientName,
      serviceName: service.name,
      amount: Number(service.price),
    })

    // Guardar o ID da sessão Stripe na reserva
    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripeSessionId: session.id },
    })

    return reply.code(201).send({
      booking: {
        id: booking.id,
        clientName: booking.clientName,
        service: booking.service.name,
        barber: booking.barber.name,
        startAt: booking.startAt,
        endAt: booking.endAt,
        status: booking.status,
        price: booking.service.price,
      },
      payment: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    })
  })

  // GET /api/bookings/:id — detalhe de uma reserva (sem auth, por ID)
  app.get('/:id', async (request, reply) => {
    const booking = await prisma.booking.findUnique({
      where: { id: request.params.id },
      include: { barber: true, service: true },
    })

    if (!booking) return reply.code(404).send({ error: 'Reserva não encontrada.' })

    return reply.send({
      id: booking.id,
      clientName: booking.clientName,
      clientEmail: booking.clientEmail,
      service: { name: booking.service.name, price: booking.service.price },
      barber: { name: booking.barber.name },
      startAt: booking.startAt,
      endAt: booking.endAt,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    })
  })

  // DELETE /api/bookings/:id/cancel — cancelar reserva pelo cliente
  app.delete('/:id/cancel', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const schema = z.object({ clientEmail: z.string().email() })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Email necessário para cancelar.' })

    const booking = await prisma.booking.findUnique({ where: { id: request.params.id } })
    if (!booking) return reply.code(404).send({ error: 'Reserva não encontrada.' })

    // Validar email do cliente
    if (booking.clientEmail !== parsed.data.clientEmail) {
      return reply.code(403).send({ error: 'Email não corresponde à reserva.' })
    }

    // Só pode cancelar se faltar mais de 2 horas
    const hoursUntil = (new Date(booking.startAt) - new Date()) / 1000 / 3600
    if (hoursUntil < 2) {
      return reply.code(400).send({ error: 'Só é possível cancelar com pelo menos 2 horas de antecedência.' })
    }

    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
      return reply.code(400).send({ error: `Reserva já está ${booking.status.toLowerCase()}.` })
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
    })

    return reply.send({ message: 'Reserva cancelada com sucesso.' })
  })

  // GET /api/bookings/my — reservas de um cliente por email
  app.get('/my', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const schema = z.object({ email: z.string().email() })
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Email inválido.' })

    const bookings = await prisma.booking.findMany({
      where: { clientEmail: parsed.data.email },
      include: { barber: true, service: true },
      orderBy: { startAt: 'desc' },
      take: 20,
    })

    return reply.send(bookings.map(b => ({
      id: b.id,
      service: b.service.name,
      barber: b.barber.name,
      startAt: b.startAt,
      status: b.status,
      price: b.service.price,
    })))
  })
}
