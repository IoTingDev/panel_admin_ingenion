# Contrato de API del panel de administración de IoTing Dev

Documento para el equipo del backend. Describe lo que el panel **ya hace hoy contra una capa
simulada** (`src/lib/api/mock`, guardada en `localStorage`) y lo que cualquier backend real debe
cumplir para reemplazarla **sin tocar la interfaz**.

- **Fuente de verdad de los tipos:** [`src/lib/api/types.ts`](../src/lib/api/types.ts). Este
  documento la explica; si discrepan, manda el código y este documento se corrige.
- **Fuente de verdad del comportamiento:** las pruebas de `src/test/*.test.ts` (unitarias,
  contra el mock) y `tests/e2e/*.spec.ts` (de extremo a extremo). Un backend nuevo debe pasar el
  mismo conjunto de reglas.
- **Idioma:** español, como el resto de la serie documental. **Moneda:** COP, entero. **Zona
  horaria del negocio:** `America/Bogota`.

---

## 0. Cómo se conecta (y qué NO está hecho)

La interfaz solo habla con `api` (`src/lib/api/index.ts`), que implementa `Api` de `types.ts`.
Ningún componente toca `localStorage`.

| Variable            | Valores                      | Estado                                                                                                                                                      |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_MODE`     | `mock` (por defecto) o `api` | `api` **no tiene implementación**: hoy escribe una advertencia en consola y usa el mock. Es el **único punto de cambio**: ahí se enchufará el cliente HTTP. |
| `VITE_API_BASE_URL` | URL base del backend         | Declarada y mostrada en Configuración; sin uso todavía.                                                                                                     |

**Alcance de este documento:** contrato y reglas. **No** implementa el modo `api`.

---

## 1. Decisiones pendientes y huecos declarados

Lo que sigue **no tiene fundamento en los documentos del monorepo** o requiere decisión de Juan.
No se rellena con suposiciones.

1. **Excepción a la política de construcción selectiva (ADR-0004).** Verificado contra el
   monorepo `Dev-Ingenion/iotingdev-platform`:
   - `docs/adr/0004-politica-de-construccion-selectiva.md` tiene estado **«Propuesto»** (no
     «Aceptado»).
   - `docs/001-Business-Architecture.md` §4.6 clasifica **CB-09 Gestión de proyectos** como
     **Comprar** («herramienta de gestión de trabajo estándar») y **CB-17 Abastecimiento y cadena
     de suministro** como **Comprar** («inventario y compras son commodity»).
   - Este panel **construye** inventario, valoración, proyectos y trabajos técnicos. Es una
     **excepción acotada** a esa clasificación. La regla de excepción del ADR-0004 exige un ADR
     con comparación de costo total de propiedad a cinco años: **ese ADR no existe todavía**.
   - **DECISIÓN PENDIENTE (Juan):** (a) registrar la excepción como ADR nuevo con su comparación de
     TCO y mantener el panel como herramienta interna acotada, o (b) reemplazarlo por una
     herramienta comprada e integrar. Mientras no se decida, el panel es **herramienta interna del
     dueño, no un dominio de la plataforma** y no debe crecer más allá de este contrato.
2. **Autenticación del personal.** El encargo habla de «el pool de Cognito de staff». **No hay
   ningún documento en el monorepo que defina un pool de staff.** Lo que sí está documentado
   (ADR-0030 §4.5quater) es el pool de plataforma `us-east-1_nJCWtej6i` con _app clients_
   separados por tipo de principal. **DECISIÓN PENDIENTE:** pool propio de staff o un _app
   client_ nuevo en el existente; y cómo se mapea el rol `Administrador` del panel.
3. **Alegra.** Se cita en el encargo como sistema contable y de facturación. **No aparece
   nombrado en `docs/` ni en `docs/adr/`**; la clasificación CB-16 (contabilidad y facturación se
   compran) es la que lo respalda. La integración (§9) es una **propuesta**, no un hecho.
4. **Sensibilidad de los datos (ADR-0015, S0–S3).** Clientes, usuarios (correo, teléfono) y
   direcciones de sitios de clientes son datos de personas. **No se ha asignado nivel de
   sensibilidad** a cada campo: pendiente de Juan.
5. **Costo de la salida de inventario.** El panel guarda el costo vigente al registrar la salida
   (`costoAlSalir`). Si Alegra llevara el costo contable del inventario, esa cifra podría
   divergir: ver §9.

---

## 2. Entidades

Convenciones: `id` es un UUID v4 generado por el servidor; fechas con hora en ISO 8601 UTC;
**fechas de calendario** (`fechaProgramada`, `fechaInicio`, `fechaFin` de trabajos) como
`AAAA-MM-DD` y se interpretan como ese día en `America/Bogota`. «Opc.» = opcional.

### 2.1 Operador (sesión)

| Campo    | Tipo              | Notas                                                             |
| -------- | ----------------- | ----------------------------------------------------------------- |
| `id`     | string            |                                                                   |
| `nombre` | string            | Sale de la sesión; el panel deriva avatar y nombre corto de aquí. |
| `email`  | string            |                                                                   |
| `rol`    | `"Administrador"` | Único rol hoy.                                                    |

### 2.2 Cliente

| Campo                                                 | Tipo                               | Oblig. | Notas                                            |
| ----------------------------------------------------- | ---------------------------------- | ------ | ------------------------------------------------ |
| `id`                                                  | string                             | sí     |                                                  |
| `razonSocial`                                         | string                             | sí     | mínimo 3 caracteres (validación del formulario). |
| `nit`                                                 | string                             | opc.   |                                                  |
| `sector`                                              | string                             | sí     | **Debe estar en `Configuracion.sectores`.**      |
| `tipoCliente`                                         | `persona` \| `empresa`             | opc.   |                                                  |
| `direccion`, `ciudad`                                 | string                             | opc.   |                                                  |
| `contactoNombre`, `contactoEmail`, `contactoTelefono` | string                             | opc.   | Correo con formato válido.                       |
| `estado`                                              | `activo` \| `suspendido` \| `baja` | sí     |                                                  |
| `creadoEn`                                            | ISO                                | sí     |                                                  |
| `notas`                                               | string                             | opc.   |                                                  |
| `esDemo`                                              | boolean                            | opc.   | Marca de dato de demostración (§5.7).            |

### 2.3 UsuarioCliente (usuarios del portal del cliente)

`id`, `clienteId`, `nombre`, `email`, `rol` (`administrador` \| `operador` \| `lectura`), `estado`
(`activo` \| `suspendido` \| `baja`), `ultimoAcceso` (opc.), `creadoEn`, `esDemo` (opc.). **Sin
cambios de modelo** en la v2: solo se amplía la cascada (§5.4).

### 2.4 Proyecto

| Campo                        | Tipo                                                               | Notas                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `clienteId`, `nombre`  | string                                                             | `nombre` obligatorio.                                                                                                                             |
| `descripcion`, `responsable` | string, opc.                                                       |                                                                                                                                                   |
| `estado`                     | `en_desarrollo` \| `activo` \| `pausado` \| `finalizado` \| `baja` | Rótulos de la UI: En desarrollo, **En operación** (`activo`), Pausado, Finalizado, Baja. `borrador` **ya no existe**: se migra a `en_desarrollo`. |
| `fechaInicio`, `fechaFin`    | ISO, opc.                                                          | **Fecha real indicada por la persona**: por defecto hoy, **se permite el pasado**. `fechaFin ≥ fechaInicio`.                                      |
| `registradoEn`               | ISO                                                                | Momento técnico del registro, **aparte** de `fechaInicio`.                                                                                        |
| `etiquetas`                  | string[], opc.                                                     |                                                                                                                                                   |
| `esDemo`                     | boolean, opc.                                                      |                                                                                                                                                   |

### 2.5 TrabajoTecnico

| Campo                                                             | Tipo                                                                           | Notas                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `id`                                                              | string                                                                         |                                                                        |
| `codigo`                                                          | string                                                                         | **`TT-0001`, consecutivo, jamás reutilizado** (el contador solo sube). |
| `clienteId`                                                       | string                                                                         | El cliente debe existir y estar `activo` al crear.                     |
| `tipo`                                                            | `cctv` \| `alarmas` \| `telecom` \| `mantenimiento` \| `instalacion` \| `otro` |                                                                        |
| `titulo`                                                          | string                                                                         | Obligatorio.                                                           |
| `descripcion`, `sitioDireccion`, `ciudad`, `responsable`, `notas` | string, opc.                                                                   |                                                                        |
| `estado`                                                          | `programado` \| `en_curso` \| `completado` \| `cancelado`                      |                                                                        |
| `fechaProgramada`, `fechaInicio`, `fechaFin`                      | `AAAA-MM-DD`, opc.                                                             | Fechas reales, pasado permitido; `fechaFin ≥ fechaInicio`.             |
| `valorPactado`                                                    | entero COP ≥ 0, opc.                                                           | **Informativo**: la facturación vive en Alegra.                        |
| `motivoCancelacion`                                               | string, opc.                                                                   | Obligatorio al cancelar.                                               |
| `bajaPorCliente`                                                  | boolean, opc.                                                                  | `true` si se canceló en cascada por la baja de su cliente.             |
| `registradoEn`                                                    | ISO                                                                            |                                                                        |
| `esDemo`                                                          | boolean, opc.                                                                  |                                                                        |

### 2.6 ItemInventario

| Campo                                                                             | Tipo                                                              | Notas                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sku`                                                                             | string                                                            | Clave. `PPP-NNN` (prefijo de 3 letras de la categoría + consecutivo). **Nunca se reutiliza.** |
| `grupo`                                                                           | `componentes` \| `herramientas` \| `equipos` \| `seguridad`       | **Explícito.** El prefijo del SKU solo numera. Rótulo de `seguridad`: «Seguridad y Telecom».  |
| `categoria`                                                                       | string                                                            | Debe pertenecer al `grupo` según `Configuracion.inventario.categorias`.                       |
| `subcategoria`, `descripcion`, `marca_referencia`, `unidad`, `ubicacion`, `notas` | string                                                            |                                                                                               |
| `cantidad_inicial`                                                                | entero ≥ 0                                                        | Parte de la fórmula de stock.                                                                 |
| `estado`                                                                          | `Disponible` \| `En uso` \| `En reparación` \| `Dañado` \| `Baja` | `Baja` solo por la operación `darDeBaja` (con motivo).                                        |
| `stock_minimo`                                                                    | entero ≥ 0 \| null                                                |                                                                                               |
| `anioCompra`                                                                      | entero 1990..año actual \| null                                   |                                                                                               |
| `valorUnitario`                                                                   | entero COP ≥ 0 \| null                                            | Costo vigente por unidad; null = «Sin valor».                                                 |
| `costoInicial`                                                                    | entero COP ≥ 0 \| null                                            | Costo declarado para la `cantidad_inicial`; base de «invertido».                              |
| `vidaUtilAnios`                                                                   | número > 0 \| null                                                | Si falta, se usa la del grupo.                                                                |
| `proveedor`                                                                       | string, opc.                                                      |                                                                                               |

