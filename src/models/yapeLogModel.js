/**
 * MODELO: YapeLogModel
 * Proyecto: Carwash ServiProf
 */

const pool = require('../config/database');

class YapeLogModel {
  // Ahora recibe codigo_operacion como cuarto parámetro
  static async registrar(texto, monto, estado, codigo_operacion = null) {
    try {
      const query = `INSERT INTO historial_yape (texto_notificacion, monto_detectado, estado, codigo_operacion) VALUES ($1, $2, $3, $4) RETURNING *`;
      const values = [texto, monto || 0, estado, codigo_operacion];
      const { rows } = await pool.query(query, values);
      return rows[0];
    } catch (error) {
      console.error("Error al registrar log de Yape en BD:", error);
    }
  }

  static async listar(fechaInicio, fechaFin) {
    try {
      let query = `SELECT * FROM historial_yape`;
      let values = [];
      let conditions = [];

      if (fechaInicio) {
        conditions.push(`fecha >= $${values.length + 1}`);
        values.push(`${fechaInicio} 00:00:00`);
      }
      if (fechaFin) {
        conditions.push(`fecha <= $${values.length + 1}`);
        values.push(`${fechaFin} 23:59:59`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }

      query += ` ORDER BY fecha DESC LIMIT 1000`;

      const { rows } = await pool.query(query, values);
      return rows;
    } catch (error) {
      console.error("Error al listar logs de Yape:", error);
      return [];
    }
  }
}

module.exports = YapeLogModel;