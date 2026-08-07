'use strict';

/**
 * Construye la configuracion de PostgreSQL para desarrollo y hosting.
 * Los proveedores administrados suelen entregar DATABASE_URL, mientras que
 * una instalacion propia normalmente usa las variables DB_* individuales.
 */
function sslConfig() {
  const mode = String(process.env.DB_SSL || process.env.PGSSLMODE || '').toLowerCase();
  const enabled = ['1', 'true', 'require', 'verify-ca', 'verify-full'].includes(mode)
    || (!mode && process.env.NODE_ENV === 'production');

  if (!enabled) return false;

  return {
    // En servicios administrados se valida con el CA incluido por el host si
    // se proporciona. El valor por defecto mantiene compatibilidad con los
    // certificados de las plataformas PaaS.
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'true',
  };
}

function getDbConfig({ admin = false } = {}) {
  const connectionString = admin
    ? (process.env.DB_SUPER_URL || process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

  const config = connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'mpt_parking',
        user: admin ? (process.env.DB_SUPERUSER || 'postgres') : (process.env.DB_USER || 'mpt_app'),
        password: admin ? (process.env.DB_SUPERPASSWORD || '') : (process.env.DB_PASSWORD || ''),
      };

  return { ...config, ssl: sslConfig() };
}

module.exports = { getDbConfig };