**No existe un campo `stock`**: es derivado (§6).

### 2.7 MovimientoInventario

| Campo                      | Tipo                            | Notas                                                                                                                   |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`, `sku`                | string                          |                                                                                                                         |
| `tipo`                     | `Entrada` \| `Salida`           |                                                                                                                         |
| `cantidad`                 | entero > 0                      |                                                                                                                         |
| `fecha`                    | ISO                             | **Editable, pasado permitido, futuro no.** Por defecto, ahora.                                                          |
| `nota`                     | string, opc.                    |                                                                                                                         |
| `costoUnitario`            | entero COP ≥ 0, opc.            | **Solo entradas** (compras).                                                                                            |
| `destinoTipo`, `destinoId` | `proyecto`/`trabajo` + id, opc. | **Solo salidas.** El destino debe existir. Un trabajo `cancelado` no admite material.                                   |
| `costoAlSalir`             | entero COP \| null              | **Instantánea** del `valorUnitario` al registrar una salida; null = sin valor.                                          |
| `proyecto`                 | string, opc.                    | Rótulo de texto (nombre del proyecto o `TT-NNNN · título`). Conserva el historial legible aunque el destino se elimine. |
| `esDemo`                   | boolean, opc.                   |                                                                                                                         |

### 2.8 Configuracion

- `inventario.categorias`: `Record<grupo, string[]>`.
- `inventario.prefijos`: `Record<categoria, "ABC">` — tres letras mayúsculas; **varias categorías pueden compartir prefijo**.
- `inventario.depreciacion.aniosPorGrupo`: `Record<grupo, number | null>` (null = no se deprecia).
  Por defecto: componentes y seguridad `null`, herramientas 5, equipos 5.
- `inventario.depreciacion.residualPct`: 0..100 (por defecto 10).
- `sectores`: `string[]` (por defecto: cacao, café, mango, residencial, comercial, industrial,
  institucional, otro).

### 2.9 Auditoria

`id`, `fecha` (ISO), `actor` (nombre del operador), `accion` (`entidad.verbo`), `entidad`,
`entidadId`, `detalle` (texto con el antes → después y el motivo cuando aplica).

### 2.10 Respaldo (solo modo mock)

`{ formato: "ioting-panel-respaldo", version: number, exportadoEn: ISO, datos: <base completa> }`.
En modo `api` el respaldo es responsabilidad del backend y estas operaciones no aplican.

---

## 3. Operaciones por interfaz (`types.ts`)

Todas son asíncronas. «Audita» = escribe un evento (§7). Los errores se describen en §8.

### 3.1 `AuthApi`

| Operación                             | Comportamiento                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `login(email, password)`              | Devuelve `Operador`. Mock: acepta cualquier contraseña de 4+ caracteres. **Se sustituye por Cognito** (§9). |
| `logout()`, `currentUser()`, `role()` | Sesión actual.                                                                                              |

### 3.2 `ClientesApi`

| Operación                           | Reglas                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list()`, `get(id)`                 |                                                                                                                                                                    |
| `create(data)`                      | `sector` ∈ `Configuracion.sectores`. Estado inicial `activo`. Audita `cliente.crear`.                                                                              |
| `update(id, data)`                  | Si cambia `sector`, debe estar en la lista. Audita `cliente.editar`.                                                                                               |
| `impactoBaja(id)`                   | `{usuarios, proyectos, trabajos}`: lo que **se afectaría** (usuarios no en baja; proyectos que no estén en baja ni finalizados; trabajos `programado`/`en_curso`). |
| `cambiarEstado(id, estado, motivo)` | **Baja → cascada** (§5.4). Reactivar **no** reactiva hijos. Audita `cliente.baja` / `cliente.suspender` / `cliente.reactivar` y un evento por hijo afectado.       |
| `hijosReactivables(id)`             | `{usuarios, proyectos, trabajos}` que siguen en baja (trabajos: `cancelado` con `bajaPorCliente`).                                                                 |

