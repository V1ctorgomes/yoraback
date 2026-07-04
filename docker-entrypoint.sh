#!/bin/sh
set -e

# Recupera migration de e-mail que falhou parcialmente em produção (P3009).
npx prisma migrate resolve --rolled-back "20250704160000_email_marketing_resend" >/dev/null 2>&1 || true

npx prisma migrate deploy
exec node dist/main.js
