# Estructura del proyecto — My Parking Turn v2

Sistema SaaS de gestion de turnos y control de parqueadero.
Soporta parqueo por horas, dias y suscripcion mensual.

---

## Carpetas y archivos

```
/
├── index.html                          # Pagina de inicio de sesion (puerta de entrada)
├── LOGOMPT.png                         # Logo del sistema (raiz, copia en assets/img)
│
├── assets/
│   ├── css/
│   │   └── styles.css                  # Estilos compartidos de toda la aplicacion
│   ├── img/
│   │   └── LOGOMPT.png                 # Logo del sistema
│   └── js/
│       ├── storage.js                  # [NUEVO] Capa de abstraccion de datos SaaS
│       ├── session-guard.js            # [NUEVO] Proteccion de rutas (guard de sesion)
│       ├── auth.js                     # Logica de inicio de sesion y gestion de sesion
│       ├── main.js                     # Logica de turnos por horas (pagina principal)
│       ├── mensualidades.js            # Logica del modulo de mensualidades
│       └── reportes.js                 # Logica del reporte de historicos
│
├── pages/
│   ├── principal.html                  # Pantalla principal: turnos activos
│   ├── mensualidades/
│   │   └── mensualidades.html          # Modulo de suscripciones mensuales
│   └── reportes/
│       └── historicos.html             # Reporte de vehiculos cobrados (historico)
│
└── docs/
    └── estructura.md                   # Este archivo
```

---

## Arquitectura SaaS (fase actual: multi-cuenta integrada)

El desarrollador inicia como `SUPERADMIN`. Desde Gestión de usuarios crea un
parqueadero nuevo junto con su administrador inicial. Cada parqueadero es un
tenant independiente; su administrador crea operadores o más administradores
solo dentro de ese tenant. El frontend usa la API JWT cuando el backend está
activo y conserva el modo local únicamente como demostración sin servidor.

### Capa de datos: `storage.js`

Modulo central que abstrae todo el acceso a datos. Hoy usa `localStorage`
namespaceado por `tenantId`. Cuando se integre el backend PostgreSQL,
solo se modifican las funciones internas `_localGet` / `_localSet`
para llamar a la API REST — el resto del codigo no cambia.

```
[storage.js]
  hoy  → localStorage con key: {tenantId}__{nombre_clave}
  luego → fetch('/api/tenant/:tenantId/:key')
```

### Aislamiento multi-tenant

Cada clave de almacenamiento incluye el `tenantId` del cliente activo:
- `tenant_abc123__mptPlateRecords`   — turnos activos del cliente abc123
- `tenant_abc123__mptPlateHistory`   — historial del cliente abc123
- `tenant_xyz789__mptPlateRecords`   — turnos activos del cliente xyz789

Esto garantiza aislamiento completo entre distintos clientes SaaS.

### Sesion enriquecida

Despues del login se guarda en `sessionStorage`:
```json
{
  "mptUser":         "1110591592",
  "mptUserName":     "USUARIO DESARROLLADOR",
  "mptTenantId":     "tenant_default",
  "mptRole":         "admin",
  "mptSessionToken": "local_abc123_xyz"
}
```

### Roles definidos
| Rol        | Permisos                                              |
|------------|-------------------------------------------------------|
| `admin`    | Generar turnos, dar salida, eliminar registros        |
| `operator` | Generar turnos, dar salida (sin eliminar registros)   |

### Proteccion de rutas: `session-guard.js`

Se incluye como **primer script** en cada pagina interna.
Verifica que existan `mptUser`, `mptTenantId` y `mptSessionToken`
en `sessionStorage`. Si falta cualquiera, redirige al login
antes de que se ejecute cualquier otro codigo.

---

## Flujo de usuario

1. `index.html` presenta el formulario de inicio de sesion.
2. El usuario ingresa su numero de usuario (5-10 digitos) y contrasena.
3. `auth.js` valida y guarda la sesion con `tenantId`, `role` y token.
4. Redirige a `pages/principal.html`.
5. `session-guard.js` verifica la sesion al cargar cada pagina interna.
6. Si no hay sesion valida → redirige a `index.html`.
7. `storage.js` provee todos los datos namespaceados por `tenantId`.
8. El logout limpia todos los valores de sesion y redirige al login.