### 3.3 `UsuariosApi`

`list`, `invitar(data)` (rechaza correo duplicado activo y clientes no activos), `cambiarRol`,
`cambiarEstado(id, estado, motivo)` (**no reactiva** si su cliente está en baja o suspendido).

### 3.4 `ProyectosApi`

| Operación                            | Reglas                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `create(data)`                       | Cliente existente y `activo`; nombre obligatorio; `fechaFin ≥ fechaInicio`. Fija `registradoEn`.                                    |
| `update(id, data)`                   | Mismas validaciones sobre el resultado fusionado.                                                                                   |
| `cambiarEstado(id, estado, motivo?)` | Reactivar desde `baja` no se permite si el cliente está en baja/suspendido.                                                         |
| `eliminar(id, motivo)`               | Definitiva; **motivo obligatorio**; audita `proyecto.eliminar`; los movimientos hacia el proyecto **se conservan** (con su rótulo). |

### 3.5 `TrabajosApi`

| Operación                            | Reglas                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(data)`                       | Validaciones de §2.5. Asigna `codigo` consecutivo. Estado por defecto `programado`; si nace `en_curso`/`completado` completa `fechaInicio`/`fechaFin` con hoy.                                            |
| `update(id, data)`                   | Validaciones sobre el resultado fusionado.                                                                                                                                                                |
| `cambiarEstado(id, estado, motivo?)` | **Cancelar exige motivo.** `en_curso` completa `fechaInicio` si falta; `completado` completa `fechaFin`. Reactivar un `cancelado` exige cliente `activo` y limpia `motivoCancelacion` y `bajaPorCliente`. |
| `eliminar(id, motivo)`               | Definitiva; motivo obligatorio; el código **no se reutiliza**.                                                                                                                                            |

### 3.6 `InventarioApi`

| Operación                          | Reglas                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listItems()`, `listMovimientos()` | Devuelve todo, incluidos ítems en `Baja` (la UI los oculta salvo al filtrar por Baja).                                                                                                                                         |
| `createItem(data)`                 | `grupo` y `categoria` coherentes con la configuración. Reserva el SKU del contador por prefijo (**nunca decrece**). Fija `costoInicial = valorUnitario`.                                                                       |
| `updateItem(sku, data)`            | Valida campos (§5.1). **No admite `estado: "Baja"`** (usar `darDeBaja`). No deja `cantidad_inicial` por debajo de lo ya consumido. Audita cada campo `antes → después`.                                                        |
| `darDeBaja(sku, motivo)`           | Motivo obligatorio. Sale de listados y cifras de valor; conserva el historial. Audita `inventario.baja`.                                                                                                                       |
| `deleteItem(sku, motivo)`          | Motivo obligatorio. **Rechaza si el ítem tiene movimientos** (se da de baja).                                                                                                                                                  |
| `registrarMovimiento(data)`        | Valida cantidad entera > 0, fecha, costo, destino y **stock** (una salida nunca deja stock negativo). Entrada con costo → recalcula `valorUnitario` (§6.4). Salida → guarda `costoAlSalir`.                                    |
| `importarMovimientos(filas)`       | **Todo o nada**: valida el lote completo con stock acumulado fila a fila y rechaza con el detalle por fila (`Fila 3: …`).                                                                                                      |
| `importarValores(filas)`           | **Todo o nada**: valida SKU, grupo/categoría, cantidad inicial (sin stock negativo), año y valor; reclasifica si grupo/categoría difieren; **celdas de año/valor vacías no borran** lo existente. Un solo evento de auditoría. |
| `exportar()`                       | Ítems por grupo (formato de `inventario_ioting.json`).                                                                                                                                                                         |

