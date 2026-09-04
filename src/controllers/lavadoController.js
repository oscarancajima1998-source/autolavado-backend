/**
 * CONTROLADOR: LavadoController
 * Proyecto: Carwash ServiProf
 */

const VentaModel = require('../models/ventaModel');
const MaquinaModel = require('../models/maquinaModel');
const ClienteModel = require('../models/clienteModel');
const YapeLogModel = require('../models/yapeLogModel');

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
  sesionKiosco.monto_objetivo = monto || 1; 

  res.json({ 
    status: 'OK', 
    mensaje: `Máquina ${maquina_id} lista. Objetivo: S/ ${sesionKiosco.monto_objetivo}.00`,
    saldo_actual: sesionKiosco.saldo_acumulado 
  });

  if (sesionKiosco.saldo_acumulado > 0) {
    exports.procesarPagoFisicoInterno(0);
  }
};

// --- LÓGICA MAESTRA DE ACTIVACIÓN Y EXTENSIÓN DE TIEMPO (DRY) ---
const ejecutarActivacion = async (maquina, montoUsado, metodoPago) => {
  const tiempo_otorgado_seg = Math.round((montoUsado / 1.00) * maquina.segundos_por_sol);
  const maquinaActiva = maquinasEnUso[maquina.id] && maquinasEnUso[maquina.id] > Date.now();

  await VentaModel.crearVenta({
    estacion_id: maquina.estacion_id,
    maquina_id: maquina.id,
    monto: montoUsado,
    metodo_pago: metodoPago,
    tiempo_otorgado_seg
  });

  let tiempoRestanteTotal = tiempo_otorgado_seg;
  if (maquinaActiva) {
    maquinasEnUso[maquina.id] += (tiempo_otorgado_seg * 1000); 
    tiempoRestanteTotal = Math.ceil((maquinasEnUso[maquina.id] - Date.now()) / 1000);
  } else {
    exports.iniciarTemporizador(maquina.id, tiempo_otorgado_seg);
  }

  const mqttClient = require('../services/mqttService');
  const payload = JSON.stringify({
    maquina_id: maquina.id,
    nombre_maquina: maquina.nombre,
    tiempo_seg: tiempoRestanteTotal,
    pin_hardware: maquina.pin_hardware
  });
  mqttClient.publish('autolavado/estacion/1/activar', payload);

  exports.notificarClientes({
    status: 'PAGO_CONFIRMADO',
    maquina_nombre: maquina.nombre,
    monto_recibido: montoUsado,
    tiempo_seg: tiempoRestanteTotal,
    es_extension: maquinaActiva
  });

  sesionKiosco.saldo_acumulado = 0;
  sesionKiosco.monto_objetivo = 1; 
};

