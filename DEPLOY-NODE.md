# Despliegue Node.js (sin cambiar frontend)

## 1) Requisitos

- Node.js 20+ recomendado.
- Acceso para ejecutar procesos Node persistentes en el hosting o VPS.

## 2) Variables de entorno

Crear un archivo `.env` en la raiz del proyecto:

```env
PORT=3000
BACKUP_RETENTION=60
ADMIN_API_TOKEN=TU_TOKEN_SEGURO
SHEETS_API_KEY=TU_API_KEY
SHEETS_ID=TU_SPREADSHEET_ID
SHEETS_NAME=Respuestas de formulario 1
```

## 3) Instalacion

En Windows PowerShell con politicas restrictivas, usar:

```powershell
npm.cmd install
```

## 4) Ejecucion

```powershell
npm.cmd start
```

El sistema quedara en:

- `http://localhost:3000`

## 5) Endpoints principales

- `GET /api/health`
- `GET /api/state`
- `POST /api/state`
- `POST /api/applicants/sync`
- `GET /api/backups?limit=20`
- `POST /api/backups` (crea snapshot manual)
- `POST /api/backups/:id/restore` (requiere token admin)
- `GET /api/audit?limit=100&action=save_state` (requiere token admin)

Header para endpoints protegidos:

- `x-admin-token: TU_TOKEN_SEGURO`
	o
- `Authorization: Bearer TU_TOKEN_SEGURO`

## 6) Persistencia

- Base SQLite en `data/belu-hospedaje.sqlite`.
- Respaldos versionados en tabla `state_snapshots`.
- Auditoria de eventos en tabla `audit_log`.

## 7) Recomendaciones de produccion

- Usar un reverse proxy (Nginx/Apache) para TLS y dominio.
- Programar copia externa diaria del archivo `data/belu-hospedaje.sqlite`.
- Restringir acceso de red al endpoint de restauracion (`/api/backups/:id/restore`).
- No publicar credenciales de `.env` ni de `.vscode/sftp.json`.

## 8) Arranque automatico como servicio (Windows)

Instalar tarea de inicio automatico:

```powershell
npm.cmd run service:setup
```

Eliminar tarea:

```powershell
npm.cmd run service:remove
```

Nombre de la tarea instalada: `BeluHospedajeNode`.
