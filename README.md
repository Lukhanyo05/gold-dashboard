# Gold Trading Dashboard

A company-grade MERN trading cockpit for XAUUSD.

## Stack
- **Frontend:** React + TypeScript + Vite + MUI (dark gold theme) + Recharts
- **Backend:** Node + Express + TypeScript + Mongoose
- **Database:** MongoDB
- **Cache:** Redis (gold price)
- **Deploy:** Docker Compose locally, Railway + Vercel + Atlas in production

## Features
- Live gold price with 10s refresh
- Trade journal: create / edit / close / delete
- CSV + Excel import/export
- Auto position sizing from balance × risk %
- Balance cascade with tax reserve (SARS)
- Equity curve, win rate, months-to-$1M projection

## Local Development

### Docker (recommended)
```bash
docker compose up