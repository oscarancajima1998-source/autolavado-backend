/**
 * CONTROLADOR: LavadoController
 * Proyecto: Carwash ServiProf
 */

const VentaModel = require('../models/ventaModel');

let clientesSSE = [];
let maquinaSeleccionadaMemoria = null;

// --- MOTOR DE TIEMPO REAL (CRONÓMETROS) ---
const maquinasEnUso = {};

exports.iniciarTemporizador = (id, segundos) => {
  maquinasEnUso[id] = Date.now() + (segundos * 1000);
};

exports.detenerTemporizador = (id) => {
  delete maquinasEnUso[id];
};

setInterval(() => {
  const tiempos = {};
  const now = Date.now();
  for (let id in maquinasEnUso) {
    const faltan = Math.ceil((maquinasEnUso[id] - now) / 1000);
    if (faltan > 0) {
      tiempos[id] = faltan;
    } else {
      delete maquinasEnUso[id]; 
    }
  }
  exports.notificarClientes({ status: 'TICK', tiempos });
}, 1000);

// --- EVENTOS SSE GLOBALES ---
exports.suscribirEventos = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clientesSSE.push(res);
  req.on('close', () => { clientesSSE = clientesSSE.filter(c => c !== res); });
};

exports.notificarClientes = (data) => {
  clientesSSE.forEach(cliente => { cliente.write(`data: ${JSON.stringify(data)}\n\n`); });
};

// --- DATOS Y SELECCIÓN ---
exports.obtenerDatosDashboard = async (req, res) => {
  try {
    const resumen = await VentaModel.obtenerResumenDashboard(1);
    res.json(resumen);
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.seleccionarMaquina = (req, res) => {
  const { maquina_id } = req.body;
  maquinaSeleccionadaMemoria = maquina_id;
  res.json({ status: 'OK', maquina_id });
};

// --- PAGOS Y ACTIVACIONES KIOSCO ---
exports.activarConCredito = async (req, res) => {
  try {
    const { maquina_id, monto } = req.body;
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada o inactiva' });

    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    await VentaModel.crearVenta({ estacion_id: maquina.estacion_id, maquina_id: maquina.id, monto, metodo_pago: 'YAPE', tiempo_otorgado_seg });
    
    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    exports.notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });
    res.json({ status: 'OK' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.recibirWebhookYape = async (req, res) => {
  try {
    const { monto } = req.body;
    if (!maquinaSeleccionadaMemoria) {
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', monto_recibido: monto });
      return res.json({ status: 'OK', mensaje: 'Crédito pendiente.' });
    }
    const maquina = await VentaModel.obtenerMaquinaPorId(maquinaSeleccionadaMemoria);
    if (!maquina) return res.status(400).json({ status: 'ERROR', mensaje: 'Máquina inválida.' });

    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    await VentaModel.crearVenta({ estacion_id: maquina.estacion_id, maquina_id: maquina.id, monto, metodo_pago: 'YAPE', tiempo_otorgado_seg });
    
    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    exports.notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });
    maquinaSeleccionadaMemoria = null;
    res.json({ status: 'OK', mensaje: 'Pago procesado correctamente.' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// ==========================================
// NUEVO: ALARMA DE SOPORTE PARA EL DASHBOARD
// ==========================================
exports.reportarFalla = (req, res) => {
  const { maquina_nombre } = req.body;
  // Esto envía el evento 'ALERTA_SOPORTE' a tu Dashboard para que suene la alarma
  exports.notificarClientes({ status: 'ALERTA_SOPORTE', maquina_nombre });
  res.json({ status: 'OK' });
};