'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Rutas ────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const usuariosRoutes     = require('./routes/usuarios.routes');
const parqueaderosRoutes = require('./routes/parqueaderos.routes');
const operacionRoutes    = require('./routes/operacion.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (jwtSecret.length < 32 || /^CAMBIAR/i.test(jwtSecret)) {
    throw new Error('Producción requiere un JWT_SECRET aleatorio de al menos 32 caracteres.');
  }
  if (!String(process.env.CORS_ORIGIN || '').trim()) {
    throw new Error('Producción requiere CORS_ORIGIN con el dominio HTTPS público permitido.');
  }
  if (String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'false') {
    throw new Error('Producción no permite DB_SSL_REJECT_UNAUTHORIZED=false. Configure el CA de PostgreSQL.');
  }
}

assertProductionConfiguration();

if (process.env.TRUST_PROXY !== 'false') app.set('trust proxy', 1);

// ── Seguridad HTTP headers ───────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────
const allowedOrigins = [
  ...(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Orígenes comunes en desarrollo (file://, Live Server, etc.)
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
];
const hasConfiguredCorsOrigins = Boolean(process.env.CORS_ORIGIN);

app.use(cors({
  origin(origin, callback) {
    // Sin origin: Postman, curl, extensiones, file://
    if (!origin) return callback(null, true);
    // Modo desarrollo: permitir cualquier origen localhost/127.0.0.1
    if (process.env.NODE_ENV !== 'production') {
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('null') // file:// en algunos navegadores
      ) {
        return callback(null, true);
      }
    }
    if (!hasConfiguredCorsOrigins || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  credentials   : true,
  methods        : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders : ['Content-Type', 'Authorization'],
}));

// ── Body parsing ─────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting global ──────────────────────────────
const globalLimiter = rateLimit({
  windowMs       : Number(process.env.RATE_LIMIT_WINDOW_MS)    || 15 * 60 * 1000,
  max            : Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders  : false,
  message: { error: 'Demasiadas solicitudes. Intente de nuevo más tarde.' },
});
app.use('/api/', globalLimiter);

// ── Rate limiting estricto en autenticación ───────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max     : Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message : { error: 'Demasiados intentos de autenticación. Espere 15 minutos.' },
});
app.use('/api/auth/', authLimiter);

// ── Health check ─────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status   : 'ok',
    timestamp: new Date().toISOString(),
    version  : '2.0.0',
    app      : 'AMC My Parking Turn — Multi-Tenant',
  });
});

// ── Rutas de la aplicación ───────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/usuarios',     usuariosRoutes);
app.use('/api/parqueaderos', parqueaderosRoutes);
app.use('/api/operacion',    operacionRoutes);

app.get('/api/health/db', async (_req, res) => {
  try {
    await testConnection();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('[Health] PostgreSQL no disponible:', err.message);
    res.status(503).json({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
      message: 'No fue posible conectar con PostgreSQL.',
    });
  }
});

// Sirve solamente los archivos publicos: frontend y API comparten origen.
const frontendDir = path.join(__dirname, '..');
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.use('/pages', express.static(path.join(frontendDir, 'pages')));
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
app.get('/LOGOMPT.png', (_req, res) => res.sendFile(path.join(frontendDir, 'LOGOMPT.png')));

// ── Manejo de rutas no encontradas y errores ─────────
app.use(notFound);
app.use(errorHandler);

// ── Iniciar servidor ─────────────────────────────────
const { testConnection } = require('./db/pool');

app.listen(PORT, async () => {
  console.log('\n🅿️  AMC My Parking Turn — Backend Multi-Tenant');
  console.log(`   Entorno : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Puerto  : ${PORT}`);
  console.log(`   API     : http://localhost:${PORT}/api\n`);

  try {
    await testConnection();
  } catch (err) {
    console.warn('[DB] No se pudo conectar a PostgreSQL:', err.message);
    console.warn('[DB] Verifica las variables DB_* en el archivo .env\n');
  }
});

module.exports = app; // Para tests
