/**
 * BATERÍA DE PRUEBAS AUTOMATIZADAS - nuam exchange
 * Ejecuta pruebas unitarias y de integración sobre los módulos críticos.
 * 
 * IMPORTANTE: Los tests operan sobre snapshots del estado y restauran
 * el estado original al finalizar para no contaminar datos de producción.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Guardar estado original de auditoría antes de que los módulos lo carguen
const AUDIT_FILE = path.join(__dirname, '..', 'src', 'data', 'auditoria_eventos.json');
const auditoriaOriginal = fs.readFileSync(AUDIT_FILE, 'utf8');

const tributarioService = require('../src/services/tributarioService');
const { corredoras, calificaciones, bitacoraAuditoria } = require('../src/models/dataStore');

// Guardar snapshot del estado de calificaciones antes de los tests
const calificacionesSnapshot = JSON.parse(JSON.stringify(calificaciones));
const auditoriaLengthInicial = bitacoraAuditoria.length;

console.log('===============================================================');
console.log('🧪 EJECUTANDO BATERÍA DE PRUEBAS UNITARIAS E INTEGRACIÓN (nuam)');
console.log('===============================================================\n');

let aprobadas = 0;
let fallidas = 0;

function test(nombre, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${nombre}`);
    aprobadas++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}:`, err.message);
    fallidas++;
  }
}

// 1. REGLA FISCAL F8..F19 <= 1.0
test('PRU-01: Suma de factores <= 1.0 válida (0.80)', () => {
  const factores = { f08: 0.50, f09: 0.20, f13: 0.10 };
  const res = tributarioService.validarReglaFiscal(factores);
  assert.strictEqual(res.valida, true);
  assert.strictEqual(res.sumaTotal, 0.80);
});

test('PRU-02: Suma de factores exactamente 1.0 válida', () => {
  const factores = { f08: 0.50, f09: 0.50 };
  const res = tributarioService.validarReglaFiscal(factores);
  assert.strictEqual(res.valida, true);
  assert.strictEqual(res.sumaTotal, 1.00);
});

test('PRU-03: Suma de factores > 1.0 rechazada con error (1.05)', () => {
  const factores = { f08: 0.60, f09: 0.30, f10: 0.15 };
  const res = tributarioService.validarReglaFiscal(factores);
  assert.strictEqual(res.valida, false);
  assert.strictEqual(res.sumaTotal, 1.05);
  assert.ok(res.error.includes('Violación de regla fiscal'));
});

test('PRU-04: Factor negativo rechazado', () => {
  const factores = { f08: -0.10, f09: 0.50 };
  const res = tributarioService.validarReglaFiscal(factores);
  assert.strictEqual(res.valida, false);
  assert.ok(res.error.includes('no puede ser negativo'));
});

// 2. AISLAMIENTO MULTITENANT
test('PRU-05: Aislamiento estricto por Corredora (Tenant ID)', () => {
  const tenant1 = corredoras[0].id;
  const tenant2 = corredoras[1].id;
  const datosT1 = tributarioService.obtenerCalificaciones(tenant1);
  const datosT2 = tributarioService.obtenerCalificaciones(tenant2);

  assert.ok(datosT1.every(c => c.tenant_id === tenant1));
  assert.ok(datosT2.every(c => c.tenant_id === tenant2));
  assert.notStrictEqual(datosT1.length, 0);
  assert.notStrictEqual(datosT2.length, 0);
});

test('PRU-06: Tenant inexistente retorna lista vacía', () => {
  const datos = tributarioService.obtenerCalificaciones('corr-inexistente-99');
  assert.strictEqual(datos.length, 0);
});

// 3. OPERACIONES CRUD INDIVIDUALES
test('PRU-07: Creación individual con factores válidos', () => {
  const tenantId = corredoras[0].id;
  const payload = {
    rut_cliente: '99.999.888-7',
    razon_social: 'Test Inversiones Limitada',
    nemotecnico: 'CMPC',
    periodo_fiscal: 2026,
    modalidad: 'FACTOR',
    valor_nominal: 5000000,
    factores: { f08: 0.40, f09: 0.20, f13: 0.10 }
  };
  const creada = tributarioService.crearCalificacion(tenantId, payload, 'test@corredora.cl');
  assert.strictEqual(creada.rut_cliente, '99.999.888-7');
  assert.strictEqual(creada.suma_factores, 0.70);
});

test('PRU-08: Bloqueo de creación si factores exceden 1.0', () => {
  const tenantId = corredoras[0].id;
  const payload = {
    rut_cliente: '88.888.777-6',
    nemotecnico: 'BCI',
    periodo_fiscal: 2026,
    factores: { f08: 0.80, f09: 0.30 } // Suma = 1.10
  };
  assert.throws(() => {
    tributarioService.crearCalificacion(tenantId, payload);
  }, /Violación de regla fiscal/);
});

test('PRU-09: Bloqueo de creación sin campos obligatorios', () => {
  const tenantId = corredoras[0].id;
  assert.throws(() => {
    tributarioService.crearCalificacion(tenantId, { rut_cliente: '11.111.111-1' });
  }, /obligatorios/);
});

// 4. LÓGICA DE INGESTA MASIVA (UPSERT) Y LOG DE RECHAZOS
test('PRU-10: Ingesta Masiva con Upsert (Insert + Update + Aislamiento de Rechazos)', () => {
  const tenantId = corredoras[0].id;
  const csvContent = `rut_cliente,razon_social,nemotecnico,periodo_fiscal,modalidad,valor_nominal,f08,f09,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19
96.555.120-4,"Inversiones Santa Blanca S.A.",CHILE,2026,FACTOR,20000000,0.40,0.20,0.10,0.05,0.00,0.15,0.00,0.00,0.00,0.00,0.00,0.00
55.444.333-2,"Nuevo Cliente Uno",ENELAM,2026,FACTOR,8000000,0.30,0.20,0.10,0.00,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.00
66.555.444-1,"Cliente Invalido",FALABELLA,2026,FACTOR,1000000,0.70,0.40,0.10,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00
`;
  const buffer = Buffer.from(csvContent, 'utf-8');
  const resultado = tributarioService.procesarCargaMasiva(tenantId, buffer, 'test.csv', 'qa@redtech.cl');

  assert.strictEqual(resultado.totalLeidos, 3);
  assert.strictEqual(resultado.actualizados, 1); // 96.555.120-4 ya existía en seed data
  assert.strictEqual(resultado.insertados, 1);    // 55.444.333-2 es nuevo
  assert.strictEqual(resultado.rechazados, 1);     // 66.555.444-1 suma 1.20 > 1.0

  // Comprobar generación de CSV de rechazos
  const csvRechazos = tributarioService.generarCsvRechazos(resultado.batchId);
  assert.ok(csvRechazos.includes('66.555.444-1'));
  assert.ok(csvRechazos.includes('Violación de regla fiscal'));
});

test('PRU-11: Ingesta masiva rechaza filas sin RUT o Nemotécnico', () => {
  const tenantId = corredoras[0].id;
  const csvContent = `rut_cliente,nemotecnico,periodo_fiscal,f08
,"SIN_RUT",2026,0.50
99.000.111-2,,2026,0.30
`;
  const buffer = Buffer.from(csvContent, 'utf-8');
  const resultado = tributarioService.procesarCargaMasiva(tenantId, buffer, 'test_invalido.csv', 'qa@redtech.cl');
  assert.strictEqual(resultado.rechazados, 2);
  assert.strictEqual(resultado.insertados, 0);
});

// 5. VALIDACIÓN DE ESTRUCTURA DE DATOS SEMILLA
test('PRU-12: Datos semilla tienen factores que suman correctamente', () => {
  for (const cal of calificacionesSnapshot) {
    const validacion = tributarioService.validarReglaFiscal(cal.factores);
    assert.strictEqual(validacion.valida, true, `Semilla ${cal.rut_cliente} tiene suma inválida: ${validacion.sumaTotal}`);
    assert.strictEqual(validacion.sumaTotal, cal.suma_factores, `Semilla ${cal.rut_cliente}: suma calculada ${validacion.sumaTotal} != declarada ${cal.suma_factores}`);
  }
});

// 6. TOLERANCIA A FORMATOS DE EXCEL EN ESPAÑOL Y GENERACIÓN DE ARCHIVOS
test('PRU-13: parsearNumero tolera formato latinoamericano (coma decimal y punto de miles)', () => {
  assert.strictEqual(tributarioService.parsearNumero('0,35'), 0.35);
  assert.strictEqual(tributarioService.parsearNumero('0.35'), 0.35);
  assert.strictEqual(tributarioService.parsearNumero('15.400.000'), 15400000);
  assert.strictEqual(tributarioService.parsearNumero('15.400.000,50'), 15400000.5);
  assert.strictEqual(tributarioService.parsearNumero('15,400,000.50'), 15400000.5);
  assert.strictEqual(tributarioService.parsearNumero(25000), 25000);
});

test('PRU-14: Ingesta masiva procesa archivo Excel (.xlsx) nativo con formato en español', () => {
  const xlsx = require('xlsx');
  const tenantId = corredoras[0].id;

  const dataExcel = [
    ['RUT Cliente', 'Razón Social', 'Nemotécnico', 'Período Fiscal', 'Modalidad', 'Valor Nominal', 'No Inscrito', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19'],
    ['11.222.333-4', 'Sociedad Prueba Excel SpA', 'CHILE', 2026, 'FACTOR', '18.500.000', 'NO', '0,30', '0,20', '0,10', '0,05', '0,00', '0,15', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00']
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(dataExcel);
  xlsx.utils.book_append_sheet(wb, ws, 'Datos');
  const bufferExcel = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const res = tributarioService.procesarCargaMasiva(tenantId, bufferExcel, 'prueba_espanol.xlsx', 'test@redtech.cl');
  assert.strictEqual(res.totalLeidos, 1);
  assert.strictEqual(res.rechazados, 0);
  assert.strictEqual(res.insertados, 1);

  // Verificar que el registro insertado parseó correctamente el monto y los factores con comas
  const insertado = tributarioService.obtenerCalificaciones(tenantId, '11.222.333-4')[0];
  assert.ok(insertado);
  assert.strictEqual(insertado.valor_nominal, 18500000);
  assert.strictEqual(insertado.suma_factores, 0.80);
});

test('PRU-15: generarPlantillaExcel produce buffer .xlsx válido y legible', () => {
  const xlsx = require('xlsx');
  const buf = tributarioService.generarPlantillaExcel();
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 5000);

  const wb = xlsx.read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('Plantilla_Calificaciones'));
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['Plantilla_Calificaciones']);
  assert.ok(rows.length >= 4);
});

test('PRU-16: generarLotePrueba genera lotes válidos y lotes con rechazo para demostración', () => {
  const xlsx = require('xlsx');

  // Lote válido
  const bufValido = tributarioService.generarLotePrueba(false, 'xlsx');
  const wbValido = xlsx.read(bufValido, { type: 'buffer' });
  const rowsValido = xlsx.utils.sheet_to_json(wbValido.Sheets['Lote_Valido']);
  assert.strictEqual(rowsValido.length, 4);

  // Lote con rechazo intencional
  const bufRechazo = tributarioService.generarLotePrueba(true, 'xlsx');
  const wbRechazo = xlsx.read(bufRechazo, { type: 'buffer' });
  const rowsRechazo = xlsx.utils.sheet_to_json(wbRechazo.Sheets['Lote_Con_Rechazo']);
  assert.strictEqual(rowsRechazo.length, 5);
});

test('PRU-17: exportarDeclaracionExcel genera archivo .xlsx con posiciones de la corredora', () => {
  const xlsx = require('xlsx');
  const tenantId = corredoras[0].id;
  const buf = tributarioService.exportarDeclaracionExcel(tenantId);
  assert.ok(Buffer.isBuffer(buf));

  const wb = xlsx.read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('Declaracion_Consolidada'));
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['Declaracion_Consolidada']);
  assert.ok(rows.length >= 1);
});

// ====================================================
// LIMPIEZA: Restaurar estado original para no contaminar
// ====================================================
console.log('\n  🧹 Restaurando estado original...');

// Restaurar calificaciones al estado previo a los tests
calificaciones.length = 0;
calificacionesSnapshot.forEach(c => calificaciones.push(c));

// Restaurar auditoría al estado previo
bitacoraAuditoria.length = auditoriaLengthInicial;

// Restaurar archivo de auditoría en disco
try {
  fs.writeFileSync(AUDIT_FILE, auditoriaOriginal, 'utf8');
  console.log('  ✅ Estado restaurado correctamente (auditoría y calificaciones).\n');
} catch (err) {
  console.error('  ⚠️  No se pudo restaurar auditoría en disco:', err.message);
}

console.log('===============================================================');
console.log(`📊 RESULTADOS: ${aprobadas} Aprobadas | ${fallidas} Fallidas`);
console.log('===============================================================\n');

if (fallidas > 0) process.exit(1);
