/**
 * RUTAS: adminRoutes
 * Proyecto: Carwash ServiProf
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.post('/login', adminController.login);
router.get('/perfil', verificarToken, (req, res) => { res.json({ status: 'OK', usuario: req.usuario }); });

// --- MÁQUINAS Y DASHBOARD ---
router.get('/maquinas/estacion/:estacionId', verificarToken, adminController.listarMaquinas);
router.get('/maquinas-inactivas/estacion/:estacionId', verificarToken, adminController.listarMaquinasInactivas);
router.post('/maquinas', verificarToken, adminController.crearMaquina);
router.put('/maquinas/:id', verificarToken, adminController.actualizarMaquina);
router.put('/maquinas/restaurar/:id', verificarToken, adminController.restaurarMaquina);
router.delete('/maquinas/:id', verificarToken, adminController.ocultarMaquina);

router.post('/maquinas/activar-manual', verificarToken, adminController.activarManual);
router.post('/maquinas/detener-manual', verificarToken, adminController.detenerManual);
router.get('/reportes/estacion/:estacionId', verificarToken, adminController.obtenerReportesEstacion);
router.post('/activacion-emergencia', adminController.activacionEmergenciaKiosco);

// --- CLIENTES PREPAGO ---
router.get('/clientes', verificarToken, adminController.listarClientes);
router.get('/clientes-inactivos', verificarToken, adminController.listarClientesInactivos);
router.post('/clientes', verificarToken, adminController.crearCliente);
router.post('/clientes/recargar', verificarToken, adminController.recargarSaldoCliente);
router.post('/clientes/descontar', verificarToken, adminController.descontarSaldoCliente); // NUEVO
router.put('/clientes/restaurar/:id', verificarToken, adminController.restaurarCliente);
router.delete('/clientes/:id', verificarToken, adminController.eliminarCliente);

module.exports = router;