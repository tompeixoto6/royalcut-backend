// src/routes/services.js
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const serviceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  duration: z.number().int().positive(),
  active: z.boolean().optional(),
})

export default async function serviceRoutes(app) {

  // GET /api/services — lista pública de serviços ativos
  app.get('/', async (request, reply) => {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
    return reply.send(services)
  })

  // GET /api/services/:id
  app.get('/:id', async (request, reply) => {
    const service = await prisma.service.findUnique({
      where: { id: request.params.id },
    })
    if (!service) return reply.code(404).send({ error: 'Serviço não encontrado.' })
    return reply.send(service)
  })

  // POST /api/services — criar (admin only)
  app.post('/', { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const parsed = serviceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const service = await prisma.service.create({ data: parsed.data })
    return reply.code(201).send(service)
  })

  // PUT /api/services/:id — atualizar (admin only)
  app.put('/:id', { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const parsed = serviceSchema.partial().safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const service = await prisma.service.update({
      where: { id: request.params.id },
      data: parsed.data,
    })
    return reply.send(service)
  })

  // DELETE /api/services/:id — desativar (admin only)
  app.delete('/:id', { onRequest: [app.requireAdmin] }, async (request, reply) => {
    await prisma.service.update({
      where: { id: request.params.id },
      data: { active: false },
    })
    return reply.send({ message: 'Serviço desativado.' })
  })
}
