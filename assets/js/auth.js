const loginForm = document.querySelector("#loginForm");
const usuarioInput = document.querySelector("#usuario");
const contrasenaInput = document.querySelector("#contrasena");
const loginMessage = document.querySelector("#loginMessage");

const userPattern = /^[0-9]{5,10}$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
const systemUsers = [
  {
    name: "USUARIO DESARROLLADOR",
    user: "1110591592",
    password: "Amc2026*",
  },
];

function showLoginMessage(message) {
  loginMessage.textContent = message;
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const usuario = usuarioInput.value.trim();
  const contrasena = contrasenaInput.value;

  if (!userPattern.test(usuario)) {
    showLoginMessage("El usuario debe tener solo numeros, minimo 5 y maximo 10.");
    usuarioInput.focus();
    return;
  }

  if (!passwordPattern.test(contrasena)) {
    showLoginMessage("La contrasena debe tener minimo 6 caracteres, mayuscula, minuscula, numero y simbolo.");
    contrasenaInput.focus();
    return;
  }

  const activeUser = systemUsers.find((registeredUser) => {
    return registeredUser.user === usuario && registeredUser.password === contrasena;
  });

  if (!activeUser) {
    showLoginMessage("Usuario o contrasena incorrectos.");
    contrasenaInput.focus();
    return;
  }

  sessionStorage.setItem("mptUser", activeUser.user);
  sessionStorage.setItem("mptUserName", activeUser.name);
  window.location.href = "pages/principal.html";
});

usuarioInput.addEventListener("input", () => {
  usuarioInput.value = usuarioInput.value.replace(/\D/g, "").slice(0, 10);
  showLoginMessage("");
});

contrasenaInput.addEventListener("input", () => showLoginMessage(""));