// --- PAGOS FÍSICOS (MONEDERO ESP32) ---
exports.procesarPagoFisicoInterno = async (montoMoneda) => {
  try {
    sesionKiosco.saldo_acumulado += montoMoneda;

    if (!sesionKiosco.maquina_id) {
      exports.notificarClientes({ status: 'CREDITO_PENDIENTE', saldo_actual: sesionKiosco.saldo_acumulado });
      return;
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(sesionKiosco.maquina_id);
    if (!maquina) return;

    const maquinaActiva = maquinasEnUso[maquina.id] && maquinasEnUso[maquina.id] > Date.now();

    if (sesionKiosco.saldo_acumulado >= sesionKiosco.monto_objetivo || (maquinaActiva && sesionKiosco.saldo_acumulado > 0)) {
      await ejecutarActivacion(maquina, sesionKiosco.saldo_acumulado, 'EFECTIVO');
    } else {
      exports.notificarClientes({
        status: 'PAGO_INCOMPLETO',
        saldo_actual: sesionKiosco.saldo_acumulado,
        monto_faltante: sesionKiosco.monto_objetivo - sesionKiosco.saldo_acumulado,
        monto_objetivo: sesionKiosco.monto_objetivo
      });
    }
  } catch (error) { console.error('Error en pago físico:', error); }
};

// --- PAGOS DIGITALES (YAPE) ---
exports.recibirWebhookYape = async (req, res) => {
  try {
    console.log("🔔 [WEBHOOK YAPE RECIBIDO]:", req.body);

    let { monto, texto_notificacion } = req.body;
    const textoCrudo = texto_notificacion || JSON.stringify(req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
       console.log("❌ ERROR: El JSON llegó vacío o mal formado desde MacroDroid.");
       await YapeLogModel.registrar("JSON VACÍO O MAL FORMADO", 0, "ERROR_JSON");
       return res.status(400).json({ status: 'ERROR', mensaje: 'JSON vacío.' });
    }

    if (!monto && texto_notificacion) {
      const matchMonto = texto_notificacion.match(/S\/\s*(\d+(\.\d+)?)/i);
      if (matchMonto) { monto = parseFloat(matchMonto[1]); }
    }
    
    if (!monto || isNaN(monto)) {
      console.log("❌ ERROR: No se detectó un monto en el texto:", texto_notificacion);
      await YapeLogModel.registrar(textoCrudo, 0, "SIN_MONTO");
      return res.status(400).json({ status: 'ERROR', mensaje: 'Sin monto.' });
    }
    
    monto = Math.floor(monto);
    await YapeLogModel.registrar(textoCrudo, monto, "PROCESADO");

    sesionKiosco.saldo_acumulado += monto;
    console.log(`✅ Monto extraído: S/ ${monto}. Saldo en kiosco: S/ ${sesionKiosco.saldo_acumulado}`);

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
  } catch (error) { 
    console.error("❌ ERROR CRÍTICO EN WEBHOOK:", error);
    res.status(500).json({ status: 'ERROR', error: error.message }); 
  }
};

// --- OBTENER HISTORIAL PARA EL DASHBOARD ---
exports.obtenerHistorialYape = async (req, res) => {
  try {
    const { inicio, fin } = req.query; // <-- Parámetros de fecha extraídos de la URL
    const logs = await YapeLogModel.listar(inicio, fin);
    res.json({ status: 'OK', data: logs });
  } catch (error) { 
    res.status(500).json({ status: 'ERROR', error: error.message }); 
  }
};

// --- ACTIVACIÓN VÍA KIOSCO (Cortesía o Saldo Web) ---
exports.activarConCredito = async (req, res) => {
  try {
    const { maquina_id, monto } = req.body;
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR' });
    await ejecutarActivacion(maquina, monto, 'SALDO_WEB');
    res.json({ status: 'OK' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// --- REPORTE DE FALLAS ---
exports.reportarFalla = (req, res) => {
  const { maquina_nombre } = req.body;
  exports.notificarClientes({ status: 'ALERTA_SOPORTE', maquina_nombre });
  res.json({ status: 'OK' });
};

// ========================================================
// FUNCIONES: CLIENTES PREPAGO Y ARRANQUE PARCIAL
// ========================================================

exports.consultarCliente = async (req, res) => {
  try {
    const cliente = await ClienteModel.buscarPorDni(req.params.dni);
    if (!cliente) return res.status(404).json({ status: 'ERROR', error: 'DNI no registrado o inactivo' });
    res.json({ status: 'OK', data: cliente });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.pagarConSaldoCliente = async (req, res) => {
  try {
    const { dni } = req.body;
    if (!sesionKiosco.maquina_id) return res.status(400).json({ status: 'ERROR', error: 'Seleccione máquina primero' });

    const cliente = await ClienteModel.buscarPorDni(dni);
    if (!cliente) return res.status(404).json({ status: 'ERROR', error: 'DNI no registrado o inactivo' });

    let saldoActual = parseFloat(cliente.saldo);
    
    if (saldoActual <= 0) {
      return res.status(400).json({ status: 'ERROR', error: 'TU SALDO ES INSUFICIENTE. CONTÁCTATE CON EL ADMINISTRADOR Y RECARGA.' });
    }

    let montoAcobrar = sesionKiosco.monto_objetivo;
    if (saldoActual < montoAcobrar) { montoAcobrar = saldoActual; }

    await ClienteModel.actualizarSaldo(cliente.id, montoAcobrar, 'RESTA');
    const maquina = await VentaModel.obtenerMaquinaPorId(sesionKiosco.maquina_id);
    
    await ejecutarActivacion(maquina, montoAcobrar, 'SALDO_PREPAGO');
    exports.notificarClientes({ status: 'CLIENTE_ACTUALIZADO' });

    res.json({ status: 'OK', cliente: cliente.nombres, nuevo_saldo: saldoActual - montoAcobrar });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.arranqueParcial = async (req, res) => {
  try {
    if (!sesionKiosco.maquina_id || sesionKiosco.saldo_acumulado <= 0) {
      return res.status(400).json({ status: 'ERROR', error: 'No hay saldo acumulado para arrancar' });
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(sesionKiosco.maquina_id);
    const montoIngresado = sesionKiosco.saldo_acumulado;
    
    await ejecutarActivacion(maquina, montoIngresado, 'EFECTIVO_PARCIAL');
    res.json({ status: 'OK', mensaje: 'Arranque forzado con saldo parcial' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};