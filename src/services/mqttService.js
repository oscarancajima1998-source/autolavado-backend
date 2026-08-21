const mqtt = require('mqtt');
require('dotenv').config();

// 1. Detecta si hay una URL en la nube (Render) o usa tu Mosquitto local
const mqttUrl = process.env.MQTT_HOST || 'mqtt://localhost:1883';
const opciones = {};

// 2. Si detecta que creaste un usuario en Render, se lo agrega a la conexión
if (process.env.MQTT_USER) {
  opciones.username = process.env.MQTT_USER;
  opciones.password = process.env.MQTT_PASS;
}

// 3. Intenta conectarse usando la URL y las opciones (si las hay)
const client = mqtt.connect(mqttUrl, opciones);

client.on('connect', () => {
  console.log('📡 Conectado exitosamente al Broker MQTT');
});

client.on('error', (err) => {
  console.error('❌ Error en la conexión MQTT:', err.message);
});

module.exports = client;