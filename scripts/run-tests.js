/**
 * Batería de pruebas automatizadas - nuam exchange
 *
 * Pruebas funcionales sobre la API REST y la lógica de negocio:
 *  - Inicio de sesión válido e inválido.
 *  - Bloqueo por límite de intentos (HTTP 429).
 *  - Denegación RBAC (HTTP 403).
 *  - Ingesta masiva transaccional sin contaminar la base de datos.
 *
 * Los tests operan sobre una base SQLite temporal independiente (se elimina al
 * final), de modo que nunca modifican los datos de producción.
 */

'use strict';

// Configurar el entorno de prueba ANTES de cargar la aplicación: connection.js
// resuelve la ruta de la base de datos al importarse.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'nuam-test-secret';
process.env.SEED_DEFAULT_PASSWORD = 'Nuam2026!';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuam-tests-'));
process.env.SQLITE_FILE = path.join(tmpDir, 'nuam_test.sqlite');

const { start } = require('../src/server');
const { closeDb } = require('../src/database/connection');
const tributarioService = require('../src/services/tributarioService');

const USUARIO_QA = { id: 'usr-qa', email: 'qa@nuam.exchange' };

let aprobadas = 0;
let fallidas = 0;

async function ejecutar(nombre, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${nombre}`);
    aprobadas++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}:`, err && err.message ? err.message : err);
    fallidas++;
  }
}

