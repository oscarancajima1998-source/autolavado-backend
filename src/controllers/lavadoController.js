/**
 * CONTROLADOR: LavadoController
 * Proyecto: Carwash ServiProf
 */

const VentaModel = require('../models/ventaModel');
const MaquinaModel = require('../models/maquinaModel');

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
    
    // ORDEN MQTT PARA ENCENDER EL ESP32
    const mqttClient = require('../services/mqttService');
    const payload = JSON.stringify({ maquina_id: maquina.id, nombre_maquina: maquina.nombre, tiempo_seg: tiempo_otorgado_seg, pin_hardware: maquina.pin_hardware });
    mqttClient.publish('autolavado/estacion/1/activar', payload);

    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    exports.notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });
    res.json({ status: 'OK' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.recibirWebhookYape = async (req, res) => {
  try {
    let { monto, texto_notificacion } = req.body;

    if (!monto && texto_notificacion) {
      const matchMonto = texto_notificacion.match(/S\/\s*(\d+(\.\d+)?)/i);
      if (matchMonto) { monto = parseFloat(matchMonto[1]); }
    }

    if (!monto || isNaN(monto)) {
      return res.status(400).json({ status: 'ERROR', mensaje: 'No se pudo extraer el monto de la notificación.' });
    }

    monto = Math.floor(monto);

    if (!maquinaSeleccionadaMemoria) {
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', monto_recibido: monto });
      return res.json({ status: 'OK', mensaje: 'Crédito pendiente.' });
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(maquinaSeleccionadaMemoria);
    if (!maquina) return res.status(400).json({ status: 'ERROR', mensaje: 'Máquina inválida.' });

    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    await VentaModel.crearVenta({ estacion_id: maquina.estacion_id, maquina_id: maquina.id, monto, metodo_pago: 'YAPE', tiempo_otorgado_seg });
    
    // ORDEN MQTT PARA ENCENDER EL ESP32
    const mqttClient = require('../services/mqttService');
    const payload = JSON.stringify({ maquina_id: maquina.id, nombre_maquina: maquina.nombre, tiempo_seg: tiempo_otorgado_seg, pin_hardware: maquina.pin_hardware });
    mqttClient.publish('autolavado/estacion/1/activar', payload);

    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    exports.notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });
    
    maquinaSeleccionadaMemoria = null;
    res.json({ status: 'OK', mensaje: 'Pago procesado correctamente.' });
  } catch (error) { 
    console.error('❌ Error en webhook Yape:', error);
    res.status(500).json({ status: 'ERROR', error: error.message }); 
  }
};

exports.reportarFalla = (req, res) => {
  const { maquina_nombre } = req.body;
  exports.notificarClientes({ status: 'ALERTA_SOPORTE', maquina_nombre });
  res.json({ status: 'OK' });
};

// --- PROCESAMIENTO DE DINERO FÍSICO DESDE EL ESP32 ---
exports.procesarPagoFisicoInterno = async (monto) => {
  try {
    if (!maquinaSeleccionadaMemoria) {
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', monto_recibido: monto });
      return;
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(maquinaSeleccionadaMemoria);
    if (!maquina) return;

    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    await VentaModel.crearVenta({ estacion_id: maquina.estacion_id, maquina_id: maquina.id, monto, metodo_pago: 'EFECTIVO', tiempo_otorgado_seg });

    // ORDEN MQTT PARA ENCENDER EL ESP32
    const mqttClient = require('../services/mqttService');
    const payload = JSON.stringify({ maquina_id: maquina.id, nombre_maquina: maquina.nombre, tiempo_seg: tiempo_otorgado_seg, pin_hardware: maquina.pin_hardware });
    mqttClient.publish('autolavado/estacion/1/activar', payload);

    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg);
    exports.notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });

    maquinaSeleccionadaMemoria = null;
  } catch (error) {
    console.error('❌ Error en pago físico interno:', error);
  }
};