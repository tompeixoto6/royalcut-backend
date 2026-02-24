// src/routes/webhook.js
// Rota especial para webhooks do Stripe — precisa do body raw (não JSON)

import { handleWebhookEvent } from '../services/stripe.js'

export default async function webhookRoutes(app) {

  // POST /webhook/stripe
  app.post('/stripe', {
    config: { rawBody: true },
    // Desativar o parser JSON padrão para esta rota
    preParsing: async (request, reply, payload) => payload,
  }, async (request, reply) => {
    const signature = request.headers['stripe-signature']

    if (!signature) {
      return reply.code(400).send({ error: 'Stripe-Signature header em falta.' })
    }

    let rawBody = ''
    for await (const chunk of request.raw) {
      rawBody += chunk
    }

    try {
      const result = await handleWebhookEvent(rawBody, signature)
      return reply.send(result)
    } catch (err) {
      console.error('Webhook error:', err.message)
      return reply.code(400).send({ error: err.message })
    }
  })
}