(async () => {
  console.log('\nPruebas automatizadas: nuam exchange (API REST + RBAC + Ingesta)\n');

  // Iniciar el servidor en un puerto efímero con base de datos temporal.
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function http(pathname, opts = {}) {
    const headers = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.ip) headers['x-forwarded-for'] = opts.ip;
    let body;
    if (opts.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form;
    }
    const res = await fetch(base + pathname, { method: opts.method || 'GET', headers, body });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* respuesta no JSON (descarga de archivo) */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  // 1. Lógica de negocio: regla fiscal y parsing
  await ejecutar('PRU-01: Regla fiscal válida (suma 0.80)', () => {
    const r = tributarioService.validarReglaFiscal({ f08: 0.5, f09: 0.2, f13: 0.1 });
    assert.strictEqual(r.valida, true);
    assert.strictEqual(r.sumaTotal, 0.8);
  });

  await ejecutar('PRU-02: Regla fiscal en el límite (suma 1.00)', () => {
    const r = tributarioService.validarReglaFiscal({ f08: 0.5, f09: 0.5 });
    assert.strictEqual(r.valida, true);
    assert.strictEqual(r.sumaTotal, 1);
  });

  await ejecutar('PRU-03: Regla fiscal violada (suma 1.05)', () => {
    const r = tributarioService.validarReglaFiscal({ f08: 0.6, f09: 0.3, f10: 0.15 });
    assert.strictEqual(r.valida, false);
    assert.ok(r.error.includes('Violación de regla fiscal'));
  });

  await ejecutar('PRU-04: Factor negativo rechazado', () => {
    const r = tributarioService.validarReglaFiscal({ f08: -0.1, f09: 0.5 });
    assert.strictEqual(r.valida, false);
    assert.ok(r.error.includes('no puede ser negativo'));
  });

  await ejecutar('PRU-05: parsearNumero tolera formato latinoamericano', () => {
    assert.strictEqual(tributarioService.parsearNumero('0,35'), 0.35);
    assert.strictEqual(tributarioService.parsearNumero('15.400.000'), 15400000);
    assert.strictEqual(tributarioService.parsearNumero('15.400.000,50'), 15400000.5);
    assert.strictEqual(tributarioService.parsearNumero('15,400,000.50'), 15400000.5);
  });

  await ejecutar('PRU-06: RUT inválido es rechazado en creación individual', () => {
    assert.throws(
      () => tributarioService.crearCalificacion(
        'corr-lv-01',
        { rut_cliente: '96.555.120-5', nemotecnico: 'CMPC', periodo_fiscal: 2026 },
        USUARIO_QA,
        '127.0.0.1'
      ),
      /no es válido/
    );
  });

  // 2. Aislamiento multi-tenant
  await ejecutar('PRU-07: Aislamiento estricto por corredora (tenant)', () => {
    const lv = tributarioService.obtenerCalificaciones('corr-lv-01');
    const bc = tributarioService.obtenerCalificaciones('corr-bc-02');
    assert.ok(lv.length > 0);
    assert.ok(bc.length > 0);
    assert.ok(lv.every((c) => c.tenant_id === 'corr-lv-01'));
    assert.ok(bc.every((c) => c.tenant_id === 'corr-bc-02'));
  });

  await ejecutar('PRU-08: Rol global puede consultar todas las corredoras', () => {
    const todas = tributarioService.obtenerCalificaciones(null);
    const lv = tributarioService.obtenerCalificaciones('corr-lv-01');
    assert.ok(todas.length > lv.length);
  });

  // 3. Ingesta masiva transaccional (sin contaminar la base de datos)
  await ejecutar('PRU-09: Ingesta masiva aplica solo registros válidos (transaccional)', () => {
    const tenant = 'corr-bc-02';
    const antes = tributarioService.obtenerCalificaciones(tenant).length;

    const csv = [
      'rut_cliente,razon_social,nemotecnico,periodo_fiscal,modalidad,valor_nominal,no_inscrito,f08,f09,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19',
      '96.888.777-7,"Banchile Administradora General de Fondos S.A.",FALABELLA,2026,FACTOR,820000000,false,0.50,0.20,0.10,0.05,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.00',
      '76.123.456-0,"Inversiones Los Andes SpA",CHILE,2026,FACTOR,15400000,false,0.35,0.15,0.10,0.05,0.00,0.12,0.00,0.00,0.00,0.00,0.00,0.03',
      '96.555.120-5,"Cliente Inválido",FALABELLA,2026,FACTOR,1000000,false,0.70,0.40,0.10,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00',
    ].join('\r\n');

    const resultado = tributarioService.procesarCargaMasiva(
      tenant,
      Buffer.from(csv, 'utf-8'),
      'carga_prueba.csv',
      USUARIO_QA,
      '127.0.0.1'
    );

    assert.strictEqual(resultado.totalLeidos, 3);
    assert.strictEqual(resultado.actualizados, 1);
    assert.strictEqual(resultado.insertados, 1);
    assert.strictEqual(resultado.rechazados, 1);

    // Verificación de no-contaminación: solo el registro válido nuevo persiste.
    const despues = tributarioService.obtenerCalificaciones(tenant).length;
    assert.strictEqual(despues, antes + 1);

    const nuevo = tributarioService.obtenerCalificaciones(tenant, '76.123.456-0');
    assert.strictEqual(nuevo.length, 1);
    assert.strictEqual(nuevo[0].nemotecnico, 'CHILE');

    const rechazado = tributarioService.obtenerCalificaciones(tenant, '96.555.120');
    assert.strictEqual(rechazado.length, 0);

    // El log de rechazos identifica la fila con RUT inválido.
    const csvRechazos = tributarioService.generarCsvRechazos(resultado.batchId);
    assert.ok(csvRechazos.includes('96.555.120-5'));
  });

  // 4. Autenticación y límite de intentos
  let tokenAdmin = null;
  let tokenOperador = null;

  await ejecutar('PRU-10: Estado del servicio (GET /api/health)', async () => {
    const r = await http('/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
    assert.strictEqual(r.json.data.baseDeDatos, 'ok');
  });

  await ejecutar('PRU-11: Inicio de sesión válido (admin)', async () => {
    const r = await http('/api/auth/login', {
      method: 'POST',
      ip: '10.0.0.1',
      json: { email: 'admin@nuam.exchange', password: 'Nuam2026!' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
    assert.ok(r.json.data.token);
    assert.strictEqual(r.json.data.usuario.rol, 'ADMIN_NUAM');
    tokenAdmin = r.json.data.token;
  });

  await ejecutar('PRU-12: Inicio de sesión inválido (HTTP 401)', async () => {
    const r = await http('/api/auth/login', {
      method: 'POST',
      ip: '10.0.0.2',
      json: { email: 'admin@nuam.exchange', password: 'clave-incorrecta' },
    });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.success, false);
    assert.strictEqual(r.json.error.code, 'CREDENCIALES_INVALIDAS');
  });

  await ejecutar('PRU-13: Bloqueo por límite de intentos (HTTP 429)', async () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 5; i++) {
      const r = await http('/api/auth/login', {
        method: 'POST',
        ip,
        json: { email: 'intruso@nuam.exchange', password: 'clave-incorrecta' },
      });
      assert.strictEqual(r.status, 401);
    }
    const bloqueado = await http('/api/auth/login', {
      method: 'POST',
      ip,
      json: { email: 'intruso@nuam.exchange', password: 'clave-incorrecta' },
    });
    assert.strictEqual(bloqueado.status, 429);
    assert.strictEqual(bloqueado.json.error.code, 'RATE_LIMITED');
  });

  await ejecutar('PRU-14: Ruta protegida exige autenticación (HTTP 401)', async () => {
    const r = await http('/api/declaraciones');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.error.code, 'AUTH_REQUIRED');
  });

  // 5. Control de acceso RBAC
  await ejecutar('PRU-15: Operador inicia sesión correctamente', async () => {
    const r = await http('/api/auth/login', {
      method: 'POST',
      ip: '10.0.0.4',
      json: { email: 'operador.banchile@nuam.exchange', password: 'Nuam2026!' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.usuario.rol, 'OPERADOR_CORREDORA');
    tokenOperador = r.json.data.token;
  });

  await ejecutar('PRU-16: Operador ve denegado el acceso a auditoría (HTTP 403)', async () => {
    const r = await http('/api/auditoria', { token: tokenOperador });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await ejecutar('PRU-17: Operador ve denegada la gestión de usuarios (HTTP 403)', async () => {
    const r = await http('/api/usuarios', { token: tokenOperador });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await ejecutar('PRU-18: Operador consulta declaraciones acotadas a su corredora', async () => {
    const r = await http('/api/declaraciones', { token: tokenOperador });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
    assert.ok(r.json.data.length > 0);
    assert.ok(r.json.data.every((c) => c.tenant_id === 'corr-bc-02'));
  });

  await ejecutar('PRU-19: Admin consulta todas las corredoras y puede filtrar por tenant', async () => {
    const todas = await http('/api/declaraciones', { token: tokenAdmin });
    assert.strictEqual(todas.status, 200);

    const soloLv = await http('/api/declaraciones?tenant=corr-lv-01', { token: tokenAdmin });
    assert.strictEqual(soloLv.status, 200);
    assert.ok(soloLv.json.data.every((c) => c.tenant_id === 'corr-lv-01'));
    assert.ok(todas.json.data.length > soloLv.json.data.length);
  });

  // 6. Carga masiva por HTTP (multipart/form-data)
  await ejecutar('PRU-20: Carga masiva vía HTTP (multipart) responde correctamente', async () => {
    const csv = [
      'rut_cliente,razon_social,nemotecnico,periodo_fiscal,modalidad,valor_nominal,no_inscrito,f08,f09,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19',
      '99.111.222-7,"Inmobiliaria El Roble Ltda",FALABELLA,2026,MONTO,12000000,false,0.35,0.15,0.10,0.10,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.00',
    ].join('\r\n');

    const form = new FormData();
    form.append('archivo', new Blob([csv], { type: 'text/csv' }), 'declaraciones.csv');

    const r = await http('/api/declaraciones/carga-masiva', {
      method: 'POST',
      token: tokenOperador,
      form,
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
    assert.strictEqual(r.json.data.totalLeidos, 1);
    assert.strictEqual(r.json.data.rechazados, 0);
  });

  // 7. Pruebas de contrato frontend y consistencia de roles (prevención de regresiones)
  await ejecutar('PRU-21: Verificación estática de rutas cliente en public/app.js', async () => {
    const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');

    // Rutas legadas prohibidas que nunca deben invocarse desde el frontend
    const rutasProhibidas = [
      '/api/calificaciones',
      '/api/carga-masiva',
      '/api/bolsa-central',
      '/api/descargar-rechazos',
      '/api/exportar-declaracion',
      '/api/lote-prueba'
    ];

    for (const ruta of rutasProhibidas) {
      assert.ok(
        !appJsContent.includes(`'${ruta}`) && !appJsContent.includes(`"${ruta}`),
        `public/app.js invoca la ruta obsoleta ${ruta}`
      );
    }

    // Extraer todas las llamadas a endpoints /api/... en app.js y verificar que responden sin 404
    const apiRegex = /['"`](\/api\/[a-zA-Z0-9_\-\/?=&${}]+)['"`]/g;
    let match;
    const endpointsDetectados = new Set();
    const dbTest = require('../src/database/connection').getDb();
    const realUsr = dbTest.prepare('SELECT id FROM usuarios LIMIT 1').get();
    while ((match = apiRegex.exec(appJsContent)) !== null) {
      let ep = match[1];
      if (ep.includes('/api/usuarios/${id}')) {
        ep = `/api/usuarios/${realUsr.id}`;
      } else {
        ep = ep.replace(/\$\{tenantActivo\}/g, 'corr-lv-01')
               .replace(/\$\{batchIdRechazosActivo\}/g, 'batch-test-01')
               .replace(/\$\{formato\}/g, 'csv')
               .replace(/\$\{id\}/g, 'cal-canon-lv-01')
               .replace(/\$\{encodeURIComponent\([^)]+\)\}/g, 'test')
               .replace(/\$\{token \? [^}]+\}/g, '');
      }
      if (ep.startsWith('/api/')) {
        endpointsDetectados.add(ep.split('?')[0]);
      }
    }

    // Cada endpoint detectado debe existir en el router (no responder 404)
    for (const ep of endpointsDetectados) {
      const metodo = (ep === '/api/auth/login' || ep === '/api/auth/logout' || ep === '/api/declaraciones/carga-masiva') ? 'POST' : 'GET';
      const res = await http(ep, { method: metodo, token: tokenAdmin });
      assert.notStrictEqual(
        res.status,
        404,
        `El endpoint frontend '${ep}' no existe en el backend (HTTP 404 Not Found)`
      );
    }
  });

  await ejecutar('PRU-22: Matriz transversal completa de los 4 roles institucionales', async () => {
    // 1. Oficial de Cumplimiento
    const loginCump = await http('/api/auth/login', {
      method: 'POST',
      json: { email: 'cumplimiento@nuam.exchange', password: 'Nuam2026!' }
    });
    assert.strictEqual(loginCump.status, 200);
    const tokenCump = loginCump.json.data.token;
    assert.strictEqual(loginCump.json.data.usuario.rol, 'OFICIAL_CUMPLIMIENTO');

    // Cumplimiento ve auditoría (200), pero no gestiona usuarios (403)
    const auditCump = await http('/api/auditoria', { token: tokenCump });
    assert.strictEqual(auditCump.status, 200);
    const usrCump = await http('/api/usuarios', { token: tokenCump });
    assert.strictEqual(usrCump.status, 403);

    // 2. Regulador CMF
    const loginReg = await http('/api/auth/login', {
      method: 'POST',
      json: { email: 'regulador@cmfchile.cl', password: 'Nuam2026!' }
    });
    assert.strictEqual(loginReg.status, 200);
    const tokenReg = loginReg.json.data.token;
    assert.strictEqual(loginReg.json.data.usuario.rol, 'REGULADOR_CMF');

    // Regulador ve auditoría (200), pero no gestiona usuarios (403)
    const auditReg = await http('/api/auditoria', { token: tokenReg });
    assert.strictEqual(auditReg.status, 200);
    const usrReg = await http('/api/usuarios', { token: tokenReg });
    assert.strictEqual(usrReg.status, 403);

    // 3. Admin gestiona usuarios (200) y auditoría (200)
    const auditAdmin = await http('/api/auditoria', { token: tokenAdmin });
    assert.strictEqual(auditAdmin.status, 200);
    const usrAdmin = await http('/api/usuarios', { token: tokenAdmin });
    assert.strictEqual(usrAdmin.status, 200);
  });

  await ejecutar('PRU-23: Autenticación por parámetro query token (?token=) para descargas', async () => {
    const rPlantilla = await http(`/api/declaraciones/plantilla?token=${tokenAdmin}`);
    assert.strictEqual(rPlantilla.status, 200);

    const rExport = await http(`/api/declaraciones/exportar?tenant=corr-lv-01&formato=csv&token=${tokenAdmin}`);
    assert.strictEqual(rExport.status, 200);
    assert.ok(rExport.text.includes('RUT_CLIENTE'));
  });

  await ejecutar('PRU-24: Integridad de esquema de datos en respuestas REST consumidas por UI', async () => {
    // 1. /api/usuarios
    const resUsr = await http('/api/usuarios', { token: tokenAdmin });
    assert.strictEqual(resUsr.status, 200);
    const primerUsuario = resUsr.json.data[0];
    assert.ok('rol' in primerUsuario, 'El usuario debe exponer propiedad rol');
    assert.ok('tenant_id' in primerUsuario, 'El usuario debe exponer propiedad tenant_id');
    assert.ok('activo' in primerUsuario, 'El usuario debe exponer propiedad activo');

    // 2. /api/declaraciones
    const resDec = await http('/api/declaraciones', { token: tokenAdmin });
    assert.strictEqual(resDec.status, 200);
    const primerDec = resDec.json.data[0];
    assert.ok('rut_cliente' in primerDec, 'Declaración debe contener rut_cliente');
    assert.ok('nemotecnico' in primerDec, 'Declaración debe contener nemotecnico');
    assert.ok('valor_nominal' in primerDec, 'Declaración debe contener valor_nominal');
    assert.ok('factores' in primerDec, 'Declaración debe contener factores');

    // 3. /api/instrumentos
    const resInst = await http('/api/instrumentos', { token: tokenAdmin });
    assert.strictEqual(resInst.status, 200);
    const primerInst = resInst.json.data[0];
    assert.ok('nemotecnico' in primerInst, 'Instrumento debe contener nemotecnico');
    assert.ok('razon_social' in primerInst, 'Instrumento debe contener razon_social');
  });

  await ejecutar('PRU-25: Consistencia de catálogo de roles entre frontend e índice backend', async () => {
    const rolesConfig = require('../src/config/roles').ROLES;
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

    for (const rolKey of Object.values(rolesConfig)) {
      assert.ok(indexHtml.includes(rolKey), `index.html debe hacer referencia al rol canónico ${rolKey}`);
    }
  });

  await ejecutar('PRU-26: Formato de exportación por defecto es XLSX nativo', async () => {
    const rExportDefault = await http(`/api/declaraciones/exportar?token=${tokenAdmin}`);
    assert.strictEqual(rExportDefault.status, 200);
    const contentType = rExportDefault.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('spreadsheetml'),
      `Content-Type esperado de XLSX, obtenido: ${contentType}`
    );
  });

  await ejecutar('PRU-27: Consolidación GLOBAL y auto-resolución de tenant en eliminación', async () => {
    // 1. Consulta regional GLOBAL consolida todas las corredoras
    const rGlobal = await http('/api/declaraciones?tenant=GLOBAL', { token: tokenAdmin });
    assert.strictEqual(rGlobal.status, 200);
    assert.ok(rGlobal.json.data.length >= 3, 'GLOBAL debe retornar declaraciones de todas las corredoras');

    // 2. Creación y eliminación por ID sin parámetro tenant en DELETE
    const rCrear = await http('/api/declaraciones', {
      method: 'POST',
      token: tokenAdmin,
      json: {
        tenant_id: 'corr-lv-01',
        rut_cliente: '76.123.456-0',
        razon_social: 'Inversiones Los Andes SpA',
        nemotecnico: 'BCI',
        periodo_fiscal: 2026,
        modalidad: 'FACTOR',
        valor_nominal: 1000000,
        no_inscrito: false,
        factores: { f08: 0.8, f09: 0, f10: 0, f11: 0, f12: 0, f13: 0, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 }
      }
    });
    assert.strictEqual(rCrear.status, 201);
    const nuevoId = rCrear.json.data.id;

    // DELETE sin pasar ?tenant= en la query (debe auto-resolver el tenant desde la BD)
    const rDel = await http(`/api/declaraciones/${nuevoId}`, {
      method: 'DELETE',
      token: tokenAdmin
    });
    assert.strictEqual(rDel.status, 200);
    assert.strictEqual(rDel.json.success, true);
  });

  // Cierre y limpieza
  console.log('\n  Liberando recursos de prueba...');
  server.close();
  closeDb();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* la carpeta temporal puede quedar si el sistema la bloquea */
  }

  console.log(`\nResultados: ${aprobadas} Aprobadas | ${fallidas} Fallidas\n`);

  process.exit(fallidas > 0 ? 1 : 0);
})();
