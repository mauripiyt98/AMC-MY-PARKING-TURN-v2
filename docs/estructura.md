# Estructura inicial

Sistema inicial para MY PARKING TURN.

## Carpetas

- `assets/css`: estilos compartidos.
- `assets/js`: logica del inicio de sesion y pagina principal.
- `assets/img`: logo central del sistema.
- `pages`: pantallas internas de la aplicacion.
- `pages/reportes`: reportes operativos del sistema.
- `docs`: documentacion del proyecto.

## Flujo actual

1. `index.html` abre el inicio de sesion.
2. El usuario debe contener solo numeros, minimo 5 y maximo 10.
3. La contrasena debe tener minimo 6 caracteres, una mayuscula, una minuscula, un numero y un simbolo.
4. El usuario inicial registrado es `USUARIO DESARROLLADOR`, con usuario `1110591592`.
5. Si los datos cumplen las reglas y coinciden con un usuario registrado, se abre `pages/principal.html`.
6. La pagina principal muestra el logo, campo de placa y fecha/hora automatica de ingreso.
7. Cada turno generado queda guardado como turno activo con placa, fecha, hora, usuario creador y boton de salida.
8. Al generar salida, el turno pasa al historial de registros con placa, hora de ingreso, hora de salida y fecha.
9. El turno exige seleccionar tarifa de moto por `$1500` o carro por `$2500`.
10. El cobro inicia con la primera hora al ingresar y suma una hora mas apenas empieza cada siguiente hora.
11. El historial guarda precio por hora y total cobrado.
12. Los registros activos e historicos solo se pueden eliminar ingresando la contrasena del usuario desarrollador.
13. Antes de generar salida, el sistema pide confirmacion con opciones `SI` y `NO`, mostrando el total a cobrar.
14. Una placa no puede tener dos turnos activos al mismo tiempo; despues de generar salida puede registrarse de nuevo.
15. Cada servicio recibe un consecutivo automatico de `TICKET` que se conserva en turnos activos e historial.
16. La tabla de turnos activos permite filtrar por placa para ubicar rapido el vehiculo que va a salir.
17. El boton `REPORTE DE HISTORICOS` abre una pagina independiente con los vehiculos ya cobrados.
18. El reporte historico se divide por mes y permite filtrar un periodo entre dos fechas.
19. El resumen del reporte muestra total de tickets y total cobrado para el periodo seleccionado.
20. Las pantallas internas tienen boton `CERRAR SESION`, que limpia la sesion activa y vuelve al inicio de sesion.
