/**
 * Utilidades de validación de RUT chileno (Rol Único Tributario).
 * Algoritmo de dígito verificador por módulo 11 (norma SII chileno).
 */

function normalizarRut(rut) {
  if (rut === null || rut === undefined) return '';
  return String(rut).replace(/[.\-\s]/g, '').toUpperCase();
}

function digitoVerificador(body) {
  const digitos = String(body).replace(/\D/g, '');
  if (!digitos) return null;
  let suma = 0;
  let multiplicador = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += parseInt(digitos[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

/**
 * Valida formato (7-8 dígitos + verificador) y dígito verificador.
 */
function esRutValido(rut) {
  const normalizado = normalizarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(normalizado)) return false;
  const body = normalizado.slice(0, -1);
  const dv = normalizado.slice(-1);
  return digitoVerificador(body) === dv;
}

/**
 * Formatea un RUT a la notación estándar con puntos y guión: 96.555.120-4
 */
function formatearRut(rut) {
  const normalizado = normalizarRut(rut);
  if (!normalizado) return rut;
  const body = normalizado.slice(0, -1);
  const dv = normalizado.slice(-1);
  let formateado = '';
  let contador = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formateado = body[i] + formateado;
    contador++;
    if (contador % 3 === 0 && i !== 0) formateado = '.' + formateado;
  }
  return formateado + '-' + dv;
}

module.exports = { normalizarRut, digitoVerificador, esRutValido, formatearRut };
