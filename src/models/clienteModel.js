const pool = require('../config/database');

class ClienteModel {
  static async crear({ dni, nombres, apellidos, celular, tipo_vehiculo, saldo_inicial }) {
    const query = `
      INSERT INTO clientes (dni, nombres, apellidos, celular, tipo_vehiculo, saldo)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `;
    const { rows } = await pool.query(query, [dni, nombres, apellidos, celular, tipo_vehiculo, saldo_inicial || 0]);
    return rows[0];
  }

  static async listarActivos() {
    const { rows } = await pool.query(`SELECT * FROM clientes WHERE estado = 'A' ORDER BY nombres ASC`);
    return rows;
  }

  static async listarInactivos() {
    const { rows } = await pool.query(`SELECT * FROM clientes WHERE estado = 'I' ORDER BY nombres ASC`);
    return rows;
  }

  static async buscarPorDni(dni) {
    const { rows } = await pool.query(`SELECT * FROM clientes WHERE dni = $1 AND estado = 'A'`, [dni]);
    return rows[0];
  }

  static async buscarPorDniGlobal(dni) {
    const { rows } = await pool.query(`SELECT * FROM clientes WHERE dni = $1`, [dni]);
    return rows[0];
  }

  // NUEVO: Permite buscar al cliente por ID para validar descuentos
  static async buscarPorId(id) {
    const { rows } = await pool.query(`SELECT * FROM clientes WHERE id = $1`, [id]);
    return rows[0];
  }

  static async actualizarSaldo(id, monto, operacion = 'RESTA') {
    const signo = operacion === 'SUMA' ? '+' : '-';
    const query = `UPDATE clientes SET saldo = saldo ${signo} $1 WHERE id = $2 RETURNING saldo`;
    const { rows } = await pool.query(query, [monto, id]);
    return rows[0];
  }

  static async inhabilitar(id) {
    await pool.query(`UPDATE clientes SET estado = 'I' WHERE id = $1`, [id]);
  }

  static async rehabilitar(id) {
    await pool.query(`UPDATE clientes SET estado = 'A' WHERE id = $1`, [id]);
  }
}

module.exports = ClienteModel;