// src/jobs/reminders.js
// Cron job que corre de hora a hora e envia lembretes 24h antes

import cron from 'node-cron'
import { prisma } from '../utils/prisma.js'
import { sendBookingReminder } from '../services/notifications.js'

export function startReminderJob() {

  // Corre todos os dias às 10:00 e às 18:00
  // (também podes usar '0 * * * *' para correr de hora a hora)
  cron.schedule('0 10,18 * * *', async () => {
    console.log('⏰ Reminder job: a verificar reservas...')
    await processReminders()
  })

  // No arranque do servidor, também verifica de imediato
  // (útil para não perder lembretes se o servidor foi reiniciado)
  setTimeout(() => processReminders(), 5000)
}

async function processReminders() {
  const now = new Date()

  // Janela: reservas que ocorrem entre 23h e 25h a partir de agora
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  // Buscar reservas confirmadas nessa janela que ainda não tiveram lembrete enviado
  const bookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      startAt: { gte: windowStart, lte: windowEnd },
      // Excluir reservas que já receberam lembrete
      reminders: {
        none: {
          sentAt: { not: null },
        },
      },
    },
    include: {
      barber: true,
      service: true,
    },
  })

  if (bookings.length === 0) {
    console.log('✅ Nenhum lembrete pendente.')
    return
  }

  console.log(`📋 ${bookings.length} lembrete(s) a enviar...`)

  let sent = 0
  let failed = 0

  for (const booking of bookings) {
    try {
      const result = await sendBookingReminder(booking)
      if (result.success) {
        sent++
        console.log(`  ✓ Lembrete enviado: ${booking.clientName} (${booking.id})`)
      } else {
        failed++
        console.warn(`  ✗ Erro ao enviar para ${booking.clientName}: ${result.errors.join(', ')}`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ Erro inesperado: ${booking.id}`, err.message)
    }
  }

  console.log(`📊 Resultado: ${sent} enviados, ${failed} falhados`)
}
