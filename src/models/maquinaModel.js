/**
 * MODELO: MaquinaModel
 * Proyecto: Carwash ServiProf
 * Descripción: Operaciones CRUD con borrado lógico (Soft Delete) para máquinas.
 */

const pool = require('../config/database');

class MaquinaModel {
  /**
   * Obtiene todas las máquinas activas de una estación.
   */
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

  /**
   * Obtiene todas las máquinas INACTIVAS (deshabilitadas) de una estación.
   */
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

  /**
   * Crea una nueva máquina vinculada a una estación.
   */
  static async crear({ estacion_id, nombre, segundos_por_sol, pin_hardware }) {
    const query = `
      INSERT INTO maquinas (estacion_id, nombre, segundos_por_sol, pin_hardware)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [estacion_id, nombre, segundos_por_sol, pin_hardware];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  /**
   * Actualiza la tarifa y configuración de una máquina.
   */
  static async actualizar(id, { nombre, segundos_por_sol, pin_hardware }) {
    const query = `
      UPDATE maquinas
      SET nombre = COALESCE($1, nombre),
          segundos_por_sol = COALESCE($2, segundos_por_sol),
          pin_hardware = COALESCE($3, pin_hardware)
      WHERE id = $4 AND estado = 'A'
      RETURNING *
    `;
    const values = [nombre, segundos_por_sol, pin_hardware, id];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  /**
   * Aplica Borrado Lógico cambiando el estado a 'I' (Inactivo).
   */
  static async deshabilitar(id) {
    const query = `
      UPDATE maquinas
      SET estado = 'I'
      WHERE id = $1
      RETURNING id, nombre, estado
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }

  /**
   * Restaura una máquina previamente deshabilitada cambiando el estado a 'A' (Activo).
   */
  static async rehabilitar(id) {
    const query = `
      UPDATE maquinas
      SET estado = 'A'
      WHERE id = $1
      RETURNING id, nombre, estado
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }
}

module.exports = MaquinaModel;