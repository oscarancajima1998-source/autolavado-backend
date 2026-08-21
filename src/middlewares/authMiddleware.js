/**
 * MIDDLEWARE: AuthMiddleware
 * Proyecto: Carwash ServiProf
 * Descripción: Verifica el Token JWT e inyecta directivas CSP para seguridad profesional.
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'serviprof_secret_key_2026';

exports.verificarToken = (req, res, next) => {
  // 1. Configurar directivas Content-Security-Policy (CSP) Profesionales
  // Permitimos conectar a 'self' (mismo dominio) y específicamente a localhost.
  const cspPolicy = [
    "default-src 'self'", // Por defecto, todo desde el mismo origen
    "connect-src 'self' http://localhost:* ws://localhost:*", // Permitir Fetch API, SSE y WebSockets localmente
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com", // Permitir scripts propios, inline y Tailwind CDN
    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com", // Permitir estilos propios e inline (necesario para Tailwind)
    "img-src 'self' data:", // Permitir imágenes propias y en formato data: (como QR)
    "font-src 'self'", // Permitir fuentes propias
    "frame-ancestors 'none'" // Bloquear clickjacking (no permitir embeber en iframes)
  ].join('; ');

  // Inyectar el encabezado de seguridad en la respuesta
  res.setHeader('Content-Security-Policy', cspPolicy);


  // 2. Validación de Token JWT existente
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ status: 'ERROR', error: 'Acceso no autorizado. Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) {
      return res.status(403).json({ status: 'ERROR', error: 'Token inválido o expirado.' });
    }
    req.usuario = usuarioDecodificado;
    next();
  });
};