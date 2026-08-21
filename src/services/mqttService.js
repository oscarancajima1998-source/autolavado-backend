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
});

client.on('error', (err) => {
  console.error('❌ Error en la conexión MQTT:', err.message);
});

module.exports = client;