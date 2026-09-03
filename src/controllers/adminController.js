/**
 * CONTROLADOR: adminController
 * Maneja el Dashboard, Login, Reportes y Control Manual de Máquinas
 * Sincronizado con MaquinaModel y VentaModel
 */

const jwt = require('jsonwebtoken');
const mqttClient = require('../services/mqttService');
const lavadoController = require('./lavadoController');
const VentaModel = require('../models/ventaModel');
const MaquinaModel = require('../models/maquinaModel');

// =======================================================
// 1. AUTENTICACIÓN
// =======================================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Autenticación administrativa por defecto (puedes conectarla a BD luego)
    if ((email === 'admin@serviprof.com' || email === 'admin') && password === 'admin123') { 
      const token = jwt.sign(
        { id: 1, rol: 'ADMIN' }, 
        process.env.JWT_SECRET || 'serviprof_secret_key_2026', 
        { expiresIn: '8h' }
      );
      return res.json({ 
        status: 'OK', 
        data: { token, usuario: { nombre: 'Administrador', empresa: 'ServiProf' } } 
      });
    }
    
    res.status(401).json({ status: 'ERROR', error: 'Credenciales inválidas' });
  } catch (error) { 
    console.error('Error en Login:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error interno del servidor' }); 
  }
};

exports.perfil = (req, res) => {
  // Retorna los datos del token decodificado por el middleware
  res.json({ status: 'OK', usuario: req.usuario });
};

// =======================================================
// 2. REPORTES Y DASHBOARD
// =======================================================
exports.obtenerReportesEstacion = async (req, res) => {
  try {
    const estacionId = 1; // Asumimos estación 1 por ahora
    const { inicio, fin } = req.query;

    // Validar que vengan las fechas, si no, usar la fecha de hoy
    const fechaInicio = inicio || new Date().toISOString().split('T')[0];
    const fechaFin = fin || new Date().toISOString().split('T')[0];

    // Llama a la función del modelo de ventas que maneja los filtros de fecha
    const reporteAvanzado = await VentaModel.obtenerReporteAvanzado(estacionId, fechaInicio, fechaFin);
    
    res.json({ status: 'OK', data: reporteAvanzado });
  } catch (error) { 
    console.error('Error al obtener reportes:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al generar el reporte' }); 
  }
};

// =======================================================
// 3. GESTIÓN DE MÁQUINAS (CRUD)
// =======================================================
exports.listarMaquinas = async (req, res) => {
  try {
    const estacionId = 1;
    const maquinas = await MaquinaModel.obtenerPorEstacion(estacionId);
    res.json({ status: 'OK', data: maquinas });
  } catch (error) { 
    console.error('Error al listar máquinas:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al obtener máquinas' }); 
  }
};

exports.listarMaquinasInactivas = async (req, res) => {
  try {
    const estacionId = 1;
    const maquinas = await MaquinaModel.obtenerInactivasPorEstacion(estacionId);
    res.json({ status: 'OK', data: maquinas });
  } catch (error) { 
    console.error('Error al listar máquinas inactivas:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al obtener máquinas inactivas' }); 
  }
};

exports.crearMaquina = async (req, res) => {
  try {
    const { nombre, segundos_por_sol, pin_hardware } = req.body;
    
    if (!nombre || !segundos_por_sol || !pin_hardware) {
      return res.status(400).json({ status: 'ERROR', error: 'Faltan datos obligatorios' });
    }

    const payload = {
      estacion_id: 1, // Por defecto estación 1
      nombre,
      segundos_por_sol: parseInt(segundos_por_sol),
      pin_hardware: parseInt(pin_hardware)
    };

    const nuevaMaquina = await MaquinaModel.crear(payload);
    res.json({ status: 'OK', data: nuevaMaquina });
  } catch (error) { 
    console.error('Error al crear máquina:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al registrar la máquina' }); 
  }
};

