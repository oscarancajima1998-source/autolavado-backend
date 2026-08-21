const mqtt = require('mqtt');
require('dotenv').config();

const client = mqtt.connect(process.env.MQTT_HOST || 'mqtt://localhost');

client.on('connect', () => {
  console.log('📡 Conectado exitosamente al Broker MQTT (Mosquitto)');
});

client.on('error', (err) => {
  console.error('❌ Error en la conexión MQTT:', err.message);
});

module.exports = client;