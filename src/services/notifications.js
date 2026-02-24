// src/services/notifications.js
// Email (Nodemailer) + SMS (Twilio)

import nodemailer from 'nodemailer'
import twilio from 'twilio'
import { prisma } from '../utils/prisma.js'

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null

// ─── HELPERS ─────────────────────────────────────────────────────

function formatDate(date) {
  return new Date(date).toLocaleDateString('pt-PT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('pt-PT', {
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────

function confirmationEmailHtml({ clientName, serviceName, barberName, startAt, price, bookingId }) {
  const date = formatDate(startAt)
  const time = formatTime(startAt)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Georgia, serif; background: #f4f0e8; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #0f0f0f; border-radius: 4px; overflow: hidden; }
    .header { background: #0f0f0f; padding: 40px 40px 20px; text-align: center; border-bottom: 2px solid #C9A84C; }
    .logo { font-size: 26px; color: #fff; letter-spacing: 2px; }
    .logo span { color: #C9A84C; }
    .tagline { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #888; margin-top: 4px; }
    .body { padding: 40px; }
    .greeting { font-size: 22px; color: #fff; margin-bottom: 8px; }
    .text { font-size: 15px; color: #999; line-height: 1.8; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-left: 3px solid #C9A84C; padding: 28px; margin: 28px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #222; }
    .card-row:last-child { border-bottom: none; }
    .card-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666; }
    .card-value { font-size: 15px; color: #E8E0D0; text-align: right; }
    .price-value { color: #C9A84C; font-size: 20px; font-weight: bold; }
    .cta { display: block; text-align: center; background: #C9A84C; color: #000; text-decoration: none;
           padding: 16px 32px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;
           font-weight: bold; margin: 28px 0; }
    .footer { background: #080808; padding: 24px 40px; text-align: center; }
    .footer p { font-size: 12px; color: #444; line-height: 1.8; }
    .footer a { color: #C9A84C; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Royal<span>Cut</span> Barber Shop</div>
      <div class="tagline">Porto's Premier Grooming Experience</div>
    </div>
    <div class="body">
      <h2 class="greeting">Reserva Confirmada ✓</h2>
      <p class="text">Olá ${clientName},<br>
      A tua reserva está confirmada. Vemo-nos em breve!</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Serviço</span>
          <span class="card-value">${serviceName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Barbeiro</span>
          <span class="card-value">${barberName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Data</span>
          <span class="card-value">${date}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Hora</span>
          <span class="card-value">${time}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Total pago</span>
          <span class="card-value price-value">${Number(price).toFixed(2)}€</span>
        </div>
      </div>

      <p class="text">📍 Rua de Santa Catarina, 120, Porto<br>
      Recomendamos que chegues 5 minutos antes.</p>

      <p class="text" style="margin-top: 20px;">
      Para cancelar (mínimo 2h antes), usa o link abaixo ou contacta-nos via WhatsApp.</p>

      <a href="${process.env.FRONTEND_URL}/cancel?bookingId=${bookingId}" class="cta">Gerir Reserva</a>
    </div>
    <div class="footer">
      <p>Royal Cut Barber Shop · Rua de Santa Catarina, 120, Porto<br>
      <a href="tel:+351222000000">+351 222 000 000</a> · <a href="mailto:info@royalcut.pt">info@royalcut.pt</a><br>
      <a href="${process.env.FRONTEND_URL}">royalcut.pt</a></p>
    </div>
  </div>
</body>
</html>`
}

function reminderEmailHtml({ clientName, serviceName, barberName, startAt, bookingId }) {
  const date = formatDate(startAt)
  const time = formatTime(startAt)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Georgia, serif; background: #f4f0e8; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #0f0f0f; border-radius: 4px; }
    .header { padding: 32px 40px 20px; text-align: center; border-bottom: 2px solid #C9A84C; }
    .logo { font-size: 22px; color: #fff; }
    .logo span { color: #C9A84C; }
    .body { padding: 36px 40px; }
    h2 { color: #fff; font-size: 20px; margin: 0 0 16px; }
    p { color: #999; font-size: 15px; line-height: 1.8; }
    .highlight { background: rgba(201,168,76,0.08); border: 1px solid #C9A84C; padding: 20px 24px; margin: 24px 0; }
    .highlight strong { color: #C9A84C; font-size: 18px; }
    .cta { display: block; text-align: center; background: #C9A84C; color: #000; text-decoration: none;
           padding: 14px 28px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><div class="logo">Royal<span>Cut</span></div></div>
    <div class="body">
      <h2>⏰ Lembrete — Amanhã tens marcação!</h2>
      <p>Olá ${clientName}, este é o teu lembrete para a marcação de amanhã:</p>
      <div class="highlight">
        <strong>${serviceName}</strong> com ${barberName}<br>
        <span style="color:#E8E0D0">${date} às ${time}</span>
      </div>
      <p>📍 Rua de Santa Catarina, 120, Porto</p>
      <p>Precisas de cancelar? Faz-o com pelo menos 2 horas de antecedência:</p>
      <a href="${process.env.FRONTEND_URL}/cancel?bookingId=${bookingId}" class="cta">Gerir Marcação</a>
    </div>
  </div>
</body>
</html>`
}

// ─── FUNÇÕES PÚBLICAS ────────────────────────────────────────────

/**
 * Envia confirmação de reserva (email + SMS)
 */
export async function sendBookingConfirmation(booking) {
  const errors = []

  // EMAIL
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: booking.clientEmail,
      subject: `✓ Reserva Confirmada — ${booking.service.name} | Royal Cut`,
      html: confirmationEmailHtml({
        clientName: booking.clientName,
        serviceName: booking.service.name,
        barberName: booking.barber.name,
        startAt: booking.startAt,
        price: booking.amountPaid ?? booking.service.price,
        bookingId: booking.id,
      }),
    })

    await prisma.reminder.create({
      data: { bookingId: booking.id, type: 'EMAIL', sentAt: new Date() },
    })
    console.log(`📧 Email de confirmação enviado para ${booking.clientEmail}`)
  } catch (err) {
    errors.push(`Email: ${err.message}`)
    await prisma.reminder.create({
      data: { bookingId: booking.id, type: 'EMAIL', error: err.message },
    })
  }

  // SMS
  if (twilioClient && booking.clientPhone) {
    try {
      const time = formatTime(booking.startAt)
      const date = new Date(booking.startAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })

      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: booking.clientPhone,
        body: `✂️ Royal Cut: Reserva confirmada!\n${booking.service.name} com ${booking.barber.name}\n📅 ${date} às ${time}\n📍 Rua Santa Catarina, 120, Porto`,
      })
      console.log(`📱 SMS de confirmação enviado para ${booking.clientPhone}`)
    } catch (err) {
      errors.push(`SMS: ${err.message}`)
    }
  }

  return errors.length === 0 ? { success: true } : { success: false, errors }
}

/**
 * Envia lembrete 24h antes da reserva
 */
export async function sendBookingReminder(booking) {
  const errors = []

  // EMAIL
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: booking.clientEmail,
      subject: `⏰ Lembrete — Amanhã às ${formatTime(booking.startAt)} | Royal Cut`,
      html: reminderEmailHtml({
        clientName: booking.clientName,
        serviceName: booking.service.name,
        barberName: booking.barber.name,
        startAt: booking.startAt,
        bookingId: booking.id,
      }),
    })

    await prisma.reminder.create({
      data: { bookingId: booking.id, type: 'EMAIL', sentAt: new Date() },
    })
    console.log(`📧 Lembrete email enviado para ${booking.clientEmail}`)
  } catch (err) {
    errors.push(err.message)
    await prisma.reminder.create({
      data: { bookingId: booking.id, type: 'EMAIL', error: err.message },
    })
  }

  // SMS
  if (twilioClient && booking.clientPhone) {
    try {
      const time = formatTime(booking.startAt)
      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: booking.clientPhone,
        body: `⏰ Royal Cut: Lembrete!\nAmanhã tens ${booking.service.name} com ${booking.barber.name} às ${time}.\n📍 Rua Santa Catarina, 120, Porto\nCancelar: ${process.env.FRONTEND_URL}/cancel?bookingId=${booking.id}`,
      })

      await prisma.reminder.create({
        data: { bookingId: booking.id, type: 'SMS', sentAt: new Date() },
      })
      console.log(`📱 Lembrete SMS enviado para ${booking.clientPhone}`)
    } catch (err) {
      errors.push(err.message)
      await prisma.reminder.create({
        data: { bookingId: booking.id, type: 'SMS', error: err.message },
      })
    }
  }

  return { success: errors.length === 0, errors }
}
