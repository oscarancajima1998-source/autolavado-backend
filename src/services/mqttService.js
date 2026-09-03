const mqtt = require('mqtt');
require('dotenv').config();

const mqttUrl = process.env.MQTT_HOST || 'mqtt://localhost:1883';
const opciones = {};

// --- MODO ESPÍA ACTIVADO ---
console.log('🔍 [DEBUG] Intentando conectar a:', mqttUrl);
console.log('🔍 [DEBUG] Usuario configurado:', process.env.MQTT_USER ? process.env.MQTT_USER : 'NINGUNO (¡Aquí está el error!)');
// ---------------------------

if (process.env.MQTT_USER) {
  opciones.username = process.env.MQTT_USER;
  opciones.password = process.env.MQTT_PASS;
}

const client = mqtt.connect(mqttUrl, opciones);

client.on('connect', () => {
  console.log('📡 Conectado exitosamente al Broker MQTT');
  
  // Suscribirse al canal donde el ESP32 reporta el dinero físico de las monedas
  client.subscribe('autolavado/estacion/1/pago_fisico', (err) => {
    if (!err) {
      console.log('👂 Escuchando pagos físicos del monedero en la estación 1');
    } else {
      console.error('❌ Error al suscribirse al tema de pago físico:', err);
    }
  });
});

// Capturar los mensajes que llegan desde el ESP32
client.on('message', async (topic, message) => {
  if (topic === 'autolavado/estacion/1/pago_fisico') {
    try {
      const data = JSON.parse(message.toString());
      console.log(`💰 Dinero físico detectado desde la placa: S/ ${data.monto}.00`);
      
      // Aquí puedes integrar la misma lógica de negocio que usas para el Yape 
      // (notificar por SSE, registrar crédito pendiente, etc.)
      
    } catch (e) {
      console.error('❌ Error al procesar mensaje MQTT físico:', e);
    }
  }
});

client.on('error', (err) => {
  console.error('❌ Error en la conexión MQTT:', err.message);
});

module.exports = client;