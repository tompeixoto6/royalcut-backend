# 💈 Royal Cut Barber Shop — Backend API

Backend completo para o sistema de reservas do Royal Cut. Construído com **Fastify**, **PostgreSQL** e **Prisma**.

---

## Stack

| Tecnologia | Uso |
|---|---|
| **Node.js 20+** | Runtime |
| **Fastify 4** | Framework HTTP (rápido, low-overhead) |
| **PostgreSQL** | Base de dados principal |
| **Prisma** | ORM type-safe |
| **Stripe** | Pagamentos online |
| **Nodemailer** | Emails de confirmação e lembrete |
| **Twilio** | SMS automáticos |
| **JWT** | Autenticação barbeiros/admin |
| **node-cron** | Lembretes automáticos |
| **Zod** | Validação de dados |

---

## Estrutura

```
royalcut-backend/
├── prisma/
│   ├── schema.prisma       # Modelos da base de dados
│   └── seed.js             # Dados iniciais (admin, barbeiros, serviços)
├── src/
│   ├── server.js           # Entry point
│   ├── routes/
│   │   ├── auth.js         # Login, me, alterar password
│   │   ├── bookings.js     # Criar reserva, cancelar, listar
│   │   ├── services.js     # CRUD de serviços
│   │   ├── barbers.js      # Lista, slots disponíveis, perfil
│   │   ├── admin.js        # Dashboard, gestão, estatísticas
│   │   └── webhook.js      # Webhook Stripe
│   ├── services/
│   │   ├── stripe.js       # Checkout session + webhook handler
│   │   └── notifications.js # Email + SMS (confirmação + lembrete)
│   ├── jobs/
│   │   └── reminders.js    # Cron job — lembretes 24h antes
│   └── utils/
│       ├── prisma.js       # Singleton Prisma Client
│       └── slots.js        # Geração de horários disponíveis
├── .env.example
└── package.json
```

---

## Setup

### 1. Requisitos

- Node.js 20+
- PostgreSQL 14+ (local ou [Supabase](https://supabase.com) gratuito)

### 2. Instalar

```bash
git clone <repo>
cd royalcut-backend
npm install
```

### 3. Variáveis de Ambiente

```bash
cp .env.example .env
# Edita o .env com as tuas credenciais
```

**Mínimo para começar em desenvolvimento:**
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/royalcut"
JWT_SECRET=qualquer_string_longa_aqui
PORT=3000
FRONTEND_URL=http://localhost:5500
```

### 4. Base de Dados

```bash
# Criar as tabelas
npm run db:push

# Popular com dados iniciais
npm run db:seed

# (Opcional) Ver a BD visualmente
npm run db:studio
```

### 5. Iniciar

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

O servidor arranca em `http://localhost:3000`

---

## API Reference

### Auth

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (email + password) |
| GET | `/api/auth/me` | Perfil do utilizador autenticado |
| PATCH | `/api/auth/password` | Alterar password |

**Login request:**
```json
{ "email": "marcus@royalcut.pt", "password": "marcus123" }
```

**Login response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "...", "email": "...", "role": "BARBER", "barber": { ... } }
}
```

---

### Serviços

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/services` | Lista serviços ativos | Público |
| GET | `/api/services/:id` | Detalhe de serviço | Público |
| POST | `/api/services` | Criar serviço | Admin |
| PUT | `/api/services/:id` | Atualizar serviço | Admin |
| DELETE | `/api/services/:id` | Desativar serviço | Admin |

---

### Barbeiros

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/barbers` | Lista barbeiros ativos | Público |
| GET | `/api/barbers/:id` | Detalhe do barbeiro | Público |
| GET | `/api/barbers/:id/slots` | Horários disponíveis | Público |
| PATCH | `/api/barbers/:id` | Atualizar perfil | Autenticado |

**Slots request:**
```
GET /api/barbers/clxxx/slots?date=2024-12-20&serviceId=clyyy
```

**Slots response:**
```json
{
  "date": "2024-12-20",
  "slots": [
    { "time": "09:00", "startAt": "2024-12-20T09:00:00.000Z", "available": true },
    { "time": "09:30", "startAt": "2024-12-20T09:30:00.000Z", "available": false },
    ...
  ]
}
```

---

### Reservas

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/bookings` | Criar reserva + link de pagamento | Público |
| GET | `/api/bookings/:id` | Detalhe de reserva | Público |
| GET | `/api/bookings/my?email=x` | Reservas por email | Público |
| DELETE | `/api/bookings/:id/cancel` | Cancelar reserva | Público |

