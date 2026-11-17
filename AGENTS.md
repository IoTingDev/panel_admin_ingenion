# Panel de administración IoTing Dev — notas para agentes y colaboradores

Este repositorio es **propio de IoTing Dev**: vive en GitHub (`IoTingDev/panel_admin_ingenion`) y en local, y se
despliega en AWS (S3 + CloudFront, `admin.iotingdev.com`). **No está conectado a Lovable ni a ninguna otra
plataforma de generación**: ningún servicio externo reescribe ni sincroniza commits. Se puede trabajar con
normalidad en ramas, hacer rebase propio y revisar con pull requests.

- Gestor de paquetes: **bun** (no mezclar `npm`, `pnpm` ni `yarn`: dejan dos copias de React y rompen el panel).
- Pruebas: `bun run test` (unitarias), `bun run test:e2e` (E2E, modo simulado), `bun run test:visual`.
- Contrato de API: `docs/CONTRATO-API-PANEL.md` es el techo de alcance (ADR-0045).
- Identidad y sesión: ADR-0046 del monorepo `Dev-Ingenion/iotingdev-platform`; el panel no guarda credenciales.
- Publicación: manual, desde el monorepo con `infra/guiones/publicar-panel.sh` (ver
  `INDICE-REPOSITORIOS.md` en la carpeta de arquitectura).
- Nota de construcción: la configuración de Vite usa todavía la biblioteca pública de npm
  `@lovable.dev/vite-tanstack-config` como envoltorio de plugins. Es una dependencia de compilación, sin
  conexión con ninguna cuenta ni llamada en ejecución; su sustitución está pendiente y se hará validando que el
  artefacto publicado no cambie.