### 3.7 `ConfiguracionApi` y `RespaldoApi`

| Operación                                      | Reglas                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configuracion.get()`                          |                                                                                                                                                                                                                              |
| `actualizarInventario(cfg)`                    | Categorías únicas, prefijo de 3 letras mayúsculas por categoría, residual 0..100, vida útil > 0 o null. **No se puede quitar una categoría que usan ítems.** Audita.                                                         |
| `actualizarSectores(lista)`                    | No vacía; **no se puede quitar un sector en uso por algún cliente.** Audita.                                                                                                                                                 |
| `limpiarDemo(confirmacion)`                    | Exige la frase exacta `ELIMINAR DEMO` (§5.7).                                                                                                                                                                                |
| `respaldo.exportar / previsualizar / importar` | Solo mock. `previsualizar` valida sin aplicar y compara conteos (hoy vs respaldo). `importar` reemplaza toda la base y audita. Rechaza con `Respaldo inválido: …` formato desconocido, versión futura o listas mal formadas. |

### 3.8 `AuditoriaApi`

`list()`, `registrar(data)`. Inmutable: no hay operaciones de edición ni borrado.

---

## 4. Paginación y filtros sugeridos

Hoy el cliente pagina y filtra en memoria. Para el backend:

| Recurso     | Filtros                                                                                                                      | Orden por defecto      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Clientes    | `estado`, `sector`, texto (razón social, NIT, ciudad)                                                                        | razón social           |
| Proyectos   | `clienteId`, `estado`, `responsable`, `etiqueta`, texto                                                                      | `fechaInicio` desc     |
| Trabajos    | `clienteId`, `tipo`, `estado`, `fechaProgramada` desde/hasta, texto (código, título)                                         | `fechaProgramada` desc |
| Ítems       | `grupo`, `categoria`, `subcategoria`, `estado`, `ubicacion`, texto (SKU, descripción, marca); **excluir `Baja` por defecto** | SKU                    |
| Movimientos | `sku`, `tipo`, `destinoTipo`+`destinoId`, rango de `fecha`                                                                   | `fecha` desc           |
| Auditoría   | `actor`, `accion`, `entidad`, `entidadId`, rango de fecha, texto                                                             | `fecha` desc           |

Paginación por cursor (`limite`, `cursor`) con total aproximado. El tablero de proyectos y de
trabajos necesita **todas** las filas de un conjunto filtrado: ofrecer un conteo por estado.

---

## 5. Reglas e invariantes (no negociables)

### 5.1 Inventario

1. **`stockActual = cantidad_inicial + Σ entradas − Σ salidas`.** Nunca se guarda, siempre se
   calcula, **nunca es negativo**.
2. Una salida que dejaría el stock negativo se rechaza, **también con fecha pasada y también dentro
   de una importación** (stock acumulado fila a fila).
3. **SKU sin reutilización.** El contador por prefijo se siembra con el máximo de ítems **y de
   movimientos** (un SKU eliminado que dejó movimientos huérfanos sigue ocupado).
4. **Baja vs eliminación.** Con movimientos → solo baja (con motivo). Sin movimientos → eliminación
   definitiva (con motivo). Ambas auditadas.
5. Año de compra entero 1990..año actual; valor entero COP ≥ 0; costo de compra entero ≥ 0.
6. El grupo **no** se deduce del SKU.

### 5.2 Movimientos

7. Fecha: pasado permitido, **futuro rechazado** (comparación por día en Bogotá cuando viene solo
   la fecha).
8. `costoUnitario` solo en entradas; `destino*` solo en salidas y debe existir.
9. `costoAlSalir` es una **instantánea**: cambia el valor del ítem después y el costo de lo ya
   consumido **no** cambia.

### 5.3 Fechas de proyectos y trabajos

10. Son fechas reales editables; `fin ≥ inicio`. El momento técnico del registro va aparte
    (`registradoEn`).

### 5.4 Cascada y reactivación

11. **Baja de cliente:** pasa a baja sus usuarios y proyectos no finalizados y **cancela** sus
    trabajos abiertos (`bajaPorCliente = true`, motivo «Baja del cliente …»). Los cerrados no se
    tocan.
12. **No se reactiva** un usuario, proyecto o trabajo cuyo cliente esté en baja o suspendido; el
    mensaje dice «Reactive primero al cliente».
13. **Reactivar un cliente no reactiva a los hijos**: los ofrece (`hijosReactivables`) para
    reactivarlos selectivamente. Cada reactivación audita.

### 5.5 Eliminaciones y bajas

14. Toda baja, suspensión o eliminación destructiva exige **motivo** (≥ 3 caracteres) **validado en
    la API, no solo en el formulario**, y deja evento de auditoría. Los consecutivos (`TT-NNNN`, SKU) no se reutilizan.

### 5.6 Importaciones

15. **Todo o nada.** Si una fila falla no se aplica ninguna; el error nombra las filas.

### 5.7 Datos de demostración

16. La semilla marca `esDemo: true` en clientes, usuarios, proyectos, trabajos y movimientos.
    `limpiarDemo("ELIMINAR DEMO")` elimina **solo** lo marcado. Un cliente de demostración que
    conserve algún hijo creado por el usuario **se conserva**. El inventario (los 150 ítems) **no se
    toca**. Los movimientos de demostración se eliminan: el stock vuelve a lo que no consumieron.
    Deja un evento `sistema.limpiar_demo` con los conteos.

---

## 6. Cálculos derivados (nunca persistidos)

Todo lo siguiente se calcula en el momento de consultarlo. Un backend puede ofrecerlos como
endpoints de lectura, pero **no debe almacenarlos como fuente de verdad**.

| Cifra                               | Fórmula                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stock actual**                    | `cantidad_inicial + Σ entradas − Σ salidas`                                                                                                                                           |
| **Existencia a costo**              | `Σ stock × valorUnitario` (ítems con valor, sin `Baja`)                                                                                                                               |
| **Invertido**                       | `Σ (cantidad_inicial × costoInicial) + Σ (entrada × costoUnitario)`. **Incluye lo ya consumido.**                                                                                     |
| **Valor estimado actual**           | `stock × valorUnitario × max(residual, 1 − edad/vidaÚtil)`, `edad = añoActual − anioCompra` (mínimo 0). Sin vida útil (grupo o ítem) o sin año de compra → no se deprecia (factor 1). |
| **Ítems sin valor**                 | Cuenta de ítems (sin `Baja`) con `valorUnitario` nulo. **Se publica siempre junto a las tres cifras** para que el total no parezca más exacto de lo que es.                           |
| **Invertido por año**               | Parte inicial por `anioCompra` (o «Sin año»); entradas por el año de su fecha.                                                                                                        |
| **Material de un proyecto/trabajo** | Salidas con ese destino; costo = `Σ cantidad × costoAlSalir`; se informa cuántas salidas no tenían valor.                                                                             |
| **Costo promedio ponderado**        | Ver §6.4.                                                                                                                                                                             |

Etiqueta obligatoria junto a las cifras de valor: **«Estimación interna de gestión; no reemplaza
la contabilidad (Alegra)».**

### 6.4 Costo promedio ponderado

Al registrar una **entrada con costo**:
`valorNuevo = round((stock × valorActual + cantidad × costo) / (stock + cantidad))`.
Si el ítem no tenía valor, o su stock era 0, `valorNuevo = costo`. Una entrada sin costo y
cualquier salida **no** mueven el valor. Si no hay compras con costo, editar el `valorUnitario`
actualiza también `costoInicial`.

---

## 7. Eventos de auditoría

Quién (`actor`), qué (`accion`), cuándo (`fecha`) y motivo (en `detalle`). Acciones emitidas hoy:

| Entidad       | Acciones                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cliente       | `cliente.crear`, `cliente.editar`, `cliente.suspender`, `cliente.baja`, `cliente.reactivar`                                                                      |
| usuario       | `usuario.invitar`, `usuario.rol`, `usuario.suspender`, `usuario.baja`, `usuario.reactivar`                                                                       |
| proyecto      | `proyecto.crear`, `proyecto.editar`, `proyecto.estado`, `proyecto.baja`, `proyecto.eliminar`                                                                     |
| trabajo       | `trabajo.crear`, `trabajo.editar`, `trabajo.estado`, `trabajo.cancelar`, `trabajo.reactivar`, `trabajo.eliminar`                                                 |
| inventario    | `inventario.crear`, `inventario.editar`, `inventario.baja`, `inventario.eliminar`, `inventario.movimiento`, `inventario.importar`, `inventario.importar_valores` |
| configuración | `configuracion.inventario`, `configuracion.sectores`                                                                                                             |
| sistema       | `sistema.migracion`, `sistema.respaldo_importar`, `sistema.limpiar_demo`                                                                                         |

Las cascadas generan **un evento por hijo afectado**. La importación de valores genera **un** evento
con el resumen por SKU.

---

## 8. Errores esperados

El mock lanza `Error` con mensaje en español; el panel lo muestra tal cual. Propuesta de mapeo
HTTP (el backend decide los códigos definitivos; **los mensajes deben conservarse** porque las
pruebas los verifican):

| Situación                | HTTP sugerido | Ejemplo de mensaje                                                                                                                                                                                               |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurso inexistente      | 404           | `Ítem no encontrado`                                                                                                                                                                                             |
| Validación de campo      | 422           | `Año de compra inválido (1990..2026).`                                                                                                                                                                           |
| Regla de negocio         | 409           | `Stock insuficiente: hay 1 und y se intenta sacar 2.` · `El ítem tiene movimientos: no se elimina, se da de baja…` · `No se puede reactivar el trabajo: el cliente X está en baja. Reactive primero al cliente.` |
| Falta motivo             | 422           | `La baja exige un motivo.`                                                                                                                                                                                       |
| Lote rechazado           | 409           | `Importación rechazada, no se aplicó nada. Fila 3: SKU inexistente: …`                                                                                                                                           |
| Confirmación errónea     | 422           | `Escriba exactamente ELIMINAR DEMO para confirmar.`                                                                                                                                                              |
| Respaldo inválido        | 422           | `Respaldo inválido: no es un respaldo del panel de IoTing Dev.`                                                                                                                                                  |
| Sin sesión / sin permiso | 401 / 403     | (la redirección al ingreso la hace la ruta `_panel`)                                                                                                                                                             |

---

## 9. Mapa hacia la arquitectura de la plataforma

Esta sección **propone** el encaje; lo marcado como pendiente está en §1.

1. **Autenticación del personal (sustituye `AuthApi` mock).** Cognito, con el modelo ya
   documentado en ADR-0030: un _app client_ por tipo de principal, validación del token en el
   servidor y rol derivado del grupo. **Pendiente:** pool de staff propio o _app client_ nuevo en
   el pool de plataforma (§1, punto 2).
2. **Zero Trust (ADR-0014).** El panel no es una excepción: cada operación se autentica, autoriza
   y registra; ninguna llamada se confía por su origen.
3. **Suscripción como identificador común (ADR-0004 §6, ADR-0003).** El `Cliente` del panel debe
   enlazar con la **Suscripción/tenant** de la plataforma mediante su identificador, no por
   nombre. Hoy el panel no tiene ese campo: **se añade como `suscripcionId` opcional** cuando el
   cliente exista en la plataforma, y la plataforma sigue siendo la fuente del estado real del
   servicio (CB-05: «el registro comercial se compra; el estado real del servicio proviene de la
   plataforma»).
4. **Aislamiento (ADR-0018).** Todo registro de cliente (`Cliente`, `Usuario`, `Proyecto`,
   `Trabajo`) debe quedar **acotado a su cliente propietario** en cada consulta; el panel de
   staff accede con una vía de acceso privilegiado **auditada** (ADR-0017), no con un acceso
   permanente a datos de cliente.
5. **Alegra (propuesta; ver §1, punto 3).**
   - **No duplicar contabilidad.** El panel no emite facturas ni lleva libros. `valorPactado` es
     informativo.
   - **Facturación:** un trabajo `completado` con `valorPactado` es el insumo para que Alegra
     facture; el enlace sugerido es un `referenciaFactura` opcional en el trabajo, escrito por la
     integración, no por el panel.
   - **Activos:** los ítems de grupo `equipos` (y herramientas de valor) pueden corresponder a
     **activos fijos** de Alegra. La depreciación del panel es **gestión interna**; la contable la
     lleva Alegra. Sugerido: `activoFijoId` opcional en el ítem.
   - **Compras:** una entrada con `costoUnitario` puede enlazar a una compra de Alegra
     (`compraId`), de modo que el costo del panel provenga de ella y no se teclee dos veces.
6. **Sensibilidad (ADR-0015).** Pendiente asignar S0–S3 por campo (§1, punto 4). Mientras tanto,
   tratar correo, teléfono y dirección como mínimo sensibles.
7. **Atribución de costo por cliente (DAW-22).** El panel no debe introducir un servidor de
   dominio de larga vida compartido: si se construye, función discreta con identidad de alcance
   mínimo, como el resto del núcleo (ADR-0024).

---

## 10. Migración de datos guardados (modo mock)

La base se guarda en `localStorage` como `ioting.mock.db.v2`.

- **v1 → v2:** al leer una base v1 se migra (los SKU **no cambian**): grupo explícito y
  reclasificación de 11 ítems (CAB-001, 008–012 → herramientas/Accesorios de taller; CAB-002–007 →
  seguridad/Cableado y conectividad; EQP-008 y 009 → herramientas/Herramientas de mano), contador
  de SKU, configuración, enlace de movimientos a su proyecto por id. **Se conservan todos los
  movimientos y la auditoría**, se añade el evento `sistema.migracion` y la **v1 queda intacta como
  respaldo**. Resultado de la semilla: 150 referencias, 401 unidades, grupos 100/36/8/6.
- **Completado de campos posteriores (fases 3 y 4):** `borrador → en_desarrollo`, `registradoEn`,
  `trabajos`, `sectores`, contador `TT`. Idempotente.
- El backend real debe aportar su propia migración desde el respaldo JSON (`Respaldo`), que es el
  formato de intercambio.

---

## 11. Lo que el backend NO debe hacer

- Guardar el stock, el invertido o cualquier cifra de §6.
- Reutilizar SKU o códigos `TT-NNNN`.
- Aplicar parcialmente una importación.
- Eliminar o dar de baja sin motivo.
- Reactivar hijos automáticamente al reactivar un cliente.
- Tratar el `esDemo` como dato de usuario: es una marca de la semilla.
