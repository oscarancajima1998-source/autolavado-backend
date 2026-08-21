/**
 * SERVICIO: LavadoService
 * Proyecto: Carwash ServiProf
 * Descripción: Maneja la lógica de negocio para la selección de máquinas,
 * procesamiento de pagos y activación por MQTT.
 */

const VentaModel = require('../models/ventaModel');
const mqttClient = require('./mqttService');

// Estado temporal en memoria para rastrear la máquina activa en el Kiosco
let estadoEstacion = {
  maquina_id_seleccionada: null, // null = El usuario no ha tocado la pantalla
  monto_seleccionado: 1
};

class LavadoService {
  
  /**
   * Registra la máquina seleccionada previamente por el usuario en la pantalla.
   * @param {number|null} maquinaId - ID de la máquina seleccionada
   */
  static seleccionarMaquina(maquinaId) {
    estadoEstacion.maquina_id_seleccionada = maquinaId ? parseInt(maquinaId, 10) : null;
    console.log(`📌 [Estado Kiosco] Máquina pre-seleccionada: #${estadoEstacion.maquina_id_seleccionada}`);
  }

  /**
   * Procesa la venta, registra en PostgreSQL y emite la orden de encendido por MQTT.
   */
  static async procesarLavado({ estacion_id, maquina_id, monto, metodo_pago }) {
    // 1. Obtener los datos de configuración de la máquina seleccionada
    const maquina = await VentaModel.obtenerMaquinaPorId(maquina_id);
    if (!maquina) throw new Error('MAQUINA_NO_ENCONTRADA');

    // 2. Calcular el tiempo total a otorgar (Monto * Tiempo configurado por S/)
    const tiempoOtorgadoSeg = monto * maquina.segundos_por_sol;

    // 3. Registrar la transacción en la Base de Datos para reportes
    const venta = await VentaModel.crearVenta({
      estacion_id,
      maquina_id,
      monto,
      metodo_pago,
      tiempo_otorgado_seg: tiempoOtorgadoSeg
    });

    // 4. Construir y enviar el payload por MQTT al hardware (ESP32)
    const topic = `autolavado/estacion/${estacion_id}/activar`;
    const payload = JSON.stringify({
      maquina_id: maquina.id,
      nombre_maquina: maquina.nombre,
      tiempo_seg: tiempoOtorgadoSeg
    });

    mqttClient.publish(topic, payload);
    console.log(`📡 [MQTT] Orden de activación enviada a [${topic}]:`, payload);

    // 5. Limpiar la selección de la pantalla para el próximo cliente
    estadoEstacion.maquina_id_seleccionada = null;

    return { venta, tiempoOtorgadoSeg, maquina_nombre: maquina.nombre };
  }

  /**
   * Procesa las notificaciones recibidas de Yape mediante el Webhook de MacroDroid.
   */
  static async procesarWebhookYape(textoNotificacion) {
    // Extraer el monto de la notificación usando Expresiones Regulares (Regex)
    const matchMonto = textoNotificacion.match(/S\/\s*(\d+(\.\d+)?)/i);
    if (!matchMonto) throw new Error('FORMATO_MONTO_INVALIDO');

    const montoOriginal = parseFloat(matchMonto[1]);
    if (montoOriginal < 1.00) {
      throw new Error(`MONTO_INSUFFICIENTE: Se recibió S/ ${montoOriginal.toFixed(2)}, mínimo S/ 1.00`);
    }

    // Redondear hacia abajo a soles enteros (ej: S/ 2.50 -> S/ 2.00)
    const montoReal = Math.floor(montoOriginal);

    // ESCENARIO A: El cliente seleccionó una máquina en pantalla antes de pagar
    if (estadoEstacion.maquina_id_seleccionada) {
      const maquinaAUsar = estadoEstacion.maquina_id_seleccionada;
      console.log(`💰 [Yape] Pago recibido con máquina previa (#${maquinaAUsar}): S/ ${montoReal}.00`);

      const resultado = await this.procesarLavado({
        estacion_id: 1,
        maquina_id: maquinaAUsar,
        monto: montoReal,
        metodo_pago: 'YAPE_AUTO'
      });

      return { tipo: 'ACTIVACION_DIRECTA', resultado };
    } 
    // ESCENARIO B: El cliente Yapeó de frente sin tocar la pantalla (Crédito Pendiente)
    else {
      console.log(`💰 [Yape] Pago sin máquina previa: S/ ${montoReal}.00 -> Solicitando selección en Kiosco`);
      
      return { 
        tipo: 'CREDITO_PENDIENTE', 
        monto: montoReal 
      };
    }
  }
}

module.exports = LavadoService;