---

## Reglas de negocio

1. El usuario debe tener solo numeros, minimo 5 y maximo 10.
2. La contrasena debe tener minimo 6 caracteres, una mayuscula,
   una minuscula, un numero y un simbolo.
3. La placa se normaliza a mayusculas sin caracteres especiales (max 8).
4. Una placa no puede tener dos turnos activos al mismo tiempo.
5. Tarifa hora por horas: moto $1.500 | carro $2.500.
6. El cobro inicia con la primera hora al ingresar y suma una
   hora mas apenas comienza cada siguiente hora.
7. Cada servicio recibe un consecutivo automatico de TICKET.
8. Las mensualidades tienen consecutivo MEN-{n} independiente.
9. Los registros activos e historicos solo pueden eliminarse por
   usuarios con rol `admin`.
10. Una suscripcion mensual vence exactamente un mes calendario
    despues de la fecha de inicio.
11. Las suscripciones vencidas se mueven automaticamente al
    historico al cargar la pagina o cada 60 segundos.

---

## Integración con backend PostgreSQL

La guía actual de operación, protección y recuperación de cuentas está en
[`postgresql.md`](postgresql.md).

### Puesta en marcha local

1. Instala Node.js 18 o superior y PostgreSQL 15 o superior.
2. Copia `backend/.env.example` como `backend/.env` y reemplaza todas las
   contraseñas y el secreto JWT de ejemplo.
3. Desde `backend`, ejecuta `npm install`, `npm run migrate`, `npm run seed`
   y finalmente `npm start`.
4. Inicia sesión con el usuario seed. Como `SUPERADMIN`, abre Gestión de
   usuarios y crea cada parqueadero mediante un código único y su primer
   administrador.

El servidor no debe exponerse con los valores por defecto del archivo de
ejemplo. Las migraciones deben ejecutarse con el usuario administrador de
PostgreSQL y la aplicación con el usuario `mpt_app`.

### Puntos de integracion marcados en el codigo

El inicio de sesión y la gestión de usuarios/parqueaderos ya consumen la API.
Los módulos de turnos y mensualidades continúan usando el almacenamiento local
namespaceado mientras se desarrolla su API operativa.

### Endpoints previstos

| Metodo | Endpoint                  | Descripcion                       |
|--------|---------------------------|-----------------------------------|
| POST   | `/api/auth/login`         | Autenticacion, devuelve JWT       |
| GET    | `/api/auth/verify`        | Validar token activo              |
| GET    | `/api/records`            | Obtener turnos activos del tenant |
| POST   | `/api/records`            | Crear turno nuevo                 |
| DELETE | `/api/records/:id`        | Eliminar turno (rol admin)        |
| GET    | `/api/history`            | Obtener historial del tenant      |
| DELETE | `/api/history/:id`        | Eliminar del historial (admin)    |
| GET    | `/api/monthly`            | Obtener mensualidades activas     |
| POST   | `/api/monthly`            | Registrar mensualidad nueva       |
| DELETE | `/api/monthly/:id`        | Cerrar o eliminar mensualidad     |

### Seguridad PostgreSQL (Row Level Security)

Cada tabla tendra la columna `tenant_id`. Se activara RLS para
que cada query solo acceda a las filas del tenant autenticado:

```sql
-- Ejemplo de politica RLS
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON turnos
  USING (tenant_id = current_setting('app.tenant_id'));
```

---

## Orden de carga de scripts por pagina

| Pagina            | Scripts en orden                                      |
|-------------------|-------------------------------------------------------|
| `index.html`      | `storage.js` → `auth.js`                             |
| `principal.html`  | `session-guard.js` → `storage.js` → `main.js`        |
| `mensualidades.html` | `session-guard.js` → `storage.js` → `mensualidades.js` |
| `historicos.html` | `session-guard.js` → `storage.js` → `reportes.js`   |
