/**
 * MODELO: MaquinaModel
 * Proyecto: Carwash Servipro
 */

const pool = require('../config/database');

class MaquinaModel {
  static async obtenerPorEstacion(estacionId) {
    const query = `
      SELECT id, nombre, segundos_por_sol, pin_hardware, fecha_creacion
      FROM maquinas
      WHERE estacion_id = $1 AND estado = 'A'
      ORDER BY id ASC
    `;
    const { rows } = await pool.query(query, [estacionId]);
    return rows;
  }

  static async obtenerInactivasPorEstacion(estacionId) {
    const query = `
      SELECT id, nombre, segundos_por_sol, pin_hardware, fecha_creacion
      FROM maquinas
      WHERE estacion_id = $1 AND estado = 'I'
      ORDER BY id ASC
    `;
    const { rows } = await pool.query(query, [estacionId]);
    return rows;
  }

  // --- CORRECCIÓN AQUÍ: Agregamos 'estado' explícitamente ---
  static async crear({ estacion_id, nombre, segundos_por_sol, pin_hardware }) {
    const query = `
      INSERT INTO maquinas (estacion_id, nombre, segundos_por_sol, pin_hardware, estado)
      VALUES ($1, $2, $3, $4, 'A')
      RETURNING *
    `;
    const values = [estacion_id, nombre, segundos_por_sol, pin_hardware];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  static async actualizar(id, { nombre, segundos_por_sol, pin_hardware }) {
    const query = `
      UPDATE maquinas
      SET nombre = COALESCE($1, nombre),
          segundos_por_sol = COALESCE($2, segundos_por_sol),
          pin_hardware = COALESCE($3, pin_hardware)
      WHERE id = $4
      RETURNING *
    `;
    const values = [nombre, segundos_por_sol, pin_hardware, id];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  static async deshabilitar(id) {
    const query = `UPDATE maquinas SET estado = 'I' WHERE id = $1 RETURNING id, nombre, estado`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }

  static async rehabilitar(id) {
    const query = `UPDATE maquinas SET estado = 'A' WHERE id = $1 RETURNING id, nombre, estado`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }
}

module.exports = MaquinaModel;