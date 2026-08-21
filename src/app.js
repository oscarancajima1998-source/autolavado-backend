const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos
app.use(express.static(path.resolve(__dirname, '../public')));

// Inicialización de servicios
require('./config/database');
require('./services/mqttService');

// Rutas de la API
app.use('/api/lavado', require('./routes/lavadoRoutes'));
app.use('/api/admin', require('./routes/adminRoutes')); // <-- NUEVA RUTA AGREGADA

// Endpoint de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});