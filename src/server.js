// src/server.js
// Royal Cut — Entry point do servidor Fastify

import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'

import { prisma } from './utils/prisma.js'
import { startReminderJob } from './jobs/reminders.js'

// Routes
import authRoutes from './routes/auth.js'
import bookingRoutes from './routes/bookings.js'
import serviceRoutes from './routes/services.js'
import barberRoutes from './routes/barbers.js'
import adminRoutes from './routes/admin.js'
import webhookRoutes from './routes/webhook.js'

// Fastify v5: não passar `transport: undefined`, causa erro
const loggerConfig = process.env.NODE_ENV === 'development'
  ? {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }
  : true

const app = Fastify({ logger: loggerConfig })

// ─── PLUGINS ─────────────────────────────────────────────────────

await app.register(cors, {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev_secret_muda_em_producao',
  sign: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
})

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

// ─── DECORATORS ──────────────────────────────────────────────────

app.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido ou expirado.' })
  }
})

app.decorate('requireAdmin', async function (request, reply) {
  try {
    await request.jwtVerify()
    if (request.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Acesso restrito a administradores.' })
    }
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido ou expirado.' })
  }
})

// ─── ROTAS ───────────────────────────────────────────────────────

await app.register(webhookRoutes, { prefix: '/webhook' })
await app.register(authRoutes,    { prefix: '/api/auth' })
await app.register(bookingRoutes, { prefix: '/api/bookings' })
await app.register(serviceRoutes, { prefix: '/api/services' })
await app.register(barberRoutes,  { prefix: '/api/barbers' })
await app.register(adminRoutes,   { prefix: '/api/admin' })

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development',
}))

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────

const shutdown = async (signal) => {
  app.log.info(`${signal} recebido. A encerrar...`)
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// ─── START ───────────────────────────────────────────────────────

try {
  const port = Number(process.env.PORT) || 3000
  const host = process.env.HOST || '0.0.0.0'

  await app.listen({ port, host })
  app.log.info(`🚀 Royal Cut API a correr em http://${host}:${port}`)

  startReminderJob()
  app.log.info('⏰ Reminder job iniciado')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
