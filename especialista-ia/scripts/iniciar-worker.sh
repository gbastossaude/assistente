#!/usr/bin/env sh
# Inicia o worker local (Linux/macOS), reiniciando automaticamente em caso de falha.
cd "$(dirname "$0")/.." || exit 1
while true; do
  npm run worker
  echo "O worker parou (código $?). Reiniciando em 15 s... (Ctrl+C para sair)"
  sleep 15
done