exports.actualizarMaquina = async (req, res) => {
  try {
    const id = req.params.id;
    const { nombre, segundos_por_sol, pin_hardware } = req.body;
    
    await MaquinaModel.actualizar(id, { 
      nombre, 
      segundos_por_sol: segundos_por_sol ? parseInt(segundos_por_sol) : undefined, 
      pin_hardware: pin_hardware ? parseInt(pin_hardware) : undefined
    });
    
    res.json({ status: 'OK', mensaje: 'Máquina actualizada correctamente' });
  } catch (error) { 
    console.error('Error al actualizar máquina:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al actualizar la máquina' }); 
  }
};

exports.ocultarMaquina = async (req, res) => {
  try {
    const id = req.params.id;
    await MaquinaModel.deshabilitar(id);
    res.json({ status: 'OK', mensaje: 'Máquina inhabilitada correctamente' });
  } catch (error) { 
    console.error('Error al ocultar máquina:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al ocultar la máquina' }); 
  }
};

exports.restaurarMaquina = async (req, res) => {
  try {
    const id = req.params.id;
    await MaquinaModel.rehabilitar(id);
    res.json({ status: 'OK', mensaje: 'Máquina rehabilitada correctamente' });
  } catch (error) { 
    console.error('Error al restaurar máquina:', error);
    res.status(500).json({ status: 'ERROR', error: 'Error al restaurar la máquina' }); 
  }
};

// =======================================================
// 4. CONTROL MANUAL Y MQTT
// =======================================================
exports.activarManual = async (req, res) => {
  try {
    const { maquina_id, monto } = req.body;
    
    if (!maquina_id || !monto || monto <= 0) {
      return res.status(400).json({ status: 'ERROR', error: 'Monto y máquina son obligatorios' });
    }

    // 1. Obtenemos la info del hardware de la BD
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada o inactiva' });

    // 2. Calculamos los segundos
    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    
    // 3. Registrar la venta en la base de datos como "MANUAL"
    await VentaModel.crearVenta({ 
      estacion_id: maquina.estacion_id, 
      maquina_id: maquina.id, 
      monto, 
      metodo_pago: 'MANUAL', 
      tiempo_otorgado_seg 
    });

    // 4. Enviar orden de ENCENDIDO al ESP32 por MQTT
    const payload = JSON.stringify({ 
      maquina_id: maquina.id, 
      nombre_maquina: maquina.nombre, 
      tiempo_seg: tiempo_otorgado_seg, 
      pin_hardware: maquina.pin_hardware 
    });
    
    mqttClient.publish('autolavado/estacion/1/activar', payload, (err) => {
      if (err) console.error('Error enviando mensaje MQTT:', err);
    });

    // 5. Iniciar reloj de cuenta regresiva en el Dashboard via SSE
    lavadoController.iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    
    res.json({ status: 'OK', mensaje: 'Máquina activada exitosamente' });
  } catch (error) { 
    console.error('Error en activación manual:', error);
    res.status(500).json({ status: 'ERROR', error: 'Fallo al activar la máquina remotamente' }); 
  }
};

exports.detenerManual = async (req, res) => {
  try {
    const { maquina_id } = req.body;
    
    if (!maquina_id) {
      return res.status(400).json({ status: 'ERROR', error: 'ID de máquina obligatorio' });
    }

    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada' });

    // 1. Enviar tiempo "0" al ESP32 para forzar el APAGADO
    const payload = JSON.stringify({ 
      maquina_id: maquina.id, 
      nombre_maquina: maquina.nombre, 
      tiempo_seg: 0, 
      pin_hardware: maquina.pin_hardware 
    });
    
    mqttClient.publish('autolavado/estacion/1/activar', payload, (err) => {
      if (err) console.error('Error enviando parada por MQTT:', err);
    });

    // 2. Detener temporizador en la memoria del servidor (SSE)
    lavadoController.detenerTemporizador(maquina.id);
    
    res.json({ status: 'OK', mensaje: 'Máquina detenida forzosamente' });
  } catch (error) { 
    console.error('Error al detener máquina:', error);
    res.status(500).json({ status: 'ERROR', error: 'Fallo al detener la máquina' }); 
  }
};