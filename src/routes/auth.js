// src/routes/auth.js
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export default async function authRoutes(app) {

  // POST /api/auth/login
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos.', details: parsed.error.flatten() })
    }

    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email },
      include: { barber: true },
    })

    if (!user) {
      return reply.code(401).send({ error: 'Credenciais inválidas.' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Credenciais inválidas.' })
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      barberId: user.barber?.id ?? null,
    })

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        barber: user.barber
          ? { id: user.barber.id, name: user.barber.name, specialty: user.barber.specialty }
          : null,
      },
    })
  })

  // GET /api/auth/me — perfil do utilizador autenticado
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { barber: true },
      omit: { passwordHash: true },
    })

    if (!user) return reply.code(404).send({ error: 'Utilizador não encontrado.' })

    return reply.send(user)
  })

  // PATCH /api/auth/password — alterar password
  app.patch('/password', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }

    const user = await prisma.user.findUnique({ where: { id: request.user.sub } })
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Password atual incorreta.' })

    const hash = await bcrypt.hash(parsed.data.newPassword, 12)
    await prisma.user.update({
      where: { id: request.user.sub },
      data: { passwordHash: hash },
    })

    return reply.send({ message: 'Password alterada com sucesso.' })
  })
}
