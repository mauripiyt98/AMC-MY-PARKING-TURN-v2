// ============================================================
// session-guard.js — Proteccion de rutas SaaS
// My Parking Turn v2
//
// PROPOSITO:
//   Incluir este script como PRIMER script en cada pagina
//   interna. Si no hay sesion valida, redirige inmediatamente
//   al login antes de que se ejecute cualquier otro codigo.
//
// CUANDO SE INTEGRE EL BACKEND:
//   Reemplazar la verificacion local por una llamada al
//   endpoint de validacion de token:
//   GET /api/auth/verify  { Authorization: Bearer <token> }
//   Si responde 401 → redirigir al login.
// ============================================================

(function guardSession() {
  // Determinar la ruta raiz segun la profundidad del archivo actual
  const depth = (window.location.pathname.match(/\//g) || []).length - 1;
  const rootPath = depth <= 1 ? "./" : "../".repeat(depth - 1);

  /**
   * Redirige al login eliminando la sesion corrupta si existe.
   */
  function redirectToLogin() {
    // Limpiar sesion corrupta o expirada
    [
      "mptUser",
      "mptUserName",
      "mptTenantId",
      "mptRole",
      "mptSessionToken",
    ].forEach((key) => sessionStorage.removeItem(key));

    // Redirigir a la raiz (index.html)
    window.location.replace(rootPath + "index.html");
  }

  const user    = sessionStorage.getItem("mptUser");
  const tenant  = sessionStorage.getItem("mptTenantId");
  const token   = sessionStorage.getItem("mptSessionToken");

  // Si falta cualquiera de los tres valores criticos → no autorizado
  if (!user || !tenant || !token) {
    redirectToLogin();
    return;
  }

  // TODO (fase backend): validar el token contra la API antes de continuar
  // fetch('/api/auth/verify', {
  //   headers: { Authorization: `Bearer ${token}` }
  // }).then(res => {
  //   if (!res.ok) redirectToLogin();
  // }).catch(() => redirectToLogin());

})();
