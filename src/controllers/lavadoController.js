/**
 * CONTROLADOR: LavadoController
 * Proyecto: Carwash ServiProf
 */

const VentaModel = require('../models/ventaModel');
const MaquinaModel = require('../models/maquinaModel');

let clientesSSE = [];

// --- ESTADO DE SESIÓN KIOSCO (Memoria Inteligente) ---
let sesionKiosco = {
  maquina_id: null,
  monto_objetivo: 0,
  saldo_acumulado: 0
};

// --- MOTOR DE TIEMPO REAL (CRONÓMETROS GLOBALES) ---
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
      // Si la máquina que se apagó era la que estaba en sesión, liberamos para no desviar monedas
      if (sesionKiosco.maquina_id === parseInt(id)) {
        sesionKiosco.maquina_id = null;
      }
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

exports.obtenerDatosDashboard = async (req, res) => {
  try {
    const resumen = await VentaModel.obtenerResumenDashboard(1);
    res.json(resumen);
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// --- SELECCIÓN DE MÁQUINA DESDE LA PANTALLA ---
exports.seleccionarMaquina = (req, res) => {
  const { maquina_id, monto } = req.body;
  
  sesionKiosco.maquina_id = maquina_id;
  // Si envían un monto (ej. 3 soles), ese es el objetivo. Si no, por defecto es 1 sol.
  sesionKiosco.monto_objetivo = monto || 1; 

  res.json({ 
    status: 'OK', 
    mensaje: `Máquina ${maquina_id} lista. Objetivo: S/ ${sesionKiosco.monto_objetivo}.00`,
    saldo_actual: sesionKiosco.saldo_acumulado 
  });

  // Si el cliente metió monedas ANTES de tocar la pantalla, cobramos automáticamente
  if (sesionKiosco.saldo_acumulado > 0) {
    exports.procesarPagoFisicoInterno(0);
  }
};

// --- LÓGICA MAESTRA DE ACTIVACIÓN Y EXTENSIÓN DE TIEMPO (DRY) ---
const ejecutarActivacion = async (maquina, montoUsado, metodoPago) => {
  const tiempo_otorgado_seg = Math.round((montoUsado / 1.00) * maquina.segundos_por_sol);
  const maquinaActiva = maquinasEnUso[maquina.id] && maquinasEnUso[maquina.id] > Date.now();

  // 1. Registrar Venta en BD
  await VentaModel.crearVenta({
    estacion_id: maquina.estacion_id,
    maquina_id: maquina.id,
    monto: montoUsado,
    metodo_pago: metodoPago,
    tiempo_otorgado_seg
  });

  // 2. Calcular Tiempo Total (SUMA si ya estaba encendida)
  let tiempoRestanteTotal = tiempo_otorgado_seg;
  if (maquinaActiva) {
    maquinasEnUso[maquina.id] += (tiempo_otorgado_seg * 1000); // Sumamos los nuevos segundos
    tiempoRestanteTotal = Math.ceil((maquinasEnUso[maquina.id] - Date.now()) / 1000);
  } else {
    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg);
  }

  // 3. Orden MQTT: Enviamos el tiempo TOTAL ACUMULADO a la placa para que extienda su reloj
  const mqttClient = require('../services/mqttService');
  const payload = JSON.stringify({
    maquina_id: maquina.id,
    nombre_maquina: maquina.nombre,
    tiempo_seg: tiempoRestanteTotal,
    pin_hardware: maquina.pin_hardware
  });
  mqttClient.publish('autolavado/estacion/1/activar', payload);

  // 4. Notificar a las Pantallas
  exports.notificarClientes({
    status: 'PAGO_CONFIRMADO',
    maquina_nombre: maquina.nombre,
    monto_recibido: montoUsado,
    tiempo_seg: tiempoRestanteTotal,
    es_extension: maquinaActiva
  });

  // 5. Consumir el saldo de la sesión, PERO mantener la máquina seleccionada
  sesionKiosco.saldo_acumulado = 0;
  sesionKiosco.monto_objetivo = 1; // Para que las siguientes monedas sumen tiempo de 1 en 1
};

// --- PAGOS FÍSICOS (MONEDERO ESP32) ---
exports.procesarPagoFisicoInterno = async (montoMoneda) => {
  try {
    sesionKiosco.saldo_acumulado += montoMoneda;

    if (!sesionKiosco.maquina_id) {
      // Mete moneda sin elegir máquina: Queda como saldo a favor
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', saldo_actual: sesionKiosco.saldo_acumulado });
      return;
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(sesionKiosco.maquina_id);
    if (!maquina) return;

    const maquinaActiva = maquinasEnUso[maquina.id] && maquinasEnUso[maquina.id] > Date.now();

    // ¿Ya juntó los 3 soles requeridos? O ¿La máquina ya está andando y le quiere sumar más tiempo?
    if (sesionKiosco.saldo_acumulado >= sesionKiosco.monto_objetivo || (maquinaActiva && sesionKiosco.saldo_acumulado > 0)) {
      await ejecutarActivacion(maquina, sesionKiosco.saldo_acumulado, 'EFECTIVO');
    } else {
      // PAGÓ 1 SOL PERO FALTAN 2 SOLES. Avisamos a la pantalla.
      exports.notificarClientes({
        status: 'PAGO_INCOMPLETO',
        saldo_actual: sesionKiosco.saldo_acumulado,
        monto_faltante: sesionKiosco.monto_objetivo - sesionKiosco.saldo_acumulado,
        monto_objetivo: sesionKiosco.monto_objetivo
      });
    }
  } catch (error) { console.error('❌ Error en pago físico:', error); }
};

// --- PAGOS DIGITALES (YAPE) ---
exports.recibirWebhookYape = async (req, res) => {
  try {
    let { monto, texto_notificacion } = req.body;

    if (!monto && texto_notificacion) {
      const matchMonto = texto_notificacion.match(/S\/\s*(\d+(\.\d+)?)/i);
      if (matchMonto) { monto = parseFloat(matchMonto[1]); }
    }
    if (!monto || isNaN(monto)) return res.status(400).json({ status: 'ERROR', mensaje: 'Sin monto.' });
    monto = Math.floor(monto);

    sesionKiosco.saldo_acumulado += monto;

    if (!sesionKiosco.maquina_id) {
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', saldo_actual: sesionKiosco.saldo_acumulado });
      return res.json({ status: 'OK', mensaje: 'Crédito pendiente.' });
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(sesionKiosco.maquina_id);
    if (!maquina) return res.status(400).json({ status: 'ERROR', mensaje: 'Máquina inválida.' });

    const maquinaActiva = maquinasEnUso[maquina.id] && maquinasEnUso[maquina.id] > Date.now();

    if (sesionKiosco.saldo_acumulado >= sesionKiosco.monto_objetivo || (maquinaActiva && sesionKiosco.saldo_acumulado > 0)) {
      await ejecutarActivacion(maquina, sesionKiosco.saldo_acumulado, 'YAPE');
    } else {
      exports.notificarClientes({
        status: 'PAGO_INCOMPLETO',
        saldo_actual: sesionKiosco.saldo_acumulado,
        monto_faltante: sesionKiosco.monto_objetivo - sesionKiosco.saldo_acumulado
      });
    }
    res.json({ status: 'OK', mensaje: 'Pago procesado' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// Mantenemos esta ruta por compatibilidad con activaciones directas desde el frontend
exports.activarConCredito = async (req, res) => {
  try {
    const { maquina_id, monto } = req.body;
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR' });
    await ejecutarActivacion(maquina, monto, 'SALDO_WEB');
    res.json({ status: 'OK' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};