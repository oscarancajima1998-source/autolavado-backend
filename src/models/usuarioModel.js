/**
 * MODELO: UsuarioModel
 * Proyecto: Carwash Servipro
 * Descripción: Métodos para la gestión de usuarios y autenticación.
 */

const pool = require('../config/database');

class UsuarioModel {
  /**
   * Busca un usuario activo por su correo electrónico.
   */
  static async buscarPorEmail(email) {
    const query = `
      SELECT u.id, u.empresa_id, u.nombre, u.email, u.password_hash, u.rol, e.nombre as empresa_nombre
      FROM usuarios u
      JOIN empresas e ON u.empresa_id = e.id
      WHERE u.email = $1 AND u.estado = 'A' AND e.estado = 'A'
    `;
    const { rows } = await pool.query(query, [email]);
    return rows[0] || null;
  }

  /**
   * Registra un nuevo usuario en la base de datos.
   */
  static async crear({ empresa_id, nombre, email, password_hash, rol = 'ADMIN' }) {
    const query = `
      INSERT INTO empresas (id, nombre, estado) VALUES (1, 'Servipro Central', 'A') ON CONFLICT (id) DO NOTHING;
      INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, empresa_id, nombre, email, rol, fecha_creacion
    `;
    const values = [empresa_id, nombre, email, password_hash, rol];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }
}

module.exports = UsuarioModel;