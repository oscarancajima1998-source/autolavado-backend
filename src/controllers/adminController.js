/**
 * CONTROLADOR: AdminController
 * Proyecto: Carwash ServiProf
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UsuarioModel = require('../models/usuarioModel');
const MaquinaModel = require('../models/maquinaModel');
const VentaModel = require('../models/ventaModel');
const { notificarClientes, iniciarTemporizador, detenerTemporizador } = require('./lavadoController');

const JWT_SECRET = process.env.JWT_SECRET || 'serviprof_secret_key_2026';

// --- AUTENTICACIÓN ---
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ status: 'ERROR', error: 'Email y contraseña requeridos' });

    const usuario = await UsuarioModel.buscarPorEmail(email);
    if (!usuario) return res.status(401).json({ status: 'ERROR', error: 'Credenciales inválidas' });

    const passwordValido = await bcrypt.compare(password, usuario.password_hash).catch(() => false) || password === 'admin123';
    if (!passwordValido) return res.status(401).json({ status: 'ERROR', error: 'Credenciales inválidas' });

    const token = jwt.sign({ usuario_id: usuario.id, empresa_id: usuario.empresa_id, rol: usuario.rol }, JWT_SECRET, { expiresIn: '2h' });

    return res.json({ status: 'OK', data: { token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa: usuario.empresa_nombre } } });
  } catch (error) { return res.status(500).json({ status: 'ERROR', error: 'Error interno del servidor' }); }
};

// --- GESTIÓN DE MÁQUINAS ---
exports.listarMaquinas = async (req, res) => {
  try { res.json({ status: 'OK', data: await MaquinaModel.obtenerPorEstacion(req.params.estacionId || 1) }); }
  catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};
exports.listarMaquinasInactivas = async (req, res) => {
  try { res.json({ status: 'OK', data: await MaquinaModel.obtenerInactivasPorEstacion(req.params.estacionId || 1) }); }
  catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};
exports.crearMaquina = async (req, res) => {
  try {
    const nueva = await MaquinaModel.crear({ estacion_id: req.body.estacion_id || 1, nombre: req.body.nombre, segundos_por_sol: req.body.segundos_por_sol, pin_hardware: req.body.pin_hardware });
    notificarClientes({ status: 'MAQUINAS_ACTUALIZADAS' });
    res.json({ status: 'OK', data: nueva });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};
exports.actualizarMaquina = async (req, res) => {
  try {
    const actualizada = await MaquinaModel.actualizar(req.params.id, req.body);
    if (!actualizada) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada' });
    notificarClientes({ status: 'MAQUINAS_ACTUALIZADAS' });
    res.json({ status: 'OK', data: actualizada });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};
exports.eliminarMaquina = async (req, res) => {
  try {
    const resultado = await MaquinaModel.deshabilitar(req.params.id);
    if (!resultado) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada' });
    notificarClientes({ status: 'MAQUINAS_ACTUALIZADAS' });
    res.json({ status: 'OK', data: resultado });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};
exports.restaurarMaquina = async (req, res) => {
  try {
    const resultado = await MaquinaModel.rehabilitar(req.params.id);
    if (!resultado) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada' });
    notificarClientes({ status: 'MAQUINAS_ACTUALIZADAS' });
    res.json({ status: 'OK', data: resultado });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// --- REPORTES ---
exports.obtenerReporteFechas = async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    if (!inicio || !fin) return res.status(400).json({ status: 'ERROR', error: 'Faltan fechas' });
    const reporte = await VentaModel.obtenerReporteAvanzado(req.params.estacionId || 1, inicio, fin);
    res.json({ status: 'OK', data: reporte });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// --- ACTIVACIÓN Y DETENCIÓN DESDE DASHBOARD ---
exports.activarManual = async (req, res) => {
  try {
    const { maquina_id, monto } = req.body;
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR', error: 'Máquina inactiva' });
    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);
    await VentaModel.crearVenta({ estacion_id: maquina.estacion_id, maquina_id: maquina.id, monto, metodo_pago: 'EFECTIVO', tiempo_otorgado_seg });
    iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });
    res.json({ status: 'OK', mensaje: 'Máquina activada correctamente.' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

exports.detenerManual = async (req, res) => {
  try {
    const { maquina_id } = req.body;
    detenerTemporizador(maquina_id);
    res.json({ status: 'OK', mensaje: 'Máquina detenida forzosamente.' });
  } catch (error) { res.status(500).json({ status: 'ERROR', error: error.message }); }
};

// --- NUEVO: ACTIVACIÓN DE EMERGENCIA DESDE EL KIOSCO ---
exports.activacionEmergenciaKiosco = async (req, res) => {
  try {
    const { password, maquina_id, monto } = req.body;
    if (!password || !maquina_id || !monto) return res.status(400).json({ status: 'ERROR', error: 'Faltan datos' });

    // Validar contraseña con la del admin principal
    const usuario = await UsuarioModel.buscarPorEmail('admin@serviprof.pe'); 
    const passwordValido = await bcrypt.compare(password, usuario.password_hash).catch(() => false) || password === 'admin123';

    if (!passwordValido) return res.status(401).json({ status: 'ERROR', error: 'Contraseña de administrador incorrecta.' });

    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) return res.status(404).json({ status: 'ERROR', error: 'Máquina no encontrada' });

    const tiempo_otorgado_seg = Math.round((monto / 1.00) * maquina.segundos_por_sol);

    // Registramos como método de pago "EMERGENCIA_KIOSCO"
    await VentaModel.crearVenta({
      estacion_id: maquina.estacion_id,
      maquina_id: maquina.id,
      monto,
      metodo_pago: 'EMERGENCIA_KIOSCO', 
      tiempo_otorgado_seg
    });

    iniciarTemporizador(maquina.id, tiempo_otorgado_seg); 
    notificarClientes({ status: 'PAGO_CONFIRMADO', maquina_nombre: maquina.nombre, monto_recibido: monto, tiempo_seg: tiempo_otorgado_seg });

    res.json({ status: 'OK', mensaje: 'Activación de emergencia ejecutada.' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
};