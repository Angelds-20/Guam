/**
 * CLIENTE JAVASCRIPT - INTRANET NUAM EXCHANGE
 * Diseño de Alto Contraste & Multi-Panel
 */

let corredoras = [];
let tenantActivo = null;
let corredoraActual = null;
const NOMBRES_CORREDORAS = {
  'corr-lv-01': { id: 'corr-lv-01', nombre: 'LarraínVial Corredora de Bolsa', codigo: 'LARRAIN_VIAL', initials: 'LV' },
  'corr-bc-02': { id: 'corr-bc-02', nombre: 'Banchile Inversiones Corredores de Bolsa', codigo: 'BANCHILE', initials: 'BC' },
  'corr-cc-03': { id: 'corr-cc-03', nombre: 'Credicorp Capital Bolsa', codigo: 'CREDICORP', initials: 'CC' },
  'GLOBAL': { id: 'GLOBAL', nombre: 'nuam exchange • Consola Regional', codigo: 'GLOBAL', initials: 'NM' }
};
let calificacionesActuales = [];
let batchIdRechazosActivo = null;
let filtroModalidadActivo = 'TODOS';
let usuariosActuales = [];
let filtroUsuarioRangoActivo = 'TODOS';

function getAuthToken() {
  return sessionStorage.getItem('nuam_token') || '';
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    cerrarSesion();
    throw new Error('Sesión no autorizada o expirada.');
  }
  return res;
}

function getRangoActual() {
  return sessionStorage.getItem('nuam_user_rank') || 'ADMIN_NUAM';
}

function esUsuarioAdmin() {
  const r = getRangoActual();
  return r === 'ADMIN_NUAM' || r === 'SUPER_ADMIN';
}

function esUsuarioAuditor() {
  const r = getRangoActual();
  return r === 'REGULADOR_CMF' || r === 'OFICIAL_CUMPLIMIENTO' || r === 'AUDITOR_CMF';
}

function esUsuarioOperador() {
  const r = getRangoActual();
  return r === 'OPERADOR_CORREDORA' || r === 'OPERADOR_SENIOR' || r === 'ADMIN_CORREDORA';
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  
  // Verificar si hay sesión activa en sessionStorage
  if (sessionStorage.getItem('nuam_token') && sessionStorage.getItem('nuam_auth') === 'true') {
    const savedTenant = sessionStorage.getItem('nuam_tenant');
    if (savedTenant) tenantActivo = savedTenant;
    await mostrarIntranet();
  } else {
    mostrarLanding();
  }

  await verificarSalud();
  setInterval(verificarSalud, 15000);
});

// Cargar Corredoras (Tenants) en Navbar y Formulario de Login
async function cargarCorredoras() {
  try {
    const res = await authFetch('/api/corredoras');
    const json = await res.json();
    if (json.success) {
      corredoras = json.data;
      
      // Poblar selector de Intranet
      const selectIntranet = document.getElementById('tenantSelect');
      if (selectIntranet) {
        selectIntranet.innerHTML = '';
        const r = getRangoActual();
        const esAdmin = esUsuarioAdmin();
        corredoras.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          let label = c.nombre;
          if (c.id === 'GLOBAL' && (esAdmin || r === 'OFICIAL_CUMPLIMIENTO')) {
            label = 'nuam exchange • Consola Regional';
          }
          opt.textContent = label;
          selectIntranet.appendChild(opt);
        });

        if (!tenantActivo && corredoras.length > 0) {
          tenantActivo = corredoras[0].id;
        }
        selectIntranet.value = tenantActivo;
        selectIntranet.onchange = (e) => cambiarTenant(e.target.value);
      }
      actualizarBadgesTenant();
    }
  } catch (err) {
    mostrarAlerta('Error cargando corredoras: ' + err.message, 'error');
  }
}

// Cambiar Corredora Activa (Sincronización Total de Estado y Navbar)
async function cambiarTenant(nuevoTenantId) {
  if (!nuevoTenantId) return;

  if (esUsuarioOperador()) {
    const selectIntranet = document.getElementById('tenantSelect');
    if (selectIntranet && tenantActivo) selectIntranet.value = tenantActivo;
    mostrarAlerta('Aislamiento Multitenant: Su cuenta institucional está asignada exclusivamente a su corredora y no puede conmutar a otra entidad.', 'error');
    return;
  }

  tenantActivo = nuevoTenantId;
  sessionStorage.setItem('nuam_tenant', tenantActivo);
  actualizarBadgesTenant();
  await cargarCalificaciones();
  await cargarAuditoria();
  await cargarBolsaCentral();
  if (corredoraActual) {
    mostrarAlerta(`Corredora activa: ${corredoraActual.nombre}`, 'info');
  }
}

// Control de Sesión B2B Conectado al Backend Real REST
async function iniciarSesion(e) {
  if (e) e.preventDefault();
  const inputUsuario = document.getElementById('loginUsuario');
  const inputPassword = document.getElementById('loginPassword');
  const email = (inputUsuario && inputUsuario.value.trim()) ? inputUsuario.value.trim().toLowerCase() : '';
  const password = (inputPassword && inputPassword.value) ? inputPassword.value : '';

  if (!email || !password) {
    mostrarAlerta('Por favor complete su correo y contraseña.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      const msg = (json.error && json.error.message) || 'Error al iniciar sesión.';
      mostrarAlerta(msg, 'error');
      return;
    }

    const { token, usuario } = json.data;
    sessionStorage.setItem('nuam_auth', 'true');
    sessionStorage.setItem('nuam_token', token);
    sessionStorage.setItem('nuam_user', usuario.nombre);
    sessionStorage.setItem('nuam_user_email', usuario.email);
    sessionStorage.setItem('nuam_user_cargo', usuario.cargo || usuario.rol);
    sessionStorage.setItem('nuam_user_rank', usuario.rol);
    sessionStorage.setItem('nuam_user_initials', usuario.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase());
    sessionStorage.setItem('nuam_user_permissions', JSON.stringify(usuario.permissions || []));

    if (usuario.tenant_id && usuario.tenant_id !== 'GLOBAL') {
      tenantActivo = usuario.tenant_id;
    } else {
      tenantActivo = 'corr-lv-01';
    }
    sessionStorage.setItem('nuam_tenant', tenantActivo);

    await mostrarIntranet();
    cambiarSeccion('calificaciones');
    mostrarAlerta(`Bienvenido, ${usuario.nombre} (${usuario.rol})`, 'success');
  } catch (err) {
    mostrarAlerta('Error de autenticación: ' + err.message, 'error');
  }
}

async function cerrarSesion() {
  try {
    const token = getAuthToken();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
  } catch (_) {}
  sessionStorage.clear();
  tenantActivo = null;
  corredoraActual = null;
  calificacionesActuales = [];
  usuariosActuales = [];
  mostrarLanding();
}

function mostrarLanding() {
  const landing = document.getElementById('vistaLanding');
  const intranet = document.getElementById('vistaIntranet');
  if (landing) {
    landing.classList.remove('hidden');
    landing.style.display = 'flex';
  }
  if (intranet) {
    intranet.classList.add('hidden');
    intranet.style.display = 'none';
  }
  if (window.lucide) lucide.createIcons();
}

async function mostrarIntranet() {
  const landing = document.getElementById('vistaLanding');
  const intranet = document.getElementById('vistaIntranet');
  if (landing) {
    landing.classList.add('hidden');
    landing.style.display = 'none';
  }
  if (intranet) {
    intranet.classList.remove('hidden');
    intranet.style.display = 'flex';
    intranet.style.flexDirection = 'column';
  }

  // Cargar lista oficial de corredoras primero
  await cargarCorredoras();

  const selectIntranet = document.getElementById('tenantSelect');
  if (selectIntranet && tenantActivo) {
    selectIntranet.value = tenantActivo;
  }

  actualizarBadgesTenant();
  await cargarCalificaciones();
  await cargarAuditoria();
  await cargarBolsaCentral();
  if (window.lucide) lucide.createIcons();
}

