#!/bin/bash
# setup-postgres.sh — instala e configura PostgreSQL no Ubuntu/Debian

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Royal Cut — Setup PostgreSQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Instalar PostgreSQL se necessário
if ! command -v psql &> /dev/null; then
  echo "A instalar PostgreSQL..."
  sudo apt-get update -qq
  sudo apt-get install -y postgresql postgresql-contrib
fi
echo "✅ PostgreSQL instalado"

# 2. Iniciar serviço
sudo systemctl start postgresql
sudo systemctl enable postgresql
echo "✅ Serviço iniciado"

# 3. Criar user + database
sudo -u postgres psql -c "CREATE USER royalcut WITH PASSWORD 'royalcut123';" 2>/dev/null || echo "  (user já existe)"
sudo -u postgres psql -c "CREATE DATABASE royalcut OWNER royalcut;" 2>/dev/null || echo "  (database já existe)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE royalcut TO royalcut;" 2>/dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PostgreSQL pronto!"
echo ""
echo "Adiciona ao teu .env:"
echo 'DATABASE_URL="postgresql://royalcut:royalcut123@localhost:5432/royalcut?schema=public"'
echo ""
echo "Depois corre:"
echo "  npm run db:push && npm run db:seed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
