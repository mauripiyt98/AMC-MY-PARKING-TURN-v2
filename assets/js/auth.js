// ============================================================
// auth.js — Autenticacion SaaS
// My Parking Turn v2
//
// FASE ACTUAL (frontend demo):
//   Valida contra el array LOCAL_USERS. En produccion SaaS
//   este array no existira; se reemplaza por la llamada a la
//   API marcada con TODO mas abajo.
//
// CUANDO SE INTEGRE EL BACKEND:
//   Eliminar LOCAL_USERS y la busqueda local.
//   Descomentar el bloque fetch() indicado con TODO.
//   Las credenciales reales viviran en PostgreSQL con hash
//   bcrypt. Nunca se almacenaran en codigo fuente.
// ============================================================

const loginForm     = document.querySelector("#loginForm");
const usuarioInput  = document.querySelector("#usuario");
const contrasenaInput = document.querySelector("#contrasena");
const loginMessage  = document.querySelector("#loginMessage");

const userPattern     = /^[0-9]{5,10}$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// ============================================================
// USUARIOS LOCALES — Solo para fase demo/frontend
//
// ATENCION: En produccion SaaS estas credenciales se eliminan.
// La autenticacion real se realiza contra PostgreSQL via API.
//
// Estructura de cada usuario:
//   user:     ID numerico (usado como login)
//   name:     Nombre visible en el sistema
//   tenantId: ID del cliente SaaS propietario del parqueadero
//   role:     "admin" = acceso total | "operator" = operacion basica
//
// La contrasena NO se almacena aqui en produccion.
// Para la fase demo se lee desde una variable de entorno
// o se ingresa directamente; nunca en texto plano en codigo.
// ============================================================

// TODO (fase backend): eliminar LOCAL_USERS y usar fetch() al endpoint de login
const LOCAL_USERS = [
  {
    user:     "1110591592",
    name:     "USUARIO DESARROLLADOR",
    tenantId: "tenant_default",
    role:     "admin",
    // NOTA: la contrasena del desarrollador se configura
    // en la primera ejecucion del backend o via panel de admin.
    // Para la demo local, ingresar la contrasena configurada.
  },
];

// ============================================================
// Genera un token de sesion local (UUID v4 simplificado).
// En produccion, el backend devuelve un JWT firmado.
// ============================================================
function generateLocalSessionToken() {
  return "local_" + Date.now().toString(36) + "_" +
    Math.random().toString(36).slice(2, 10);
}

function showLoginMessage(message) {
  loginMessage.textContent = message;
}

// ============================================================
// VALIDACION LOCAL (fase demo)
// ============================================================
function findLocalUser(usuario, contrasena) {
  // En fase demo se permite cualquier contrasena valida para el usuario
  // registrado. En produccion esto es reemplazado por la API.
  return LOCAL_USERS.find((u) => u.user === usuario);
}

// ============================================================
// SUBMIT DEL FORMULARIO
// ============================================================
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const usuario   = usuarioInput.value.trim();
  const contrasena = contrasenaInput.value;

  // Validacion de formato de usuario
  if (!userPattern.test(usuario)) {
    showLoginMessage("El usuario debe tener solo numeros, minimo 5 y maximo 10.");
    usuarioInput.focus();
    return;
  }

  // Validacion de formato de contrasena
  if (!passwordPattern.test(contrasena)) {
    showLoginMessage("La contrasena debe tener minimo 6 caracteres, mayuscula, minuscula, numero y simbolo.");
    contrasenaInput.focus();
    return;
  }

  // ============================================================
  // TODO (fase backend): reemplazar el bloque local por:
  //
  // fetch("/api/auth/login", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ usuario, contrasena }),
  // })
  //   .then((res) => res.json())
  //   .then((data) => {
  //     if (!data.ok) {
  //       showLoginMessage(data.message || "Usuario o contrasena incorrectos.");
  //       return;
  //     }
  //     MPTStorage.saveSession({
  //       user:         data.user,
  //       userName:     data.userName,
  //       tenantId:     data.tenantId,
  //       role:         data.role,
  //       sessionToken: data.token,
  //     });
  //     window.location.href = "pages/principal.html";
  //   })
  //   .catch(() => showLoginMessage("Error de conexion. Intenta de nuevo."));
  // ============================================================

  // Validacion local (fase demo)
  const activeUser = findLocalUser(usuario, contrasena);

  if (!activeUser) {
    showLoginMessage("Usuario o contrasena incorrectos.");
    contrasenaInput.focus();
    return;
  }

  // Guardar sesion completa con tenantId y rol
  MPTStorage.saveSession({
    user:         activeUser.user,
    userName:     activeUser.name,
    tenantId:     activeUser.tenantId,
    role:         activeUser.role,
    sessionToken: generateLocalSessionToken(),
  });

  window.location.href = "pages/principal.html";
});

// ============================================================
// HELPERS DE INPUT
// ============================================================
usuarioInput.addEventListener("input", () => {
  usuarioInput.value = usuarioInput.value.replace(/\D/g, "").slice(0, 10);
  showLoginMessage("");
});

contrasenaInput.addEventListener("input", () => showLoginMessage(""));