function actualizarBadgesTenant() {
  const r = getRangoActual();
  if (tenantActivo === 'GLOBAL' && (r === 'ADMIN_NUAM' || r === 'SUPER_ADMIN' || r === 'OFICIAL_CUMPLIMIENTO')) {
    corredoraActual = NOMBRES_CORREDORAS['GLOBAL'];
  } else {
    corredoraActual = corredoras.find(c => c.id === tenantActivo) || NOMBRES_CORREDORAS[tenantActivo] || {
      id: tenantActivo,
      nombre: tenantActivo || 'nuam exchange',
      codigo: tenantActivo || 'NUAM',
      initials: 'NM'
    };
  }

  // Sincronizar el select de la barra superior siempre con el tenant activo
  const selectIntranet = document.getElementById('tenantSelect');
  if (selectIntranet && tenantActivo && selectIntranet.value !== tenantActivo) {
    selectIntranet.value = tenantActivo;
  }

  const initialsMap = {
    'corr-lv-01': 'LV',
    'corr-bc-02': 'BC',
    'corr-cc-03': 'CC',
    'GLOBAL': 'NM'
  };
  const badgeInitials = document.getElementById('badgeTenantInitials');
  if (badgeInitials) badgeInitials.textContent = initialsMap[tenantActivo] || corredoraActual.initials || 'NM';

  const badge = document.getElementById('badgeTenantActivo');
  if (badge) badge.textContent = corredoraActual.codigo || tenantActivo;
  const footTenant = document.getElementById('footerTenant');
  if (footTenant) footTenant.textContent = corredoraActual.nombre;
  const badgeHero = document.getElementById('badgeTenantHero');
  if (badgeHero) badgeHero.textContent = corredoraActual.nombre;

  // Actualizar subtítulo según perfil de usuario
  const subtituloVista = document.getElementById('badgeSubtituloVista');
  if (subtituloVista) {
    const r = getRangoActual();
    if (r === 'ADMIN_NUAM' || r === 'SUPER_ADMIN') {
      subtituloVista.textContent = 'Consola de Control Central';
    } else if (r === 'OFICIAL_CUMPLIMIENTO') {
      subtituloVista.textContent = 'Supervisión Normativa y Cumplimiento (Solo Lectura)';
    } else if (r === 'REGULADOR_CMF' || r === 'AUDITOR_CMF') {
      subtituloVista.textContent = 'Inspección Fiscalizadora CMF (Solo Lectura)';
    } else {
      subtituloVista.textContent = 'Mesa de Trabajo Operativa';
    }
  }

  // Actualizar perfil de operador dinámicamente en el navbar (siempre)
  const savedUser = sessionStorage.getItem('nuam_user') || 'Operador Institucional';
  const savedCargo = sessionStorage.getItem('nuam_user_cargo') || 'nuam exchange';
  const savedRank = sessionStorage.getItem('nuam_user_rank') || 'ADMIN_NUAM';
  const savedInitial = sessionStorage.getItem('nuam_user_initials') || 'OP';

  const avatar = document.getElementById('operadorAvatarInitials');
  const nombreOp = document.getElementById('operadorNombre');
  const cargoOp = document.getElementById('operadorCargo');
  const badgeRango = document.getElementById('operadorRangoBadge');

  if (avatar) avatar.textContent = savedInitial;
  if (nombreOp) nombreOp.textContent = savedUser;
  if (cargoOp) cargoOp.textContent = savedCargo;

  if (badgeRango) {
    const rankStyles = {
      'ADMIN_NUAM': { label: 'ADMINISTRADOR', class: 'bg-amber-100 text-amber-800 border-amber-300' },
      'SUPER_ADMIN': { label: 'ADMINISTRADOR', class: 'bg-amber-100 text-amber-800 border-amber-300' },
      'OPERADOR_CORREDORA': { label: 'OPERADOR', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      'ADMIN_CORREDORA': { label: 'OPERADOR', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      'OPERADOR_SENIOR': { label: 'OPERADOR', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      'OFICIAL_CUMPLIMIENTO': { label: 'OFICIAL CUMPLIMIENTO', class: 'bg-blue-100 text-blue-800 border-blue-300' },
      'REGULADOR_CMF': { label: 'REGULADOR CMF', class: 'bg-purple-100 text-purple-800 border-purple-300' },
      'AUDITOR_CMF': { label: 'REGULADOR CMF', class: 'bg-purple-100 text-purple-800 border-purple-300' }
    };
    const info = rankStyles[savedRank] || { label: savedRank, class: 'bg-slate-100 text-slate-700 border-slate-200' };
    badgeRango.textContent = info.label;
    badgeRango.className = `text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${info.class}`;
  }
  aplicarRestriccionesPorRol();
}

// Aplicar Reglas y Restricciones Estrictas de Privilegios por Rol (RBAC)
function aplicarRestriccionesPorRol() {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'ADMIN_NUAM';
  const esAdmin = (rango === 'ADMIN_NUAM' || rango === 'SUPER_ADMIN');
  const esAuditor = (rango === 'REGULADOR_CMF' || rango === 'OFICIAL_CUMPLIMIENTO' || rango === 'AUDITOR_CMF');

  const banner = document.getElementById('bannerRestriccionRol');
  const txtBanner = document.getElementById('textoRestriccionRol');
  const badgeBanner = document.getElementById('badgeRestriccionRol');
  const iconoBanner = document.getElementById('iconoRestriccionRol');

  const navCalTexto = document.getElementById('navCalificacionesTexto');
  const navCarga = document.getElementById('navCargaMasiva');
  const navAuditoria = document.getElementById('navAuditoria');
  const navBolsa = document.getElementById('navBolsaCentral');
  const navUsr = document.getElementById('navUsuarios');

  const subtituloVista = document.getElementById('badgeSubtituloVista');
  const btnNuevoContenedor = document.getElementById('btnNuevoContenedor');
  const btnNuevo = document.getElementById('btnNuevaCalificacionHero');
  const btnCargaHero = document.getElementById('btnCargaMasivaHero');
  const btnVaciar = document.getElementById('btnVaciarCartera');
  const btnSemilla = document.getElementById('btnRestablecerSemilla');
  const btnCrearUsr = document.getElementById('btnCrearUsuario');
  const tenantSelect = document.getElementById('tenantSelect');

  const cardLV = document.getElementById('cardAutoCargaLV');
  const cardBC = document.getElementById('cardAutoCargaBC');
  const cardCC = document.getElementById('cardAutoCargaCC');
  const cardRechazo = document.getElementById('cardAutoCargaRechazo');

  // Redirección de seguridad si un no-admin está en la sección de usuarios
  if (!esAdmin) {
    const secUsr = document.getElementById('seccionUsuarios');
    if (secUsr && !secUsr.classList.contains('hidden')) {
      cambiarSeccion('calificaciones');
    }
  }

  // 1. ÁREA DE PERFILES Y PERMISOS: Solo accesible y visible para el ADMINISTRADOR
  if (navUsr) {
    if (esAdmin) {
      navUsr.classList.remove('hidden');
    } else {
      navUsr.classList.add('hidden');
    }
  }

  // 2. Vistas personalizadas según el rol
  if (esAuditor) {
    // Vista del auditor / regulador (fiscalización y consulta)
    if (navCalTexto) navCalTexto.textContent = 'Inspección de Carteras';
    if (navCarga) navCarga.classList.add('hidden'); // El auditor no sube archivos
    if (navAuditoria) navAuditoria.classList.remove('hidden'); // Su herramienta clave
    if (subtituloVista) {
      subtituloVista.textContent = (rango === 'OFICIAL_CUMPLIMIENTO')
        ? 'Supervisión Normativa y Cumplimiento (Solo Lectura)'
        : 'Inspección Fiscalizadora CMF (Solo Lectura)';
    }

    if (btnNuevoContenedor) btnNuevoContenedor.classList.add('hidden');
    if (btnNuevo) btnNuevo.classList.add('hidden');
    if (btnCargaHero) btnCargaHero.classList.add('hidden');
    if (btnVaciar) btnVaciar.classList.add('hidden');
    if (btnSemilla) btnSemilla.classList.add('hidden');
    if (btnCrearUsr) btnCrearUsr.classList.add('hidden');

    // El Auditor / Oficial puede auditar cualquier corredora
    if (tenantSelect) {
      tenantSelect.disabled = false;
      tenantSelect.classList.remove('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = (rango === 'OFICIAL_CUMPLIMIENTO')
        ? 'Supervisión de Cumplimiento: Inspección entre carteras'
        : 'Fiscalización CMF: Inspección libre entre corredoras';
    }

    if (banner) {
      if (rango === 'OFICIAL_CUMPLIMIENTO') {
        banner.className = 'mx-6 mt-2 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs bg-blue-50 text-blue-900 border border-blue-200';
        txtBanner.textContent = 'Modo Oficial de Cumplimiento: Supervisión normativa y auditoría interna institucional nuam.';
        badgeBanner.textContent = 'CUMPLIMIENTO';
        badgeBanner.className = 'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-200 text-blue-900';
      } else {
        banner.className = 'mx-6 mt-2 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs bg-purple-50 text-purple-900 border border-purple-200';
        txtBanner.textContent = 'Modo Fiscalizador CMF: Consulta e inspección regulatoria externa en tiempo real.';
        badgeBanner.textContent = 'REGULADOR CMF';
        badgeBanner.className = 'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-200 text-purple-900';
      }
      if (iconoBanner) iconoBanner.setAttribute('data-lucide', 'shield-check');
      banner.classList.remove('hidden');
    }

  } else if (!esAdmin) {
    // Vista del operador (mesa de trabajo operativa)
    if (navCalTexto) navCalTexto.textContent = 'Mis Calificaciones';
    if (navCarga) navCarga.classList.remove('hidden'); // Ingesta masiva activa
    if (navAuditoria) navAuditoria.classList.add('hidden'); // Oculto: no compete a operación diaria
    if (subtituloVista) subtituloVista.textContent = 'Mesa de Trabajo Operativa';

    if (btnNuevoContenedor) btnNuevoContenedor.classList.remove('hidden');
    if (btnNuevo) btnNuevo.classList.remove('hidden');
    if (btnCargaHero) btnCargaHero.classList.remove('hidden');
    if (btnVaciar) btnVaciar.classList.add('hidden'); // Herramientas de riesgo ocultas
    if (btnSemilla) btnSemilla.classList.add('hidden');
    if (btnCrearUsr) btnCrearUsr.classList.add('hidden');

    // Aislamiento Multitenant: Operador bloqueado estrictamente a su corredora asignada
    if (tenantSelect) {
      tenantSelect.disabled = true;
      tenantSelect.classList.add('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Aislamiento Multitenant: Su cuenta está fija a su corredora asignada.';
    }

    // Aislamiento en Carga Masiva: Ocultar tarjetas de otras corredoras
    if (cardLV) cardLV.classList.remove('hidden');
    if (cardBC) cardBC.classList.remove('hidden');
    if (cardCC) cardCC.classList.remove('hidden');
    if (tenantActivo === 'corr-cc-03') {
      if (cardLV) cardLV.classList.add('hidden');
      if (cardBC) cardBC.classList.add('hidden');
    } else if (tenantActivo === 'corr-bc-02') {
      if (cardLV) cardLV.classList.add('hidden');
      if (cardCC) cardCC.classList.add('hidden');
    } else if (tenantActivo === 'corr-lv-01') {
      if (cardBC) cardBC.classList.add('hidden');
      if (cardCC) cardCC.classList.add('hidden');
    }

    if (banner) banner.classList.add('hidden');

  } else {
    // Vista del administrador (control total)
    if (navCalTexto) navCalTexto.textContent = 'Calificaciones';
    if (navCarga) navCarga.classList.remove('hidden');
    if (navAuditoria) navAuditoria.classList.remove('hidden');
    if (subtituloVista) subtituloVista.textContent = 'Consola de Control Central';

    if (btnNuevoContenedor) btnNuevoContenedor.classList.remove('hidden');
    if (btnNuevo) btnNuevo.classList.remove('hidden');
    if (btnCargaHero) btnCargaHero.classList.remove('hidden');
    if (btnVaciar) {
      btnVaciar.classList.remove('hidden');
      btnVaciar.disabled = false;
      btnVaciar.classList.remove('opacity-40', 'cursor-not-allowed');
      btnVaciar.title = 'Elimina las declaraciones registradas de la corredora activa';
    }
    if (btnSemilla) {
      btnSemilla.classList.remove('hidden');
      btnSemilla.disabled = false;
      btnSemilla.classList.remove('opacity-40', 'cursor-not-allowed');
      btnSemilla.title = 'Restablecer posiciones institucionales oficiales';
    }
    if (btnCrearUsr) btnCrearUsr.classList.remove('hidden');

    if (cardLV) cardLV.classList.remove('hidden');
    if (cardBC) cardBC.classList.remove('hidden');
    if (cardCC) cardCC.classList.remove('hidden');

    if (tenantSelect) {
      tenantSelect.disabled = false;
      tenantSelect.classList.remove('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Administrador nuam: Acceso global a todas las corredoras';
    }

    if (banner) banner.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

// Cargar Calificaciones de la Corredora
async function cargarCalificaciones() {
  if (!tenantActivo) return;
  try {
    const res = await authFetch(`/api/declaraciones?tenant=${tenantActivo}`);
    const json = await res.json();
    if (json.success) {
      calificacionesActuales = json.data;
      aplicarFiltrosTabla();
      actualizarMetricas();
    }
  } catch (err) {
    mostrarAlerta('Error cargando declaraciones: ' + err.message, 'error');
  }
}

// Filtro de Modalidad
function filtrarModalidad(tipo) {
  filtroModalidadActivo = tipo;
  ['filtroTodos', 'filtroFactor', 'filtroMonto'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.className = 'px-3 py-1 rounded-full text-slate-500 hover:text-brand-black transition';
  });

  if (tipo === 'TODOS') document.getElementById('filtroTodos').className = 'px-3 py-1 rounded-full bg-white shadow-sm text-brand-black font-bold';
  if (tipo === 'FACTOR') document.getElementById('filtroFactor').className = 'px-3 py-1 rounded-full bg-white shadow-sm text-brand-black font-bold';
  if (tipo === 'MONTO') document.getElementById('filtroMonto').className = 'px-3 py-1 rounded-full bg-white shadow-sm text-brand-black font-bold';

  aplicarFiltrosTabla();
}

function aplicarFiltrosTabla() {
  let lista = [...calificacionesActuales];
  if (filtroModalidadActivo !== 'TODOS') {
    lista = lista.filter(c => c.modalidad === filtroModalidadActivo);
  }

  const q = (document.getElementById('busquedaInput')?.value || '').toLowerCase().trim();
  if (q) {
    lista = lista.filter(c =>
      c.rut_cliente.toLowerCase().includes(q) ||
      c.nemotecnico.toLowerCase().includes(q) ||
      (c.razon_social && c.razon_social.toLowerCase().includes(q))
    );
  }

  renderizarTabla(lista);
}

function filtrarTabla() {
  aplicarFiltrosTabla();
}

// Renderizar Grilla de Calificaciones
function renderizarTabla(lista) {
  const tbody = document.getElementById('tablaCuerpo');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    let mensaje = 'Sin registros para este filtro o corredora.';
    if (filtroModalidadActivo === 'MONTO') {
      mensaje = 'No se registran posiciones bajo modalidad Monto para esta corredora.';
    } else if (filtroModalidadActivo === 'FACTOR') {
      mensaje = 'No se registran posiciones bajo modalidad Factor para esta corredora.';
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-10 text-slate-400">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
          <span class="block text-xs font-semibold text-slate-600">${mensaje}</span>
          <button onclick="filtrarModalidad('TODOS')" class="mt-2 text-[11px] font-bold text-brand-orange hover:underline">
            Ver todas las posiciones
          </button>
        </td>
      </tr>
    `;
    document.getElementById('pieResumen').textContent = 'Mostrando 0 registros';
    if (window.lucide) lucide.createIcons();
    return;
  }

  lista.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/70 transition border-b border-slate-50';

    const esMonto = c.modalidad === 'MONTO';
    const valorFormateado = '$ ' + Number(c.valor_nominal || 0).toLocaleString('es-CL');
    const suma = Number(c.suma_factores || 0).toFixed(6);
    const cumpleRegla = c.suma_factores <= 1.000001;

    tr.innerHTML = `
      <td class="py-2.5 px-2.5 whitespace-nowrap">
        <span class="font-bold text-brand-black block text-xs">${c.rut_cliente}</span>
        <span class="text-[11px] text-slate-400 block truncate max-w-[170px]">${c.razon_social || 'Cliente Inversionista'}</span>
      </td>
      <td class="py-2.5 px-2 whitespace-nowrap">
        <span class="inline-block bg-slate-100 text-brand-black font-mono font-bold px-2 py-0.5 rounded-md text-[11px]">
          ${c.nemotecnico}
        </span>
        ${c.no_inscrito ? '<span class="ml-1 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">No Inscrito</span>' : ''}
      </td>
      <td class="py-2.5 px-2 whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${esMonto ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-brand-orange'}">
          ${c.modalidad}
        </span>
      </td>
      <td class="py-2.5 px-2 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">${valorFormateado}</td>
      <td class="py-2.5 px-2 text-center font-mono font-bold whitespace-nowrap ${cumpleRegla ? 'text-slate-800' : 'text-rose-600'}">
        ${suma}
      </td>
      <td class="py-2.5 px-2 text-center whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${cumpleRegla ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
          ${cumpleRegla ? 'OK (≤ 1.0)' : 'NO CONFORME'}
        </span>
      </td>
      <td class="py-2.5 px-2 text-right space-x-1 whitespace-nowrap">
        ${esUsuarioAuditor()
          ? `<span class="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 font-semibold px-2 py-0.5 rounded-full inline-flex items-center space-x-1" title="Fiscalización: Modo Solo Lectura">
               <i data-lucide="shield" class="w-3 h-3 text-purple-600"></i>
               <span>Solo Lectura</span>
             </span>`
          : `<button onclick="editarCalificacion('${c.id}')" class="p-1 text-slate-400 hover:text-brand-black rounded-lg hover:bg-slate-100 transition" title="Editar">
               <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
             </button>
             <button onclick="eliminarCalificacion('${c.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition" title="Eliminar">
               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
             </button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('pieResumen').textContent = `Mostrando ${lista.length} de ${calificacionesActuales.length} calificaciones`;
  if (window.lucide) lucide.createIcons();
}

// Actualizar Métricas del Hero Card Financiero
function actualizarMetricas() {
  const total = calificacionesActuales.length;
  const kpiTotal = document.getElementById('kpiTotalCalificaciones');
  if (kpiTotal) kpiTotal.textContent = total;

  // Total de posiciones en Hero
  const heroPos = document.getElementById('heroTotalPosiciones');
  if (heroPos) {
    heroPos.textContent = `${total} ${total === 1 ? 'posición activa' : 'posiciones activas'}`;
  }

  // Balance total consolidado (Suma de montos patrimoniales)
  const sumaMontos = calificacionesActuales.reduce((acc, c) => acc + (Number(c.valor_nominal) || 0), 0);
  const heroBalance = document.getElementById('heroBalanceTotal');
  if (heroBalance) {
    heroBalance.textContent = '$ ' + Math.round(sumaMontos).toLocaleString('es-CL');
  }

  // Nombre de corredora en Hero
  const badgeHero = document.getElementById('badgeTenantHero');
  if (badgeHero && corredoraActual) {
    badgeHero.textContent = corredoraActual.nombre;
  }

  // Promedio ponderado de factores
  const kpiProm = document.getElementById('kpiPromedioFactores');
  if (total > 0) {
    const sumaProm = calificacionesActuales.reduce((acc, c) => acc + (c.suma_factores || 0), 0) / total;
    if (kpiProm) kpiProm.textContent = sumaProm.toFixed(6);
  } else {
    if (kpiProm) kpiProm.textContent = '0.000000';
  }
}

// Cambiar Sección en Navbar Horizontal
function cambiarSeccion(seccion) {
  const rango = getRangoActual();
  const esAdmin = esUsuarioAdmin();
  const esAuditor = esUsuarioAuditor();

  // Guard de acceso por rol: Usuarios y Permisos es exclusivo del Administrador
  if (!esAdmin && seccion === 'usuarios') {
    mostrarAlerta('Acceso Denegado: El área de perfiles y permisos es exclusiva del Administrador.', 'error');
    seccion = esAuditor ? 'auditoria' : 'calificaciones';
  }
  if (esAuditor && seccion === 'cargamasiva') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor opera en modo de solo fiscalización y no puede acceder a Carga Masiva.', 'error');
    seccion = 'calificaciones';
  }
  if (!esAdmin && !esAuditor && seccion === 'auditoria') {
    mostrarAlerta('Acceso Denegado: La bitácora de auditoría es para fiscalizadores y administradores.', 'error');
    seccion = 'calificaciones';
  }

  const mapping = {
    calificaciones: { seccionId: 'seccionCalificaciones', navId: 'navCalificaciones' },
    cargamasiva: { seccionId: 'seccionCargaMasiva', navId: 'navCargaMasiva' },
    auditoria: { seccionId: 'seccionAuditoria', navId: 'navAuditoria' },
    bolsacentral: { seccionId: 'seccionBolsaCentral', navId: 'navBolsaCentral' },
    usuarios: { seccionId: 'seccionUsuarios', navId: 'navUsuarios' }
  };

  Object.entries(mapping).forEach(([key, cfg]) => {
    const el = document.getElementById(cfg.seccionId);
    const nav = document.getElementById(cfg.navId);
    if (key === seccion) {
      if (el) el.classList.remove('hidden');
      if (nav) nav.className = 'px-4 py-2 rounded-xl bg-brand-black text-white shadow-xs flex items-center space-x-2 transition font-bold';
    } else {
      if (el) el.classList.add('hidden');
      if (nav) nav.className = 'px-4 py-2 rounded-xl text-slate-600 hover:text-brand-black hover:bg-white/80 flex items-center space-x-2 transition font-semibold';
    }
  });

  if (seccion === 'auditoria') cargarAuditoria();
  if (seccion === 'bolsacentral') cargarBolsaCentral();
  if (seccion === 'usuarios') cargarUsuarios();
  if (seccion === 'calificaciones') cargarCalificaciones();

  aplicarRestriccionesPorRol();
  if (window.lucide) lucide.createIcons();
}


// Validador Fiscal en Tiempo Real (F8..F19)
function calcularSumaFactores() {
  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  let suma = 0;

  campos.forEach(c => {
    const val = parseFloat(document.getElementById(c).value) || 0;
    suma += val;
  });

  suma = Math.round(suma * 1000000) / 1000000;

  const indicador = document.getElementById('indicadorValidador');
  const barra = document.getElementById('barraProgreso');
  const btnGuardar = document.getElementById('btnGuardarForm');
  const msgError = document.getElementById('msgErrorForm');

  const porcentaje = Math.min((suma / 1.0) * 100, 100);
  barra.style.width = porcentaje + '%';

  if (suma <= 1.000001) {
    indicador.textContent = `Suma: ${suma.toFixed(6)} / 1.000000`;
    indicador.className = 'px-3 py-1 rounded-full font-mono font-bold text-[11px] bg-slate-100 text-slate-700 border border-slate-200';
    barra.className = 'bg-brand-black h-2 transition-all duration-200';
    btnGuardar.disabled = false;
    msgError.classList.add('hidden');
  } else {
    indicador.textContent = `Suma: ${suma.toFixed(6)} (INVÁLIDA > 1.0)`;
    indicador.className = 'px-3 py-1 rounded-full font-mono font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200';
    barra.className = 'bg-rose-500 h-2 transition-all duration-200';
    btnGuardar.disabled = true;
    msgError.textContent = `Violación de regla fiscal: La suma (${suma.toFixed(6)}) excede el límite legal de 1.0. Corrija los coeficientes para habilitar el guardado.`;
    msgError.classList.remove('hidden');
  }

  return suma;
}

// Modal Nuevo / Editar
function abrirModalNuevo() {
  if (esUsuarioAuditor()) {
    mostrarAlerta('Acceso Denegado: Los perfiles de fiscalización operan en modo de solo lectura.', 'error');
    return;
  }

  document.getElementById('modalTitulo').textContent = 'Nueva Calificación Tributaria';
  document.getElementById('calificacionId').value = '';
  document.getElementById('formCalificacion').reset();
  document.getElementById('formPeriodo').value = '2026';
  calcularSumaFactores();
  document.getElementById('modalCalificacion').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function editarCalificacion(id) {
  if (esUsuarioAuditor()) {
    mostrarAlerta('Acceso Denegado: Los perfiles de fiscalización operan en modo de solo lectura.', 'error');
    return;
  }

  const item = calificacionesActuales.find(c => c.id === id);
  if (!item) return;

  document.getElementById('modalTitulo').textContent = 'Editar Calificación Tributaria';
  document.getElementById('calificacionId').value = item.id;
  document.getElementById('formRut').value = item.rut_cliente;
  document.getElementById('formRazon').value = item.razon_social || '';
  document.getElementById('formNemotecnico').value = item.nemotecnico;
  document.getElementById('formPeriodo').value = item.periodo_fiscal;
  document.getElementById('formModalidad').value = item.modalidad;
  document.getElementById('formValorNominal').value = item.valor_nominal;
  document.getElementById('formNoInscrito').checked = Boolean(item.no_inscrito);

  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  campos.forEach(c => {
    document.getElementById(c).value = (item.factores && item.factores[c]) || 0;
  });

  calcularSumaFactores();
  document.getElementById('modalCalificacion').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function cerrarModal() {
  document.getElementById('modalCalificacion').classList.add('hidden');
}

// Guardar Calificación
async function guardarCalificacion(e) {
  e.preventDefault();
  if (esUsuarioAuditor()) {
    mostrarAlerta('Acceso Denegado: Los perfiles de fiscalización operan en modo de solo lectura.', 'error');
    return;
  }

  const id = document.getElementById('calificacionId').value;
  const suma = calcularSumaFactores();

  if (suma > 1.000001) {
    mostrarAlerta('No se puede guardar: La sumatoria de factores excede 1.0.', 'error');
    return;
  }

  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  const factores = {};
  campos.forEach(c => {
    factores[c] = parseFloat(document.getElementById(c).value) || 0;
  });

  const usuario = sessionStorage.getItem('nuam_user_email') || 'operador@nuam.cl';
  const payload = {
    tenant_id: tenantActivo,
    usuario,
    rut_cliente: document.getElementById('formRut').value.trim(),
    razon_social: document.getElementById('formRazon').value.trim(),
    nemotecnico: document.getElementById('formNemotecnico').value.trim(),
    periodo_fiscal: document.getElementById('formPeriodo').value,
    modalidad: document.getElementById('formModalidad').value,
    valor_nominal: document.getElementById('formValorNominal').value,
    no_inscrito: document.getElementById('formNoInscrito').checked,
    factores
  };

  try {
    let res;
    if (id) {
      res = await authFetch(`/api/declaraciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await authFetch('/api/declaraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const json = await res.json();
    if (json.success) {
      mostrarAlerta(id ? 'Calificación actualizada con éxito.' : 'Calificación creada con éxito.', 'success');
      cerrarModal();
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta((json.error && json.error.message) || json.error || 'Error al guardar.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de red: ' + err.message, 'error');
  }
}

// Eliminar Calificación
async function eliminarCalificacion(id) {
  if (esUsuarioAuditor()) {
    mostrarAlerta('Acceso Denegado: Los perfiles de fiscalización operan en modo de solo lectura.', 'error');
    return;
  }

  if (!confirm('¿Confirma eliminar esta calificación tributaria? La acción quedará registrada en la bitácora oficial.')) {
    return;
  }

  try {
    const url = tenantActivo ? `/api/declaraciones/${id}?tenant=${tenantActivo}` : `/api/declaraciones/${id}`;
    const res = await authFetch(url, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta('Calificación eliminada correctamente.', 'success');
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta((json.error && json.error.message) || json.error || 'No se pudo eliminar.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error: ' + err.message, 'error');
  }
}

// Depuración de cartera de la corredora activa
async function vaciarCartera() {
  if (!esUsuarioAdmin()) {
    mostrarAlerta('Acceso Denegado: Su rango actual no tiene autorización para vaciar la cartera. Acción reservada para Administradores nuam.', 'error');
    return;
  }

  const nombreCorredora = (corredoraActual && corredoraActual.nombre) || (tenantActivo ? tenantActivo.replace('_', ' ') : 'la corredora');
  if (!confirm(`¿Confirma eliminar todas las calificaciones tributarias registradas de ${nombreCorredora}? La operación queda registrada en el Registro Oficial de Auditoría y no puede deshacerse.`)) {
    return;
  }

  try {
    if (calificacionesActuales.length === 0) {
      mostrarAlerta('No hay calificaciones registradas para vaciar en esta cartera.', 'info');
      return;
    }
    const elims = calificacionesActuales.map(c => {
      const url = tenantActivo ? `/api/declaraciones/${c.id}?tenant=${tenantActivo}` : `/api/declaraciones/${c.id}`;
      return authFetch(url, { method: 'DELETE' });
    });
    await Promise.all(elims);
    mostrarAlerta(`Cartera de ${nombreCorredora} vaciada correctamente.`, 'info');
    await cargarCalificaciones();
    await cargarAuditoria();
  } catch (err) {
    mostrarAlerta('Error al vaciar cartera: ' + err.message, 'error');
  }
}

// Restablecer Posiciones Semilla Oficiales
async function restablecerSemilla() {
  if (!esUsuarioAdmin()) {
    mostrarAlerta('Acceso Denegado: Su rango actual no tiene autorización para restablecer carteras. Acción reservada para Administradores nuam.', 'error');
    return;
  }

  if (!confirm('¿Confirma cargar las posiciones tributarias canónicas de referencia en esta corredora?')) {
    return;
  }

  const semillas = [
    {
      tenant_id: tenantActivo || 'corr-lv-01',
      rut_cliente: '96.555.120-4',
      razon_social: 'Inversiones Santa Blanca S.A.',
      nemotecnico: 'CHILE',
      periodo_fiscal: 2026,
      modalidad: 'FACTOR',
      valor_nominal: 450000000,
      no_inscrito: 0,
      factores: { f08: 0.45, f09: 0.15, f10: 0.05, f11: 0, f12: 0, f13: 0.15, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 }
    },
    {
      tenant_id: tenantActivo || 'corr-lv-01',
      rut_cliente: '77.102.340-1',
      razon_social: 'Rentas y Valores El Golf SpA',
      nemotecnico: 'SQM-B',
      periodo_fiscal: 2026,
      modalidad: 'MONTO',
      valor_nominal: 1200000000,
      no_inscrito: 0,
      factores: { f08: 0.5, f09: 0.1, f10: 0.1, f11: 0.05, f12: 0, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 }
    }
  ];

  try {
    for (const semilla of semillas) {
      await authFetch('/api/declaraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(semilla)
      });
    }
    mostrarAlerta('Posiciones institucionales de referencia restablecidas con éxito.', 'success');
    await cargarCalificaciones();
    await cargarAuditoria();
  } catch (err) {
    mostrarAlerta('Error restableciendo posiciones: ' + err.message, 'error');
  }
}

// Carga Masiva Rápida (Widget Superior)
function archivoRapidoSeleccionado(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const lbl = document.getElementById('nombreArchivoRapido');
    if (lbl) lbl.textContent = `Procesando ${file.name.substring(0, 14)}...`;
    subirArchivoRapido();
  }
}

async function subirArchivoRapido() {
  const input = document.getElementById('archivoMasivoRapido');
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  const formData = new FormData();
  formData.append('archivo', file);
  formData.append('tenant_id', tenantActivo);
  formData.append('usuario', 'operador@nuam.cl');

  const lbl = document.getElementById('nombreArchivoRapido');

  try {
    const res = await authFetch('/api/declaraciones/carga-masiva', { method: 'POST', body: formData });
    const json = await res.json();

    if (json.success) {
      const r = json.data || json.resultado;
      batchIdRechazosActivo = r.batchId;

      const boxRechazos = document.getElementById('boxDescargaRechazos');
      if (boxRechazos) {
        if (r.rechazados > 0) {
          boxRechazos.classList.remove('hidden');
        } else {
          boxRechazos.classList.add('hidden');
        }
      }

      mostrarAlerta(`Carga masiva completada: ${r.insertados} insertados, ${r.actualizados} actualizados, ${r.rechazados} rechazados.`, 'success');
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta((json.error && json.error.message) || json.error || 'Error procesando lote.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error en ingesta: ' + err.message, 'error');
  } finally {
    if (lbl) lbl.textContent = 'Cargar CSV/XLSX';
    input.value = '';
  }
}

function descargarCsvRechazos() {
  if (!batchIdRechazosActivo) {
    mostrarAlerta('No hay un lote con rechazos activo para descargar.', 'info');
    return;
  }
  const token = getAuthToken();
  window.location.href = `/api/declaraciones/carga-masiva/rechazos/${batchIdRechazosActivo}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

function descargarPlantilla() {
  const token = getAuthToken();
  window.location.href = `/api/declaraciones/plantilla${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

function descargarPlantillaExcel() {
  const token = getAuthToken();
  window.location.href = `/api/declaraciones/plantilla${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

let archivoEnMemoria = null;

function exportarDeclaracion(formato = 'xlsx') {
  if (!tenantActivo) return;
  const token = getAuthToken();
  window.location.href = `/api/declaraciones/exportar?tenant=${tenantActivo}&formato=${formato}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

function exportarDeclaracionExcel() {
  exportarDeclaracion('xlsx');
}

// Carga Masiva Sección Completa
function archivoFullSeleccionado(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  archivoEnMemoria = file;
  const sizeKb = (file.size / 1024).toFixed(1);

  const nombreSpan = document.getElementById('nombreArchivoFull');
  const tituloDrop = document.getElementById('tituloDropzoneFull');
  const btnProcesar = document.getElementById('btnProcesarFull');
  const btnCancelar = document.getElementById('btnCancelarFull');
  const estadoTxt = document.getElementById('estadoCargaFull');

  if (nombreSpan) nombreSpan.textContent = `Archivo listo: ${file.name} (${sizeKb} KB)`;
  if (tituloDrop) tituloDrop.textContent = file.name;
  if (btnProcesar) btnProcesar.disabled = false;
  if (btnCancelar) btnCancelar.classList.remove('hidden');
  if (estadoTxt) estadoTxt.textContent = `Listo para procesar: actualiza las posiciones existentes e incorpora las nuevas`;
}

function cancelarArchivoFull() {
  archivoEnMemoria = null;
  const input = document.getElementById('archivoMasivoFull');
  if (input) input.value = '';

  const nombreSpan = document.getElementById('nombreArchivoFull');
  const tituloDrop = document.getElementById('tituloDropzoneFull');
  const btnProcesar = document.getElementById('btnProcesarFull');
  const btnCancelar = document.getElementById('btnCancelarFull');
  const estadoTxt = document.getElementById('estadoCargaFull');

  if (nombreSpan) nombreSpan.textContent = 'Formato oficial de Declaración Jurada 1922';
  if (tituloDrop) tituloDrop.textContent = 'Haga clic o arrastre un archivo Excel (.xlsx) o CSV';
  if (btnProcesar) btnProcesar.disabled = false;
  if (btnCancelar) btnCancelar.classList.add('hidden');
  if (estadoTxt) estadoTxt.textContent = 'Seleccione un archivo para habilitar el procesamiento';
}

async function subirArchivoFull(archivoDirecto = null) {
  if (esUsuarioAuditor()) {
    mostrarAlerta('Acceso Denegado: Los perfiles de fiscalización operan en modo de solo lectura y no pueden ejecutar ingestas.', 'error');
    return;
  }

  const input = document.getElementById('archivoMasivoFull');
  const file = archivoDirecto || (input && input.files && input.files[0]) || archivoEnMemoria;

  if (!file) {
    mostrarAlerta('Por favor seleccione un archivo primero o elija un lote para auto-cargar.', 'error');
    return;
  }

  const esRolFijo = esUsuarioOperador();
  if (esRolFijo && file && file.name) {
    const fn = file.name.toLowerCase();
    const tenantArchivo =
      fn.includes('larrainvial') || fn.includes('larrain') ? 'corr-lv-01' :
      fn.includes('banchile') ? 'corr-bc-02' :
      fn.includes('credicorp') ? 'corr-cc-03' : null;
    if (tenantArchivo && tenantArchivo !== tenantActivo) {
      mostrarAlerta('Aislamiento Multitenant: No puede cargar archivos que pertenecen a otra corredora. Su cuenta está asignada exclusivamente a su corredora.', 'error');
      return;
    }
  }

  const formData = new FormData();
  formData.append('archivo', file);
  formData.append('tenant_id', tenantActivo);
  formData.append('usuario', sessionStorage.getItem('nuam_user_email') || 'operador@nuam.cl');

  const btnProcesar = document.getElementById('btnProcesarFull');
  const estadoTxt = document.getElementById('estadoCargaFull');

  if (btnProcesar) {
    btnProcesar.disabled = true;
    btnProcesar.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> <span>Procesando lote...</span>`;
  }
  if (estadoTxt) estadoTxt.textContent = 'Validando regla fiscal fila por fila y procesando el lote...';

  try {
    const res = await authFetch('/api/declaraciones/carga-masiva', { method: 'POST', body: formData });
    const json = await res.json();

    if (json.success) {
      const r = json.data || json.resultado;
      batchIdRechazosActivo = r.batchId;

      // Actualizar panel de resultados
      const panel = document.getElementById('panelResultadoLote');
      const boxRechazos = document.getElementById('contenedorBotonRechazosFull');
      const topRechazos = document.getElementById('boxDescargaRechazos');

      document.getElementById('resTotalLeidos').textContent = r.totalLeidos;
      document.getElementById('resTotalInsertados').textContent = r.insertados;
      document.getElementById('resTotalActualizados').textContent = r.actualizados;
      document.getElementById('resTotalRechazados').textContent = r.rechazados;

      if (r.rechazados > 0) {
        if (boxRechazos) boxRechazos.classList.remove('hidden');
        if (topRechazos) topRechazos.classList.remove('hidden');
      } else {
        if (boxRechazos) boxRechazos.classList.add('hidden');
        if (topRechazos) topRechazos.classList.add('hidden');
      }

      if (panel) panel.classList.remove('hidden');
      mostrarAlerta(`Procesamiento exitoso: ${r.insertados} insertados, ${r.actualizados} actualizados, ${r.rechazados} rechazados.`, 'success');

      await cargarCalificaciones();
      await cargarAuditoria();
      cancelarArchivoFull();
    } else {
      mostrarAlerta(json.error || 'Error procesando lote.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error en la comunicación con el servidor: ' + err.message, 'error');
  } finally {
    if (btnProcesar) {
      btnProcesar.disabled = false;
      btnProcesar.innerHTML = `<i data-lucide="upload-cloud" class="w-4 h-4"></i><span>Procesar Ingesta Masiva</span>`;
      if (window.lucide) lucide.createIcons();
    }
    if (estadoTxt) estadoTxt.textContent = 'Procesamiento concluido.';
  }
}

// Configurar Drag & Drop en el dropzone de Carga Masiva
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzoneFull');
  const fileInput = document.getElementById('archivoMasivoFull');
  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('border-brand-black', 'bg-slate-100');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('border-brand-black', 'bg-slate-100');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      archivoFullSeleccionado(fileInput);
    }
  });
});

function formatearDetalleAuditoria(ev) {
  if (!ev) return '-';
  const d = ev.detalle;
  if (d && d !== 'null' && d !== 'undefined' && d !== '{}') {
    if (typeof d === 'object') {
      const entries = Object.entries(d);
      if (entries.length > 0) {
        return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
      }
    } else if (typeof d === 'string') {
      const trimmed = d.trim();
      if (trimmed && trimmed !== 'null' && trimmed !== 'undefined' && trimmed !== '{}') {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') {
            const entries = Object.entries(parsed);
            if (entries.length > 0) {
              return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
            }
          } else if (parsed && parsed !== 'null' && parsed !== 'undefined') {
            return String(parsed);
          }
        } catch {
          return trimmed;
        }
      }
    }
  }

  const accionesMap = {
    'LOGIN': 'Inicio de sesión exitoso en terminal B2B',
    'LOGOUT': 'Cierre de sesión voluntario',
    'EXPORTAR': 'Exportación consolidada de cartera',
    'CARGA_MASIVA': 'Carga masiva procesada exitosamente',
    'CARGA_MASIVA_INSERTAR': 'Inserción masiva de declaración',
    'CARGA_MASIVA_ACTUALIZAR': 'Actualización masiva de declaración',
    'DECLARACION_CREAR': 'Registro de nueva calificación tributaria',
    'DECLARACION_ACTUALIZAR': 'Actualización de calificación tributaria',
    'DECLARACION_ELIMINAR': 'Eliminación de calificación tributaria',
    'USUARIO_CREAR': 'Creación de cuenta institucional',
    'USUARIO_ACTUALIZAR': 'Actualización de cuenta institucional',
    'USUARIO_ELIMINAR': 'Revocación de cuenta institucional',
    'INSTRUMENTO_CREAR': 'Registro de instrumento bursátil',
    'INSTRUMENTO_ACTUALIZAR': 'Actualización de instrumento bursátil',
    'INSTRUMENTO_ELIMINAR': 'Baja de instrumento bursátil',
    'SEMILLA_RESTABLECER': 'Restablecimiento de posiciones canónicas',
    'CARTERA_VACIAR': 'Vaciado de cartera'
  };

  return accionesMap[ev.accion] || (ev.entidad ? `Operación sobre ${ev.entidad}` : '-');
}

// Cargar Auditoría (Feed Oscuro y Tabla Completa)
async function cargarAuditoria() {
  try {
    const res = await authFetch(`/api/auditoria?tenant=${tenantActivo}`);
    const json = await res.json();
    if (json.success) {
      // Tabla completa del Registro Oficial de Auditoría
      const tbody = document.getElementById('tablaAuditoriaFull');
      if (tbody) {
        tbody.innerHTML = '';
        const eventos = json.data || [];
        eventos.forEach(ev => {
          const tr = document.createElement('tr');
          const fecha = new Date(ev.created_at || ev.timestamp).toLocaleString('es-CL');
          const usuarioNom = ev.usuario_email || ev.usuario || 'operador';
          const detalleTxt = formatearDetalleAuditoria(ev);

          tr.innerHTML = `
            <td class="py-2.5 px-3 text-slate-500">${fecha}</td>
            <td class="py-2.5 px-3 font-semibold text-brand-black">${usuarioNom}</td>
            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${ev.accion}</span></td>
            <td class="py-2.5 px-3 text-slate-600">${ev.entidad}</td>
            <td class="py-2.5 px-3 text-slate-500 truncate max-w-sm" title="${detalleTxt}">${detalleTxt}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error('Error cargando auditoría:', err);
  }
}

// Cargar Bolsa Central nuam (Catálogo)
async function cargarBolsaCentral() {
  try {
    const res = await authFetch('/api/instrumentos');
    const json = await res.json();
    if (json.success) {
      const grid = document.getElementById('gridInstrumentosFull');
      if (grid) {
        grid.innerHTML = '';
        const instrumentos = json.data || json.instrumentos || [];
        instrumentos.forEach(i => {
          const div = document.createElement('div');
          div.className = 'p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs';
          div.innerHTML = `
            <div>
              <span class="font-bold text-brand-black block font-mono">${i.nemotecnico}</span>
              <span class="text-[11px] text-slate-500">${i.razon_social}</span>
            </div>
            <span class="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">${i.mercado || 'OFICIAL'}</span>
          `;
          grid.appendChild(div);
        });
      }
    }
  } catch (err) {
    console.error('Error cargando bolsa central:', err);
  }
}

// Monitoreo de Salud del Servidor
async function verificarSalud() {
  try {
    const inicio = performance.now();
    const res = await fetch('/api/health');
    const latencia = Math.round(performance.now() - inicio);
    const json = await res.json();

    if (json.success && json.data && json.data.estado === 'activo') {
      const landingStatus = document.getElementById('landingGatewayStatus');
      if (landingStatus) {
        landingStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block mr-1.5"></span> Servicio Operacional • Plataforma Disponible`;
        landingStatus.className = 'text-emerald-700 font-semibold text-xs bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 flex items-center space-x-1.5';
      }
    }
  } catch (e) {
    console.error('Sin conexión con /api/health');
    const landingStatus = document.getElementById('landingGatewayStatus');
    if (landingStatus) {
      landingStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1.5"></span> Servicio No Disponible`;
      landingStatus.className = 'text-rose-600 font-semibold text-xs bg-rose-50 px-3.5 py-1.5 rounded-full border border-rose-200 flex items-center space-x-1.5';
    }
  }
}

// Alertas Toast
function mostrarAlerta(msg, tipo = 'info') {
  const box = document.getElementById('alertaGlobal');
  const txt = document.getElementById('alertaMensaje');
  const icono = document.getElementById('alertaIcono');

  txt.textContent = msg;
  box.className = 'mx-6 mt-4 p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-sm border transition-all';

  if (tipo === 'success') {
    box.classList.add('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    icono.setAttribute('data-lucide', 'check-circle-2');
  } else if (tipo === 'error') {
    box.classList.add('bg-rose-50', 'text-rose-800', 'border-rose-200');
    icono.setAttribute('data-lucide', 'alert-circle');
  } else {
    box.classList.add('bg-slate-100', 'text-slate-800', 'border-slate-200');
    icono.setAttribute('data-lucide', 'info');
  }

  box.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  setTimeout(cerrarAlerta, 5000);
}

function cerrarAlerta() {
  const box = document.getElementById('alertaGlobal');
  if (box) box.classList.add('hidden');
}

// Gestión de usuarios, roles y rangos institucionales (RBAC)

async function cargarUsuarios() {
  try {
    const res = await authFetch('/api/usuarios');
    const json = await res.json();
    if (json.success) {
      usuariosActuales = (json.data || []).map(u => ({
        ...u,
        rango: u.rol || u.rango,
        estado: (u.activo === 1 || u.activo === true || u.estado === 'ACTIVO') ? 'ACTIVO' : 'SUSPENDIDO'
      }));
      actualizarMetricasUsuarios();
      filtrarTablaUsuarios();
    } else {
      mostrarAlerta((json.error && json.error.message) || json.error || 'Acceso restringido a usuarios', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error cargando cuentas de usuarios: ' + err.message, 'error');
  }
}

function actualizarMetricasUsuarios() {
  const total = usuariosActuales.length;
  const superAdmins = usuariosActuales.filter(u => u.rol === 'ADMIN_NUAM' || u.rango === 'ADMIN_NUAM' || u.rango === 'SUPER_ADMIN').length;
  const operadores = usuariosActuales.filter(u => u.rol === 'OPERADOR_CORREDORA' || u.rango === 'OPERADOR_CORREDORA' || u.rango === 'OPERADOR_SENIOR').length;
  const auditores = usuariosActuales.filter(u => u.rol === 'REGULADOR_CMF' || u.rol === 'OFICIAL_CUMPLIMIENTO' || u.rango === 'REGULADOR_CMF' || u.rango === 'OFICIAL_CUMPLIMIENTO' || u.rango === 'AUDITOR_CMF').length;

  const elTotal = document.getElementById('statTotalUsuarios');
  const elSuper = document.getElementById('statSuperAdmins');
  const elAdmins = document.getElementById('statAdminsMesa');
  const elOper = document.getElementById('statOperadoresAuditores');

  if (elTotal) elTotal.textContent = `${total} ${total === 1 ? 'Cuenta' : 'Cuentas'}`;
  if (elSuper) elSuper.textContent = `${superAdmins} Administrador${superAdmins === 1 ? '' : 'es'}`;
  if (elAdmins) elAdmins.textContent = `${operadores} Operador${operadores === 1 ? '' : 'es'}`;
  if (elOper) elOper.textContent = `${auditores} Fiscalizador${auditores === 1 ? '' : 'es'}`;
}

function filtrarUsuariosRango(rango) {
  filtroUsuarioRangoActivo = rango;
  const btnIds = {
    'TODOS': 'filtroUsrTodos',
    'ADMIN_NUAM': 'filtroUsrSuper',
    'SUPER_ADMIN': 'filtroUsrSuper',
    'OPERADOR_CORREDORA': 'filtroUsrOp',
    'OPERADOR_SENIOR': 'filtroUsrOp',
    'REGULADOR_CMF': 'filtroUsrAuditor',
    'AUDITOR_CMF': 'filtroUsrAuditor',
    'OFICIAL_CUMPLIMIENTO': 'filtroUsrAdmin'
  };

  Object.entries(btnIds).forEach(([r, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (r === rango) {
      btn.className = 'px-3 py-1.5 rounded-lg bg-white shadow-2xs font-bold text-brand-black';
    } else {
      btn.className = 'px-3 py-1.5 rounded-lg hover:text-brand-black text-slate-600 font-semibold';
    }
  });

  filtrarTablaUsuarios();
}

function filtrarTablaUsuarios() {
  const input = document.getElementById('busquedaUsuariosInput');
  const query = input ? input.value.trim().toLowerCase() : '';

  let filtrados = usuariosActuales;
  if (filtroUsuarioRangoActivo !== 'TODOS') {
    if (filtroUsuarioRangoActivo === 'ADMIN_NUAM' || filtroUsuarioRangoActivo === 'SUPER_ADMIN') {
      filtrados = filtrados.filter(u => (u.rol === 'ADMIN_NUAM' || u.rango === 'ADMIN_NUAM' || u.rango === 'SUPER_ADMIN'));
    } else if (filtroUsuarioRangoActivo === 'OPERADOR_CORREDORA' || filtroUsuarioRangoActivo === 'OPERADOR_SENIOR') {
      filtrados = filtrados.filter(u => (u.rol === 'OPERADOR_CORREDORA' || u.rango === 'OPERADOR_CORREDORA' || u.rango === 'OPERADOR_SENIOR'));
    } else if (filtroUsuarioRangoActivo === 'REGULADOR_CMF' || filtroUsuarioRangoActivo === 'AUDITOR' || filtroUsuarioRangoActivo === 'AUDITOR_CMF') {
      filtrados = filtrados.filter(u => (u.rol === 'REGULADOR_CMF' || u.rol === 'OFICIAL_CUMPLIMIENTO' || u.rango === 'REGULADOR_CMF' || u.rango === 'AUDITOR_CMF'));
    } else {
      filtrados = filtrados.filter(u => (u.rol === filtroUsuarioRangoActivo || u.rango === filtroUsuarioRangoActivo));
    }
  }

  if (query) {
    filtrados = filtrados.filter(u => 
      (u.nombre && u.nombre.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.cargo && u.cargo.toLowerCase().includes(query)) ||
      (u.corredora_nombre && u.corredora_nombre.toLowerCase().includes(query)) ||
      (u.rol && u.rol.toLowerCase().includes(query)) ||
      (u.rango && u.rango.toLowerCase().includes(query))
    );
  }

  renderizarTablaUsuarios(filtrados);
}

function renderizarTablaUsuarios(lista) {
  const tbody = document.getElementById('tablaUsuariosCuerpo');
  const pie = document.getElementById('pieResumenUsuarios');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-slate-400">
          No se encontraron cuentas bajo el criterio de búsqueda seleccionado.
        </td>
      </tr>
    `;
    if (pie) pie.textContent = `Mostrando 0 de ${usuariosActuales.length} cuentas`;
    return;
  }

  const badgeRangos = {
    'ADMIN_NUAM': { label: 'ADMINISTRADOR', bg: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
    'SUPER_ADMIN': { label: 'ADMINISTRADOR', bg: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
    'OPERADOR_CORREDORA': { label: 'OPERADOR', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
    'OPERADOR_SENIOR': { label: 'OPERADOR', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
    'OFICIAL_CUMPLIMIENTO': { label: 'CUMPLIMIENTO', bg: 'bg-blue-100 text-blue-800 border-blue-300', dot: 'bg-blue-500' },
    'REGULADOR_CMF': { label: 'REGULADOR CMF', bg: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' },
    'AUDITOR_CMF': { label: 'REGULADOR CMF', bg: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' }
  };

  const miRangoActual = getRangoActual();

  lista.forEach(u => {
    const rolKey = u.rol || u.rango;
    const badgeInfo = badgeRangos[rolKey] || { 
      label: rolKey, 
      bg: 'bg-slate-100 text-slate-700 border-slate-200', 
      dot: 'bg-slate-400' 
    };

    const estadoActivo = (u.activo === 1 || u.activo === true || u.estado === 'ACTIVO');
    const initials = u.avatar || (u.nombre ? u.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'OP');

    // Permisos por fila: Exclusivo del Administrador
    const puedeEditarFila = esUsuarioAdmin();
    const puedeEliminarFila = esUsuarioAdmin() && rolKey !== 'ADMIN_NUAM' && rolKey !== 'SUPER_ADMIN';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
    tr.innerHTML = `
      <td class="py-3 px-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-full bg-brand-black text-white flex items-center justify-center font-bold text-[11px] shadow-2xs">
            ${initials}
          </div>
          <div>
            <div class="font-bold text-brand-black flex items-center space-x-1.5">
              <span>${u.nombre}</span>
              ${u.id === 'usr-001' ? '<span class="text-[8px] bg-amber-100 text-amber-800 px-1 rounded font-mono font-bold">ROOT</span>' : ''}
            </div>
            <span class="text-[10px] text-slate-400 block">${u.email}</span>
          </div>
        </div>
      </td>
      <td class="py-3 px-3">
        <span class="font-semibold text-slate-700 block">${u.corredora_nombre || 'Holding nuam'}</span>
        <span class="text-[10px] text-slate-400 font-mono">${u.tenant_id}</span>
      </td>
      <td class="py-3 px-3">
        <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${badgeInfo.bg}">
          <span class="w-1.5 h-1.5 rounded-full ${badgeInfo.dot}"></span>
          <span>${badgeInfo.label}</span>
        </span>
      </td>
      <td class="py-3 px-3 text-slate-600 text-xs">
        ${u.cargo || 'Operador'}
      </td>
      <td class="py-3 px-3 text-center">
        ${estadoActivo 
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVO</span>'
          : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">SUSPENDIDO</span>'
        }
      </td>
      <td class="py-3 px-3 text-right">
        <div class="flex items-center justify-end space-x-1">
          <button onclick="iniciarSesionComoUsuario('${u.id}')" class="px-2 py-1 bg-brand-orangeLight hover:bg-brand-orange text-brand-orange hover:text-white border border-brand-orangeBorder text-[10px] font-bold rounded-lg transition flex items-center space-x-1" title="Iniciar sesión como este usuario">
            <i data-lucide="log-in" class="w-3 h-3"></i>
            <span>Acceder</span>
          </button>
          ${puedeEditarFila ? `
          <button onclick="abrirModalUsuario('${u.id}')" class="p-1 text-slate-400 hover:text-brand-black rounded-lg hover:bg-slate-100 transition" title="Editar privilegios">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>` : ''}
          ${puedeEliminarFila ? `
          <button onclick="eliminarUsuarioCuenta('${u.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition" title="Eliminar cuenta">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (pie) pie.textContent = `Mostrando ${lista.length} de ${usuariosActuales.length} cuentas institucionales`;
  if (window.lucide) lucide.createIcons();
}

async function iniciarSesionComoUsuario(id) {
  const u = usuariosActuales.find(x => x.id === id);
  if (!u) return;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: 'Nuam2026!' })
    });
    const json = await res.json();
    if (json.success && json.data) {
      const { token, usuario } = json.data;
      sessionStorage.setItem('nuam_auth', 'true');
      sessionStorage.setItem('nuam_token', token);
      sessionStorage.setItem('nuam_user', usuario.nombre);
      sessionStorage.setItem('nuam_user_email', usuario.email);
      sessionStorage.setItem('nuam_user_cargo', usuario.cargo || usuario.rol);
      sessionStorage.setItem('nuam_user_rank', usuario.rol);
      sessionStorage.setItem('nuam_user_initials', usuario.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase());
      sessionStorage.setItem('nuam_user_permissions', JSON.stringify(usuario.permissions || []));

      if (usuario.tenant_id && usuario.tenant_id !== 'GLOBAL') {
        tenantActivo = usuario.tenant_id;
      } else {
        tenantActivo = 'corr-lv-01';
      }
      sessionStorage.setItem('nuam_tenant', tenantActivo);

      await mostrarIntranet();
      cambiarSeccion('calificaciones');
      mostrarAlerta(`Sesión cambiada a: ${usuario.nombre} (${usuario.rol}).`, 'success');
    } else {
      mostrarAlerta('No se pudo iniciar sesión con la cuenta seleccionada: ' + ((json.error && json.error.message) || 'Error de autenticación'), 'error');
    }
  } catch (err) {
    mostrarAlerta('Error al cambiar de sesión: ' + err.message, 'error');
  }
}

function abrirModalUsuario(id = null) {
  if (!esUsuarioAdmin()) {
    mostrarAlerta('Acceso Denegado: Su rango no posee autorización para administrar cuentas de usuario.', 'error');
    return;
  }

  const modal = document.getElementById('modalUsuario');
  const titulo = document.getElementById('modalUsuarioTitulo');
  const inputId = document.getElementById('usuarioId');
  const inputNombre = document.getElementById('formUsuarioNombre');
  const inputEmail = document.getElementById('formUsuarioEmail');
  const selectTenant = document.getElementById('formUsuarioTenant');
  const selectRango = document.getElementById('formUsuarioRango');
  const inputCargo = document.getElementById('formUsuarioCargo');
  const selectEstado = document.getElementById('formUsuarioEstado');
  const btnGuardar = document.getElementById('btnGuardarUsuario');

  if (id) {
    const u = usuariosActuales.find(x => x.id === id);
    if (!u) return;

    if (titulo) titulo.textContent = `Editar Cuenta: ${u.nombre}`;
    if (btnGuardar) btnGuardar.textContent = 'Guardar Cambios';
    if (inputId) inputId.value = u.id;
    if (inputNombre) inputNombre.value = u.nombre;
    if (inputEmail) inputEmail.value = u.email;
    if (selectTenant) {
      selectTenant.value = u.tenant_id;
      selectTenant.disabled = false;
    }
    if (selectRango) {
      selectRango.value = u.rol || u.rango || 'OPERADOR_CORREDORA';
    }
    if (inputCargo) inputCargo.value = u.cargo || '';
    if (selectEstado) selectEstado.value = (u.activo === 1 || u.activo === true || u.estado === 'ACTIVO') ? 'ACTIVO' : 'SUSPENDIDO';
  } else {
    if (titulo) titulo.textContent = 'Crear Cuenta Institucional';
    if (btnGuardar) btnGuardar.textContent = 'Guardar Cuenta';
    if (inputId) inputId.value = '';
    if (inputNombre) inputNombre.value = '';
    if (inputEmail) inputEmail.value = '';
    if (selectTenant) {
      selectTenant.value = tenantActivo || 'corr-lv-01';
      selectTenant.disabled = false;
    }
    if (selectRango) {
      selectRango.value = 'OPERADOR_CORREDORA';
    }
    if (inputCargo) inputCargo.value = 'Operador Mesa Tributaria';
    if (selectEstado) selectEstado.value = 'ACTIVO';
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function ajustarOpcionesRango(miRango, selectRango) {
  if (!selectRango) return;
  const opciones = selectRango.querySelectorAll('option');
  opciones.forEach(opt => {
    opt.disabled = false;
  });
}

function cerrarModalUsuario() {
  const modal = document.getElementById('modalUsuario');
  if (modal) modal.classList.add('hidden');
}

async function guardarUsuario(e) {
  if (e) e.preventDefault();
  if (!esUsuarioAdmin()) {
    mostrarAlerta('Acceso Denegado: Su rango no posee autorización para guardar cuentas.', 'error');
    return;
  }

  const id = document.getElementById('usuarioId').value;
  const nombre = document.getElementById('formUsuarioNombre').value.trim();
  const email = document.getElementById('formUsuarioEmail').value.trim();
  let tenant_id = document.getElementById('formUsuarioTenant').value;
  const rolInput = document.getElementById('formUsuarioRango').value;
  const mapaRoles = {
    'SUPER_ADMIN': 'ADMIN_NUAM',
    'OPERADOR_SENIOR': 'OPERADOR_CORREDORA',
    'ADMIN_CORREDORA': 'OPERADOR_CORREDORA',
    'AUDITOR_CMF': 'REGULADOR_CMF',
    'ADMIN_NUAM': 'ADMIN_NUAM',
    'OPERADOR_CORREDORA': 'OPERADOR_CORREDORA',
    'OFICIAL_CUMPLIMIENTO': 'OFICIAL_CUMPLIMIENTO',
    'REGULADOR_CMF': 'REGULADOR_CMF'
  };
  const rol = mapaRoles[rolInput] || rolInput;
  const cargo = document.getElementById('formUsuarioCargo').value.trim();
  const estado = document.getElementById('formUsuarioEstado').value;
  const activo = estado === 'ACTIVO' ? 1 : 0;

  try {
    let res;
    if (id) {
      res = await authFetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, tenant_id, rol, cargo, activo })
      });
    } else {
      res = await authFetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password: 'Nuam2026!', tenant_id, rol, cargo, activo })
      });
    }

    const json = await res.json();
    if (json.success) {
      mostrarAlerta(id ? 'Cuenta institucional actualizada con éxito.' : 'Nueva cuenta creada y rol asignado correctamente.', 'success');
      cerrarModalUsuario();
      await cargarUsuarios();
      actualizarBadgesTenant();
    } else {
      mostrarAlerta('Error: ' + ((json.error && json.error.message) || json.error || json.mensaje || json.message || 'No se pudo guardar el usuario.'), 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de comunicación con el servidor: ' + err.message, 'error');
  }
}

async function eliminarUsuarioCuenta(id) {
  if (!esUsuarioAdmin()) {
    mostrarAlerta('Acceso Denegado: Su rango no posee autorización para revocar cuentas.', 'error');
    return;
  }

  const u = usuariosActuales.find(x => x.id === id);
  if (!u) return;

  const nombre = u ? u.nombre : 'este usuario';
  if (!confirm(`¿Está seguro de revocar y eliminar la cuenta de ${nombre}?`)) {
    return;
  }

  try {
    const res = await authFetch(`/api/usuarios/${id}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta('Cuenta eliminada de los registros institucionales.', 'success');
      await cargarUsuarios();
    } else {
      mostrarAlerta('Error al eliminar: ' + ((json.error && json.error.message) || json.error || 'No se pudo eliminar la cuenta.'), 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de comunicación: ' + err.message, 'error');
  }
}