**Criar reserva:**
```json
{
  "clientName": "João Silva",
  "clientEmail": "joao@email.com",
  "clientPhone": "+351912345678",
  "barberId": "clxxx",
  "serviceId": "clyyy",
  "startAt": "2024-12-20T10:00:00.000Z",
  "notes": "Prefiro fade médio"
}
```

**Response:**
```json
{
  "booking": { "id": "...", "status": "PENDING", ... },
  "payment": {
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_...",
    "sessionId": "cs_..."
  }
}
```

---

### Admin

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/admin/dashboard` | Métricas resumidas | Admin |
| GET | `/api/admin/bookings` | Todas as reservas (filtrável) | Admin/Barbeiro |
| PATCH | `/api/admin/bookings/:id/status` | Alterar estado | Admin/Barbeiro |
| GET | `/api/admin/barbers/:id/schedule` | Ver horário | Admin/Barbeiro |
| PUT | `/api/admin/barbers/:id/schedule` | Atualizar horário | Admin/Barbeiro |
| GET | `/api/admin/stats/revenue` | Receita por período | Admin |

**Dashboard response:**
```json
{
  "stats": {
    "totalBookings": 342,
    "todayBookings": 8,
    "monthRevenue": "1240.00",
    "pendingBookings": 3,
    "noShows": 12,
    "noShowRate": "4.2%"
  },
  "upcoming": [ ... ]
}
```

**Filtros /admin/bookings:**
```
?status=CONFIRMED&barberId=clxxx&date=2024-12-20&search=João&page=1&limit=20
```

---

## Fluxo de Pagamento (Stripe)

```
Cliente preenche formulário
        ↓
POST /api/bookings
  → Reserva criada (status: PENDING)
  → Sessão Stripe criada
        ↓
Cliente redirigido para checkout.stripe.com
        ↓
Pagamento efetuado
        ↓
Stripe envia webhook POST /webhook/stripe
  → Reserva atualizada (status: CONFIRMED, paymentStatus: PAID)
  → Email de confirmação enviado
  → SMS de confirmação enviado
        ↓
24h antes do appointment
  → Cron job envia lembrete (email + SMS)
```

### Configurar Webhook Stripe

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Fazer forward para localhost (desenvolvimento)
stripe listen --forward-to localhost:3000/webhook/stripe

# Copiar o webhook secret para .env
# STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Cron Job — Lembretes

O job corre automaticamente às **10:00** e **18:00** todos os dias.

Lógica:
- Encontra reservas `CONFIRMED` que ocorrem entre 23h e 25h a partir de agora
- Para cada uma, envia email + SMS se ainda não foi enviado lembrete
- Regista cada lembrete na tabela `reminders`

---

## Deployment

### Railway (recomendado — simples)

```bash
# Instalar Railway CLI
npm i -g @railway/cli

railway login
railway init
railway add postgresql  # adiciona PostgreSQL automático

# Configurar variáveis de ambiente no dashboard Railway
# Fazer deploy
railway up
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t royalcut-api .
docker run -p 3000:3000 --env-file .env royalcut-api
```

---

## Contas de Teste

Após `npm run db:seed`:

| Conta | Email | Password | Role |
|---|---|---|---|
| Admin | admin@royalcut.pt | (do .env) | Admin total |
| Marcus | marcus@royalcut.pt | marcus123 | Barbeiro |
| Diogo | diogo@royalcut.pt | diogo123 | Barbeiro |
| André | andre@royalcut.pt | andre123 | Barbeiro |

**Cartão de teste Stripe:** `4242 4242 4242 4242` · qualquer data futura · qualquer CVC

---

## Integrar com o Frontend

No HTML do Royal Cut, substitui o mock do formulário:

```javascript
// 1. Buscar barbeiros
const { data: barbers } = await fetch('/api/barbers').then(r => r.json())

// 2. Buscar slots disponíveis
const slots = await fetch(
  `/api/barbers/${barberId}/slots?date=2024-12-20&serviceId=${serviceId}`
).then(r => r.json())

// 3. Criar reserva
const { booking, payment } = await fetch('/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientName, clientEmail, clientPhone,
    barberId, serviceId, startAt: slot.startAt
  })
}).then(r => r.json())

// 4. Redirigir para pagamento
window.location.href = payment.checkoutUrl
```
