# Google Classroom Dashboard

Una aplicación web que se conecta directamente con la API de Google Classroom para proporcionar una capa adicional de visualización y gestión para alumnos, profesores y coordinadores.

## 🚀 Características

- **Autenticación OAuth 2.0** con Google Workspace
- **Dashboards personalizados** por rol de usuario
- **Reportes consolidados** por alumno, curso y profesor
- **Panel de coordinación** para monitorear avances
- **Interfaz intuitiva** optimizada para cada perfil

## 🏗️ Arquitectura

- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: React + Material-UI
- **Autenticación**: Google OAuth 2.0
- **API**: Google Classroom API v1

## 📁 Estructura del Proyecto

```
classroom-dashboard/
├── backend/          # Servidor API Node.js
├── frontend/         # Aplicación React
├── docs/            # Documentación
└── README.md        # Este archivo
```

## 🔧 Configuración Inicial

### Prerrequisitos

1. Node.js (v16 o superior)
2. PostgreSQL (v12 o superior)
3. Cuenta de Google Cloud Platform
4. Google Classroom API habilitada

### Variables de Entorno

Crear archivos `.env` en backend y frontend con las configuraciones necesarias.

## 🚀 Instalación y Ejecución

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## 👥 Roles de Usuario

- **Alumnos**: Ver sus cursos, tareas y calificaciones
- **Profesores**: Gestionar cursos y ver reportes de estudiantes
- **Coordinadores**: Panel completo de monitoreo y reportes consolidados

## 🔐 Seguridad

- Autenticación OAuth 2.0 con Google
- Tokens JWT para sesiones
- Validación de roles y permisos
- Conexión segura con API de Google Classroom

## 📊 Funcionalidades

- Gestión de tareas y entregas
- Sistema de calificaciones
- Reportes de progreso
- Alertas y notificaciones
- Dashboard analítico para coordinadores

## ✅ Acceso de prueba con Google OAuth (evitar 403 access_denied)

Cuando la aplicación está en modo de prueba (sin verificación completa), solo los usuarios agregados como "Test users" pueden iniciar sesión. Si ves el error 403 `access_denied`, seguí estos pasos:

### 1) Agregar cuentas como testers
- Ingresá a Google Cloud Console con la cuenta dueña del proyecto.
- Navegá a: `APIs & Services` → `OAuth consent screen` → `Test users`.
- Click en `ADD USERS` y agregá los correos que van a probar la app.
- Guardá cambios. Esperá 1–2 minutos y reintentá el login.

### 2) Revisar orígenes y redirecciones autorizadas
- `APIs & Services` → `Credentials` → `OAuth 2.0 Client IDs` → tu cliente Web.
- En `Authorized JavaScript origins` agregá (ejemplo local):
  - `http://localhost:3000`
- En `Authorized redirect URIs` agregá (según backend):
  - `http://localhost:5000/api/auth/google/callback`

### 3) Scopes requeridos (Classroom)
La app solicita scopes de Google Classroom (sensibles). En modo de prueba funcionará solo para testers.

### 4) Publicar a producción (opcional)
- En `OAuth consent screen`, usá `Publish App` para salir del modo de prueba.
- Google puede requerir verificación para scopes sensibles. Recomendado mantener modo de prueba con testers mientras desarrollás.

### 5) Troubleshooting rápido
- Asegurate de cerrar sesión y reintentar en otra ventana si el login falla.
- Revisá `http://localhost:5000/health` para confirmar que el backend esté activo.
- Verificá cookies de sesión en DevTools → Application → Cookies → `http://localhost:5000`.
