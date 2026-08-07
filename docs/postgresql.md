# PostgreSQL y cuentas multiempresa

Cuando el backend está activo, la creación de usuarios se realiza mediante la
API y se guarda en PostgreSQL. Si el proyecto se abre directamente desde el
archivo HTML, la aplicación conserva las cuentas en el almacenamiento local
del navegador para que el modo sin servidor siga funcionando.

## Modelo de acceso

- `parqueaderos` es el tenant: cada cliente final tiene un registro propio.
- `usuarios` almacena sus usuarios con documento único, correo, rol, estado y
  hash bcrypt de la contraseña; nunca se guarda la contraseña en texto plano.
- El `SUPERADMIN` crea un parqueadero y su primer `ADMIN` desde Gestión de
  usuarios. Ese administrador solo puede administrar cuentas de su propio
  parqueadero.
- El inicio de sesión emite JWTs revocables y registra sus sesiones en
  `sesiones_jwt`.

## Protecciones incluidas

- Contraseñas con bcrypt (12 rondas configurables).
- JWT con vencimiento y revocación al cerrar sesión, desactivar una cuenta o
  restablecer el acceso principal.
- Validación de entradas, roles y documentos únicos.
- Rate limiting para la API y un límite más estricto para autenticación.
- Cabeceras HTTP seguras con Helmet y lista de orígenes CORS configurable.
- Aislamiento multiempresa con PostgreSQL Row Level Security (RLS), contexto de
  tenant por transacción y consultas que incluyen `parqueadero_id`.

## Despliegue en un host

El backend publica el frontend y la API desde el mismo dominio. Por eso el
navegador usa la ruta relativa `/api`, sin depender de `localhost`.

En un servicio de PostgreSQL administrado use `DATABASE_URL` y `DB_SSL=true`.
Solo defina `CORS_ORIGIN` cuando el frontend se publique en un dominio distinto.
Despues de desplegar, abra `/api/health/db`: debe responder
`{"status":"ok","database":"connected"}` antes de probar el inicio de sesion.

## Puesta en marcha

1. Instale PostgreSQL 15+ y Node.js 18+.
2. Copie `backend/.env.example` como `backend/.env` y defina las credenciales
   de PostgreSQL, un `JWT_SECRET` aleatorio y `SEED_ADMIN_PASSWORD`.
3. Desde `backend`, ejecute `npm install`, `npm run migrate` y `npm run seed`.
4. Inicie la API con `npm start`.

El seed es idempotente: crea el parqueadero principal si falta o restablece el
usuario principal si ya existe en ese mismo parqueadero. Por seguridad no toma
control de un documento que pertenezca a otro cliente.

El archivo `backend/.env` está excluido de Git y contiene la clave local de
restablecimiento. No debe subirse ni compartirse.
