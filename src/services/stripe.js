// src/services/stripe.js
import Stripe from 'stripe'
import { prisma } from '../utils/prisma.js'
import { sendBookingConfirmation } from './notifications.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/**
 * Cria uma sessão de checkout no Stripe
 */
export async function createCheckoutSession({ bookingId, clientEmail, clientName, serviceName, amount }) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: clientEmail,
    line_items: [
      {
        price_data: {
          currency: process.env.STRIPE_CURRENCY || 'eur',
          product_data: {
            name: `Royal Cut — ${serviceName}`,
            description: `Reserva confirmada para ${clientName}`,
            images: [], // podes adicionar logo aqui
          },
          unit_amount: Math.round(amount * 100), // centavos
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId },
    success_url: `${process.env.FRONTEND_URL}/booking-success?bookingId=${bookingId}`,
    cancel_url: `${process.env.FRONTEND_URL}/booking-cancelled?bookingId=${bookingId}`,
    expires_at: Math.floor(Date.now() / 1000) + 1800, // expira em 30 min
  })

  return session
}

/**
 * Processa eventos do webhook do Stripe
 */
export async function handleWebhookEvent(rawBody, signature) {
  let event

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    throw new Error(`Webhook signature inválida: ${err.message}`)
  }

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object
      const bookingId = session.metadata?.bookingId

      if (!bookingId) break

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          stripePaymentId: session.payment_intent,
          amountPaid: session.amount_total / 100,
        },
        include: { barber: true, service: true },
      })

      // Enviar confirmação por email + SMS
      await sendBookingConfirmation(booking)
      console.log(`✅ Pagamento confirmado: Reserva ${bookingId}`)
      break
    }

    case 'checkout.session.expired': {
      const session = event.data.object
      const bookingId = session.metadata?.bookingId

      if (bookingId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED', paymentStatus: 'FAILED' },
        })
        console.log(`⚠️ Sessão expirada: Reserva ${bookingId} cancelada`)
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object
      await prisma.booking.updateMany({
        where: { stripePaymentId: charge.payment_intent },
        data: { paymentStatus: 'REFUNDED' },
      })
      console.log(`💸 Reembolso processado: ${charge.payment_intent}`)
      break
    }

    default:
      // Ignorar outros eventos
      break
  }

  return { received: true }
}
