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

## Operación persistente y aislamiento de clientes

La migración `007_operacion_multi_tenant.sql` deja PostgreSQL como fuente de
verdad. `localStorage` queda solo como caché visual: no conserva ni comparte
información entre equipos.

Cada parqueadero es un tenant (una fila de `parqueaderos`), no una carpeta del
servidor. Sus datos se separan por `parqueadero_id` en `turnos`,
`mensualidades`, `documentos_generados` (metadatos/llave privada de futuros
PDF) y `auditoria_eventos`. RLS se habilita y fuerza para cada una. El backend
obtiene el tenant únicamente del JWT y lo fija mediante `SET LOCAL`; el
navegador nunca puede elegir ni enviar un tenant ajeno.

Los constraints impiden dos turnos activos o dos mensualidades activas para
una misma placa dentro del tenant. Los consecutivos se generan dentro de una
transacción bloqueada por tenant, por lo que dos equipos no pueden duplicarlos.
Cada apertura del módulo recupera el estado desde `/api/operacion/estado` y
cada alta, salida, cierre o eliminación se persiste en PostgreSQL.

### Respaldos

Programe en el VPS un `pg_dump` diario cifrado fuera del servidor (bucket
privado/MinIO/proveedor externo), con al menos 30 días de retención y pruebas
de restauración periódicas. `GET /api/operacion/respaldo` permite a un ADMIN
descargar únicamente los datos de su tenant como copia operativa; no sustituye
el respaldo completo. Nunca exponga `DATABASE_URL`, `DB_SUPER_URL`, respaldos
SQL ni `JWT_SECRET` al frontend.

## Requisitos obligatorios antes de producción

1. Ejecute las migraciones con el usuario administrador configurado como
   `DB_SUPER_URL`.
2. Ejecute una vez [`production_app_role.sql`](../backend/db/production_app_role.sql)
   con ese administrador, defina una contraseña aleatoria para `mpt_app` y use
   ese usuario sin privilegios administrativos en `DATABASE_URL` o `DB_USER`.
3. Configure `CORS_ORIGIN` con el dominio HTTPS exacto, `DB_SSL=true`,
   `DB_SSL_REJECT_UNAUTHORIZED=true` y un `JWT_SECRET` aleatorio de al menos
   32 caracteres.
4. Ejecute `npm run preflight:production`. Debe aprobar antes de iniciar la
   aplicación; verifica TLS, que el rol no tenga `SUPERUSER`/`BYPASSRLS`, RLS
   forzado y que no pueda alterar ni truncar `auditoria_eventos`.

La migración `008_production_security_hardening.sql` hace la bitácora
append-only a nivel de RLS y trigger: permite `SELECT` e `INSERT` dentro del
tenant, y bloquea `UPDATE` y `DELETE`.

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
