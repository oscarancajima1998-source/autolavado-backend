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

router.get('/maquinas/estacion/:estacionId', verificarToken, adminController.listarMaquinas);
router.get('/maquinas-inactivas/estacion/:estacionId', verificarToken, adminController.listarMaquinasInactivas);
router.post('/maquinas', verificarToken, adminController.crearMaquina);
router.put('/maquinas/:id', verificarToken, adminController.actualizarMaquina);
router.put('/maquinas/restaurar/:id', verificarToken, adminController.restaurarMaquina);
router.delete('/maquinas/:id', verificarToken, adminController.eliminarMaquina);

router.post('/maquinas/activar-manual', verificarToken, adminController.activarManual);
router.post('/maquinas/detener-manual', verificarToken, adminController.detenerManual);
router.get('/reportes/estacion/:estacionId', verificarToken, adminController.obtenerReporteFechas);

// NUEVA RUTA: Activación rápida desde el Kiosco (valida contraseña en el backend)
router.post('/activacion-emergencia', adminController.activacionEmergenciaKiosco);

module.exports = router;