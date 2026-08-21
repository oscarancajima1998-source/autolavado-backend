/**
 * MODELO: VentaModel
 * Proyecto: Carwash ServiProf
 * Descripción: Registro de ingresos y reportes estadísticos.
 */

const pool = require('../config/database');

class VentaModel {
  static async obtenerMaquinaPorId(id) {
    const query = `SELECT * FROM maquinas WHERE id = $1 AND estado = 'A'`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }

  static async crearVenta({ estacion_id, maquina_id, monto, metodo_pago, tiempo_otorgado_seg }) {
    const query = `
      INSERT INTO ventas (estacion_id, maquina_id, monto, metodo_pago, tiempo_otorgado_seg)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [estacion_id, maquina_id, monto, metodo_pago, tiempo_otorgado_seg];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  static async obtenerResumenDashboard(estacionId) {
    const query = `
      SELECT 
        COALESCE(SUM(monto), 0) as ingresos_totales,
        COUNT(id) as usos_totales,
        COALESCE(SUM(CASE WHEN DATE(fecha_creacion) = CURRENT_DATE THEN monto ELSE 0 END), 0) as ingresos_hoy,
        SUM(CASE WHEN DATE(fecha_creacion) = CURRENT_DATE THEN 1 ELSE 0 END) as usos_hoy
      FROM ventas
      WHERE estacion_id = $1
    `;
    const { rows } = await pool.query(query, [estacionId]);
    return { totales: rows[0] };
  }

  static async obtenerReporteAvanzado(estacionId, fechaInicio, fechaFin) {
    const queryTotales = `
      SELECT COALESCE(SUM(monto), 0) as ingresos, COUNT(id) as usos
      FROM ventas
      WHERE estacion_id = $1 AND DATE(fecha_creacion) >= $2 AND DATE(fecha_creacion) <= $3
    `;
    
    const queryRanking = `
      SELECT m.nombre, COUNT(v.id) as usos, COALESCE(SUM(v.monto), 0) as recaudado
      FROM ventas v
      JOIN maquinas m ON v.maquina_id = m.id
      WHERE v.estacion_id = $1 AND DATE(v.fecha_creacion) >= $2 AND DATE(v.fecha_creacion) <= $3
      GROUP BY m.id, m.nombre
      ORDER BY usos DESC
    `;

    const [resTotales, resRanking] = await Promise.all([
      pool.query(queryTotales, [estacionId, fechaInicio, fechaFin]),
      pool.query(queryRanking, [estacionId, fechaInicio, fechaFin])
    ]);

    return {
      totales: resTotales.rows[0],
      ranking_maquinas: resRanking.rows
    };
  }
}

module.exports = VentaModel;