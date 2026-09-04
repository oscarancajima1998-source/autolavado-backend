/**
 * RUTAS: lavadoRoutes
 * Proyecto: Carwash ServiProf
 */

const express = require('express');
const router = express.Router();
const lavadoController = require('../controllers/lavadoController');
const MaquinaModel = require('../models/maquinaModel');

// Rutas de eventos y dashboard
router.get('/eventos', lavadoController.suscribirEventos);
router.get('/dashboard-datos', lavadoController.obtenerDatosDashboard);

// Rutas de interacción del kiosco
router.post('/seleccionar-maquina', lavadoController.seleccionarMaquina);
router.post('/activar-con-credito', lavadoController.activarConCredito);
router.post('/webhook/yape', lavadoController.recibirWebhookYape);
router.post('/reportar-falla', lavadoController.reportarFalla);

// ==========================================
// RUTAS PARA CLIENTES PREPAGO EN EL KIOSCO
// ==========================================
router.get('/cliente/:dni', lavadoController.consultarCliente);
router.post('/pagar-saldo-cliente', lavadoController.pagarConSaldoCliente);
router.post('/arranque-parcial', lavadoController.arranqueParcial);

// Carga inicial de máquinas en el kiosco
router.get('/maquinas-activas/:estacionId', async (req, res) => {
  try {
    const maquinas = await MaquinaModel.obtenerPorEstacion(req.params.estacionId || 1);
    res.json({ status: 'OK', data: maquinas });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

module.exports = router;