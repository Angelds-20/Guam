/**
 * Servicio de auditoría: registro de eventos de negocio en la tabla SQLite
 * `auditoria_eventos` y consulta con filtros (fecha, usuario, acción, entidad).
 */
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/connection');

function registrar({ usuario, accion, entidad, entidadId, tenant, detalle, ip }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO auditoria_eventos (id, usuario_id, usuario_email, accion, entidad, entidad_id, tenant_id, detalle, ip)
     VALUES (@id, @usuario_id, @usuario_email, @accion, @entidad, @entidad_id, @tenant_id, @detalle, @ip)`
  ).run({
    id: uuidv4(),
    usuario_id: (usuario && usuario.id) || null,
    usuario_email: (usuario && usuario.email) || null,
    accion,
    entidad,
    entidad_id: entidadId || null,
    tenant_id: tenant || null,
    detalle: detalle || null,
    ip: ip || null,
  });
}

function listar({ desde, hasta, accion, entidad, usuario, limite = 200 } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (desde) {
    condiciones.push('created_at >= @desde');
    params.desde = desde;
  }
  if (hasta) {
    condiciones.push('created_at <= @hasta');
    params.hasta = hasta;
  }
  if (accion) {
    condiciones.push('accion = @accion');
    params.accion = accion;
  }
  if (entidad) {
    condiciones.push('entidad = @entidad');
    params.entidad = entidad;
  }
  if (usuario) {
    condiciones.push('usuario_email = @usuario');
    params.usuario = usuario;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 200, 1), 1000);

  const eventos = db
    .prepare(
      `SELECT id, usuario_id, usuario_email, accion, entidad, entidad_id, tenant_id, detalle, ip, created_at
       FROM auditoria_eventos ${where}
       ORDER BY created_at DESC, rowid DESC
       LIMIT @limite`
    )
    .all({ ...params, limite: limiteSeguro });

  return eventos;
}

module.exports = { registrar, listar };
