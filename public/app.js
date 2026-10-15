/**
 * CLIENTE JAVASCRIPT - INTRANET NUAM EXCHANGE
 * Diseño de Alto Contraste & Multi-Panel
 */

let corredoras = [];
let tenantActivo = null;
let corredoraActual = null;
let calificacionesActuales = [];
let batchIdRechazosActivo = null;
let filtroModalidadActivo = 'TODOS';
let usuariosActuales = [];
let filtroUsuarioRangoActivo = 'TODOS';

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  await cargarCorredoras();
  
  // Verificar si hay sesión activa en sessionStorage
  if (sessionStorage.getItem('nuam_auth') === 'true') {
    const savedTenant = sessionStorage.getItem('nuam_tenant');
    if (savedTenant) tenantActivo = savedTenant;
    mostrarIntranet();
  } else {
    mostrarLanding();
  }

  await verificarSalud();
  setInterval(verificarSalud, 15000);
});

// Cargar Corredoras (Tenants) en Navbar y Formulario de Login
async function cargarCorredoras() {
  try {
    const res = await fetch('/api/corredoras');
    const json = await res.json();
    if (json.success) {
      corredoras = json.data;
      
      // Poblar selector de Intranet
      const selectIntranet = document.getElementById('tenantSelect');
      if (selectIntranet) {
        selectIntranet.innerHTML = '';
        corredoras.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.nombre}`;
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

  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'OPERADOR_SENIOR' || rango === 'ADMIN_CORREDORA') {
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

// Control de Sesión B2B Conectado al Catálogo Real RBAC
async function iniciarSesion(e) {
  if (e) e.preventDefault();
  const inputUsuario = document.getElementById('loginUsuario');
  const emailInput = (inputUsuario && inputUsuario.value.trim()) ? inputUsuario.value.trim().toLowerCase() : '';

  // 1. Cargar usuarios si aún no están en memoria
  if (usuariosActuales.length === 0) {
    try {
      const res = await fetch('/api/usuarios');
      const json = await res.json();
      if (json.success) usuariosActuales = json.data;
    } catch (err) {
      console.warn('Error precargando usuarios en login:', err);
    }
  }

  // 2. Buscar si el correo ingresado corresponde a un usuario del catálogo RBAC
  const userEncontrado = usuariosActuales.find(u => u.email.toLowerCase() === emailInput);

  if (userEncontrado) {
    // Usuario institucional reconocido
    sessionStorage.setItem('nuam_auth', 'true');
    sessionStorage.setItem('nuam_user', userEncontrado.nombre);
    sessionStorage.setItem('nuam_user_email', userEncontrado.email);
    sessionStorage.setItem('nuam_user_cargo', userEncontrado.cargo);
    sessionStorage.setItem('nuam_user_rank', userEncontrado.rango);
    sessionStorage.setItem('nuam_user_initials', userEncontrado.avatar || userEncontrado.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase());

    // Asignar automáticamente el tenant de la corredora del usuario
    if (userEncontrado.tenant_id && userEncontrado.tenant_id !== 'GLOBAL') {
      tenantActivo = userEncontrado.tenant_id;
    } else {
      tenantActivo = 'corr-lv-01'; // Default inicial para auditores globales
    }
    sessionStorage.setItem('nuam_tenant', tenantActivo);

  } else {
    // Usuario personalizado / genérico: detección inteligente por dominio de correo
    let tenantDetectado = 'corr-lv-01';
    if (emailInput.includes('banchile')) tenantDetectado = 'corr-bc-02';
    else if (emailInput.includes('credicorp')) tenantDetectado = 'corr-cc-03';

    tenantActivo = tenantDetectado;
    const nombreGenerico = emailInput ? emailInput.split('@')[0] : 'Operador Bursátil';
    const initials = nombreGenerico.substring(0, 2).toUpperCase();

    sessionStorage.setItem('nuam_auth', 'true');
    sessionStorage.setItem('nuam_user', nombreGenerico);
    sessionStorage.setItem('nuam_user_email', emailInput || 'operador@corredora.cl');
    sessionStorage.setItem('nuam_user_cargo', 'Operador de Mesa');
    sessionStorage.setItem('nuam_user_rank', 'OPERADOR_SENIOR');
    sessionStorage.setItem('nuam_user_initials', initials);
    sessionStorage.setItem('nuam_tenant', tenantActivo);
  }

  await mostrarIntranet();
  cambiarSeccion('calificaciones');
}

function cerrarSesion() {
  sessionStorage.clear();
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
  corredoraActual = corredoras.find(c => c.id === tenantActivo);
  if (corredoraActual) {
    // Sincronizar el select de la barra superior siempre con el tenant activo
    const selectIntranet = document.getElementById('tenantSelect');
    if (selectIntranet && selectIntranet.value !== tenantActivo) {
      selectIntranet.value = tenantActivo;
    }

    const initialsMap = {
      'corr-lv-01': 'LV',
      'corr-bc-02': 'BC',
      'corr-cc-03': 'CC'
    };
    const badgeInitials = document.getElementById('badgeTenantInitials');
    if (badgeInitials) badgeInitials.textContent = initialsMap[tenantActivo] || 'NM';

    const badge = document.getElementById('badgeTenantActivo');
    if (badge) badge.textContent = corredoraActual.codigo;
    const footTenant = document.getElementById('footerTenant');
    if (footTenant) footTenant.textContent = corredoraActual.nombre;
    const badgeHero = document.getElementById('badgeTenantHero');
    if (badgeHero) badgeHero.textContent = corredoraActual.nombre;

    // Actualizar perfil de operador dinámicamente en el navbar
    const savedUser = sessionStorage.getItem('nuam_user') || 'César Contreras';
    const savedCargo = sessionStorage.getItem('nuam_user_cargo') || 'Líder Técnico & Arquitectura';
    const savedRank = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
    const savedInitial = sessionStorage.getItem('nuam_user_initials') || 'CC';

    const avatar = document.getElementById('operadorAvatarInitials');
    const nombreOp = document.getElementById('operadorNombre');
    const cargoOp = document.getElementById('operadorCargo');
    const badgeRango = document.getElementById('operadorRangoBadge');

    if (avatar) avatar.textContent = savedInitial;
    if (nombreOp) nombreOp.textContent = savedUser;
    if (cargoOp) cargoOp.textContent = savedCargo;

    if (badgeRango) {
      const rankStyles = {
        'SUPER_ADMIN': { label: 'SUPER ADMIN', class: 'bg-amber-100 text-amber-800 border-amber-300' },
        'ADMIN_CORREDORA': { label: 'ADMIN MESA', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
        'OPERADOR_SENIOR': { label: 'OPERADOR SR', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
        'AUDITOR_CMF': { label: 'AUDITOR CMF', class: 'bg-slate-100 text-slate-700 border-slate-300' }
      };
      const info = rankStyles[savedRank] || { label: savedRank, class: 'bg-slate-100 text-slate-700 border-slate-200' };
      badgeRango.textContent = info.label;
      badgeRango.className = `text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${info.class}`;
    }
    aplicarRestriccionesPorRol();
  }
}

// Aplicar Reglas y Restricciones Estrictas de Privilegios por Rango (RBAC)
function aplicarRestriccionesPorRol() {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  const banner = document.getElementById('bannerRestriccionRol');
  const txtBanner = document.getElementById('textoRestriccionRol');
  const badgeBanner = document.getElementById('badgeRestriccionRol');
  const iconoBanner = document.getElementById('iconoRestriccionRol');

  const btnNuevo = document.getElementById('btnNuevaCalificacionHero');
  const btnCargaHero = document.getElementById('btnCargaMasivaHero');
  const btnVaciar = document.getElementById('btnVaciarCartera');
  const btnSemilla = document.getElementById('btnRestablecerSemilla');
  const btnCrearUsr = document.getElementById('btnCrearUsuario');
  const navCarga = document.getElementById('navCargaMasiva');
  const navUsr = document.getElementById('navUsuarios');
  const tenantSelect = document.getElementById('tenantSelect');
  const cardLV = document.getElementById('cardAutoCargaLV');
  const cardBC = document.getElementById('cardAutoCargaBC');
  const cardCC = document.getElementById('cardAutoCargaCC');
  const cardRechazo = document.getElementById('cardAutoCargaRechazo');

  // Reset de estados por defecto
  if (btnNuevo) btnNuevo.classList.remove('hidden');
  if (btnCargaHero) btnCargaHero.classList.remove('hidden');
  if (navCarga) navCarga.classList.remove('hidden');
  if (navUsr) navUsr.classList.remove('hidden');
  if (btnCrearUsr) btnCrearUsr.classList.remove('hidden');
  if (cardLV) cardLV.classList.remove('hidden');
  if (cardBC) cardBC.classList.remove('hidden');
  if (cardCC) cardCC.classList.remove('hidden');
  if (cardRechazo) cardRechazo.classList.remove('hidden');

  if (btnVaciar) {
    btnVaciar.disabled = false;
    btnVaciar.classList.remove('opacity-40', 'cursor-not-allowed');
    btnVaciar.title = 'Vaciar cartera para demostrar ingesta limpia desde cero';
  }
  if (btnSemilla) {
    btnSemilla.disabled = false;
    btnSemilla.classList.remove('opacity-40', 'cursor-not-allowed');
    btnSemilla.title = 'Restablecer posiciones institucionales oficiales';
  }
  if (tenantSelect) {
    tenantSelect.disabled = false;
    tenantSelect.classList.remove('opacity-60', 'cursor-not-allowed');
    tenantSelect.title = 'Seleccionar Corredora de Bolsa Participante';
  }

  if (rango === 'AUDITOR_CMF') {
    // 1. AUDITOR CMF: Modo estricto de fiscalización (Solo Lectura)
    if (banner) {
      banner.className = 'mx-6 mt-2 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs bg-purple-50 text-purple-900 border border-purple-200';
      txtBanner.textContent = 'Modo Fiscalización CMF: Acceso de Solo Lectura regulatorio.';
      badgeBanner.textContent = 'SOLO LECTURA';
      badgeBanner.className = 'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-200 text-purple-900';
      if (iconoBanner) iconoBanner.setAttribute('data-lucide', 'shield-alert');
      banner.classList.remove('hidden');
    }
    if (btnNuevo) btnNuevo.classList.add('hidden');
    if (btnCargaHero) btnCargaHero.classList.add('hidden');
    if (navCarga) navCarga.classList.add('hidden'); // Ocultar pestaña Carga Masiva
    if (btnVaciar) {
      btnVaciar.disabled = true;
      btnVaciar.classList.add('opacity-40', 'cursor-not-allowed');
      btnVaciar.title = 'Acción bloqueada para perfil Auditor CMF (Solo Lectura)';
    }
    if (btnSemilla) {
      btnSemilla.disabled = true;
      btnSemilla.classList.add('opacity-40', 'cursor-not-allowed');
      btnSemilla.title = 'Acción bloqueada para perfil Auditor CMF (Solo Lectura)';
    }
    if (btnCrearUsr) btnCrearUsr.classList.add('hidden');
    // Auditor CMF sí puede cambiar de corredora para fiscalizar
    if (tenantSelect) {
      tenantSelect.disabled = false;
      tenantSelect.classList.remove('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Fiscalización CMF: Puede inspeccionar cualquiera de las corredoras participantes';
    }

  } else if (rango === 'OPERADOR_SENIOR') {
    // 2. OPERADOR SENIOR: Ingesta y operaciones, sin banner invasivo
    if (banner) {
      banner.classList.add('hidden');
    }
    if (btnVaciar) {
      btnVaciar.disabled = true;
      btnVaciar.classList.add('opacity-40', 'cursor-not-allowed');
      btnVaciar.title = 'Acción restringida: Requiere rango de Jefe de Mesa (Admin Corredora)';
    }
    if (btnSemilla) {
      btnSemilla.disabled = true;
      btnSemilla.classList.add('opacity-40', 'cursor-not-allowed');
      btnSemilla.title = 'Acción restringida: Requiere rango de Jefe de Mesa (Admin Corredora)';
    }
    if (btnCrearUsr) btnCrearUsr.classList.add('hidden');
    if (navUsr) navUsr.classList.add('hidden'); // Ocultar Panel Admin para Operadores

    // Aislamiento Multitenant: Operador bloqueado a su corredora asignada
    if (tenantSelect) {
      tenantSelect.disabled = true;
      tenantSelect.classList.add('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Aislamiento Multitenant: Su cuenta está fija a su corredora asignada.';
    }

    // Aislamiento en Carga Masiva: Ocultar tarjetas de otras corredoras
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

  } else if (rango === 'ADMIN_CORREDORA') {
    // 3. ADMIN CORREDORA: Control pleno sin banner invasivo
    if (banner) {
      banner.classList.add('hidden');
    }

    // Aislamiento Multitenant: Admin restringido a la jurisdiccion de su corredora
    if (tenantSelect) {
      tenantSelect.disabled = true;
      tenantSelect.classList.add('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Aislamiento Multitenant: Su jurisdicción está restringida a su corredora.';
    }

    // Aislamiento en Carga Masiva: Ocultar tarjetas de otras corredoras competidoras
    if (tenantActivo === 'corr-bc-02') {
      if (cardLV) cardLV.classList.add('hidden');
      if (cardCC) cardCC.classList.add('hidden');
    } else if (tenantActivo === 'corr-cc-03') {
      if (cardLV) cardLV.classList.add('hidden');
      if (cardBC) cardBC.classList.add('hidden');
    } else if (tenantActivo === 'corr-lv-01') {
      if (cardBC) cardBC.classList.add('hidden');
      if (cardCC) cardCC.classList.add('hidden');
    }

  } else {
    // 4. SUPER_ADMIN: Control Total
    if (banner) {
      banner.classList.add('hidden');
    }
    if (tenantSelect) {
      tenantSelect.disabled = false;
      tenantSelect.classList.remove('opacity-60', 'cursor-not-allowed');
      tenantSelect.title = 'Super Administrador nuam: Acceso global a todas las corredoras';
    }
  }

  if (window.lucide) lucide.createIcons();
}

// Cargar Calificaciones de la Corredora
async function cargarCalificaciones() {
  if (!tenantActivo) return;
  try {
    const res = await fetch(`/api/calificaciones?tenant_id=${tenantActivo}`);
    const json = await res.json();
    if (json.success) {
      calificacionesActuales = json.data;
      aplicarFiltrosTabla();
      actualizarMetricas();
    }
  } catch (err) {
    mostrarAlerta('Error cargando calificaciones: ' + err.message, 'error');
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
        ${(sessionStorage.getItem('nuam_user_rank') || '') === 'AUDITOR_CMF' 
          ? `<span class="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 font-semibold px-2 py-0.5 rounded-full inline-flex items-center space-x-1" title="Auditor CMF: Modo Solo Lectura">
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
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';

  // Guard de acceso por rol
  if (rango === 'AUDITOR_CMF' && seccion === 'cargamasiva') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización y no puede acceder a Carga Masiva.', 'error');
    seccion = 'calificaciones';
  }
  if (rango === 'OPERADOR_SENIOR' && seccion === 'usuarios') {
    mostrarAlerta('Acceso Denegado: El Panel Admin está reservado para Administradores de Mesa y Super Admin.', 'error');
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

// Rellenar factores válidos con 1 clic para demostración rápida (Suma = 0.85)
function demoLlenarFactoresValidos() {
  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  campos.forEach(c => document.getElementById(c).value = '0');
  document.getElementById('f08').value = '0.45';
  document.getElementById('f09').value = '0.15';
  document.getElementById('f10').value = '0.05';
  document.getElementById('f13').value = '0.15';
  document.getElementById('f19').value = '0.05';
  if (!document.getElementById('formRut').value) document.getElementById('formRut').value = '76.123.456-7';
  if (!document.getElementById('formNemotecnico').value) document.getElementById('formNemotecnico').value = 'CHILE';
  if (!document.getElementById('formRazon').value) document.getElementById('formRazon').value = 'Inversiones Los Andes SpA';
  calcularSumaFactores();
}

// Rellenar factores inválidos con 1 clic para demostración rápida (Suma = 1.15 > 1.0)
function demoLlenarFactoresInvalidos() {
  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  campos.forEach(c => document.getElementById(c).value = '0');
  document.getElementById('f08').value = '0.70';
  document.getElementById('f09').value = '0.45';
  if (!document.getElementById('formRut').value) document.getElementById('formRut').value = '76.123.456-7';
  if (!document.getElementById('formNemotecnico').value) document.getElementById('formNemotecnico').value = 'CHILE';
  calcularSumaFactores();
}

// Modal Nuevo / Editar
function abrirModalNuevo() {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización (lectura).', 'error');
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
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización (lectura).', 'error');
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
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización (lectura).', 'error');
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
      res = await fetch(`/api/calificaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/calificaciones', {
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
      mostrarAlerta(json.error || 'Error al guardar.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de red: ' + err.message, 'error');
  }
}

// Eliminar Calificación
async function eliminarCalificacion(id) {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización (lectura).', 'error');
    return;
  }

  if (!confirm('¿Confirma eliminar esta calificación tributaria? La acción quedará registrada en la bitácora inmutable.')) {
    return;
  }

  const usuario = sessionStorage.getItem('nuam_user_email') || 'operador@nuam.cl';
  try {
    const res = await fetch(`/api/calificaciones/${id}?tenant_id=${tenantActivo}&usuario=${encodeURIComponent(usuario)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta('Calificación eliminada correctamente.', 'success');
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta(json.error || 'No se pudo eliminar.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error eliminando: ' + err.message, 'error');
  }
}

// Vaciar Cartera para Demostración de Carga Limpia
async function vaciarCartera() {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF' || rango === 'OPERADOR_SENIOR') {
    mostrarAlerta(`Acceso Denegado: Su rango actual (${rango}) no tiene autorización para vaciar la cartera. Acción reservada para Jefe de Mesa o Super Admin.`, 'error');
    return;
  }

  const nombreCorredora = tenantActivo ? tenantActivo.replace('_', ' ') : 'la corredora';
  if (!confirm(`¿Confirma vaciar todas las calificaciones tributarias de ${nombreCorredora}? Esta acción dejará la cartera en 0 para demostrar la ingesta masiva desde una planilla limpia.`)) {
    return;
  }

  try {
    const res = await fetch('/api/calificaciones/vaciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantActivo,
        usuario: sessionStorage.getItem('nuam_user') || 'operador@nuam.cl'
      })
    });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta(json.mensaje, 'info');
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta(json.error || 'No se pudo vaciar la cartera.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de red al vaciar: ' + err.message, 'error');
  }
}

// Restablecer Posiciones Semilla Oficiales
async function restablecerSemilla() {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF' || rango === 'OPERADOR_SENIOR') {
    mostrarAlerta(`Acceso Denegado: Su rango actual (${rango}) no tiene autorización para restablecer carteras.`, 'error');
    return;
  }

  try {
    const usuario = sessionStorage.getItem('nuam_user_email') || 'operador@nuam.cl';
    const res = await fetch('/api/calificaciones/restablecer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantActivo, usuario })
    });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta(json.mensaje, 'success');
      await cargarCalificaciones();
      await cargarAuditoria();
    } else {
      mostrarAlerta(json.error || 'No se pudieron restablecer las posiciones.', 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de red al restablecer: ' + err.message, 'error');
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
    const res = await fetch('/api/carga-masiva', { method: 'POST', body: formData });
    const json = await res.json();

    if (json.success) {
      const r = json.resultado;
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
      mostrarAlerta(json.error || 'Error procesando lote.', 'error');
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
  window.location.href = `/api/descargar-rechazos/${batchIdRechazosActivo}`;
}

function descargarPlantilla() {
  window.location.href = '/api/plantilla-ejemplo?formato=xlsx';
}

function descargarPlantillaExcel() {
  window.location.href = '/api/plantilla-ejemplo?formato=xlsx';
}

function descargarPlantillaCsv() {
  window.location.href = '/api/plantilla-ejemplo?formato=csv';
}

let archivoDemoEnMemoria = null;

async function descargarLoteDemo(tipo) {
  try {
    mostrarAlerta(`Preparando lote de prueba (${tipo === 'valido' ? 'Válido' : 'Con Rechazo'})...`, 'info');

    const url = `/api/lote-prueba/${tipo}?formato=xlsx`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Error al obtener el archivo del servidor');
    const blob = await resp.blob();
    const filename = tipo === 'valido' ? 'lote_prueba_valido.xlsx' : 'lote_prueba_con_rechazo.xlsx';

    // Crear File en memoria
    const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    archivoDemoEnMemoria = file;

    // Sincronizar input file si es posible
    const input = document.getElementById('archivoMasivoFull');
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (input) input.files = dt.files;
    } catch(e) {
      console.log('DataTransfer no disponible, usando archivoDemoEnMemoria');
    }

    // Actualizar vista del Dropzone
    const nombreSpan = document.getElementById('nombreArchivoFull');
    const tituloDrop = document.getElementById('tituloDropzoneFull');
    const btnProcesar = document.getElementById('btnProcesarFull');
    const btnCancelar = document.getElementById('btnCancelarFull');
    const estadoTxt = document.getElementById('estadoCargaFull');

    if (nombreSpan) {
      nombreSpan.textContent = tipo === 'valido'
        ? `Lote Demo Cargado: ${filename} (4 registros válidos)`
        : `Lote Demo Cargado: ${filename} (Incluye fila con factor 1.15 para rechazo automático)`;
    }
    if (tituloDrop) tituloDrop.textContent = filename;
    if (btnProcesar) btnProcesar.disabled = false;
    if (btnCancelar) btnCancelar.classList.remove('hidden');
    if (estadoTxt) estadoTxt.textContent = `Lote inyectado en memoria. Procesando ingesta masiva automáticamente con lógica Upsert...`;

    // Disparar descarga al equipo del operador
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);

    // Ejecutar procesamiento con 1 clic
    setTimeout(() => {
      subirArchivoFull();
    }, 350);

  } catch (err) {
    console.error('Error cargando lote demo:', err);
    window.location.href = `/api/lote-prueba/${tipo}?formato=xlsx`;
  }
}

// Carga Inmediata y Ejecución de Archivo de Mercado Real
async function cargarArchivoMercadoReal(nombreArchivo) {
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización y no puede ejecutar ingestas.', 'error');
    return;
  }

  try {
    // Aislamiento Multitenant: roles fijos no pueden cruzar a otra corredora mediante un archivo
    const esRolFijo = rango === 'OPERADOR_SENIOR' || rango === 'ADMIN_CORREDORA';
    if (esRolFijo) {
      const tenantDelArchivo =
        nombreArchivo.includes('larrainvial') ? 'corr-lv-01' :
        nombreArchivo.includes('banchile')    ? 'corr-bc-02' :
        nombreArchivo.includes('credicorp')   ? 'corr-cc-03' : null;
      if (tenantDelArchivo && tenantDelArchivo !== tenantActivo) {
        mostrarAlerta('Aislamiento Multitenant: Este archivo pertenece a otra corredora. Su cuenta está restringida a su corredora asignada.', 'error');
        return;
      }
    }

    // Para roles globales (SUPER_ADMIN, AUDITOR_CMF ya bloqueado arriba): auto-cambiar tenant al del archivo
    if (!esRolFijo) {
      if (nombreArchivo.includes('larrainvial') && tenantActivo !== 'corr-lv-01') {
        await cambiarTenant('corr-lv-01');
      } else if (nombreArchivo.includes('banchile') && tenantActivo !== 'corr-bc-02') {
        await cambiarTenant('corr-bc-02');
      } else if (nombreArchivo.includes('credicorp') && tenantActivo !== 'corr-cc-03') {
        await cambiarTenant('corr-cc-03');
      }
    }

    mostrarAlerta(`Cargando archivo bursátil: ${nombreArchivo}...`, 'info');
    const resp = await fetch(`/archivos_mercado_real/${nombreArchivo}?t=${Date.now()}`);
    if (!resp.ok) throw new Error(`No se pudo obtener el archivo del servidor (${resp.status})`);
    const blob = await resp.blob();

    const file = new File([blob], nombreArchivo, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    archivoDemoEnMemoria = file;

    const nombreSpan = document.getElementById('nombreArchivoFull');
    const tituloDrop = document.getElementById('tituloDropzoneFull');
    const btnProcesar = document.getElementById('btnProcesarFull');
    const btnCancelar = document.getElementById('btnCancelarFull');
    const estadoTxt = document.getElementById('estadoCargaFull');

    if (nombreSpan) nombreSpan.textContent = `Archivo de Mercado Real: ${nombreArchivo} (${(file.size / 1024).toFixed(1)} KB)`;
    if (tituloDrop) tituloDrop.textContent = nombreArchivo;
    if (btnProcesar) btnProcesar.disabled = false;
    if (btnCancelar) btnCancelar.classList.remove('hidden');
    if (estadoTxt) estadoTxt.textContent = `Inyectado en memoria. Procesando ingesta masiva Upsert...`;

    // Procesar directamente pasando el objeto File (evita bloqueos o carreras)
    await subirArchivoFull(file);

  } catch (err) {
    mostrarAlerta('Error cargando archivo de mercado: ' + err.message, 'error');
  }
}

function exportarDeclaracion(formato = 'csv') {
  if (!tenantActivo) return;
  window.location.href = `/api/exportar-declaracion?tenant_id=${tenantActivo}&formato=${formato}`;
}

function exportarDeclaracionExcel() {
  exportarDeclaracion('xlsx');
}

// Carga Masiva Sección Completa
function archivoFullSeleccionado(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  archivoDemoEnMemoria = file;
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
  if (estadoTxt) estadoTxt.textContent = `Listo para procesar con lógica Upsert (actualiza existentes e inserta nuevos)`;
}

function cancelarArchivoFull() {
  archivoDemoEnMemoria = null;
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
  const rango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (rango === 'AUDITOR_CMF') {
    mostrarAlerta('Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización y no puede ejecutar ingestas.', 'error');
    return;
  }

  const input = document.getElementById('archivoMasivoFull');
  const file = archivoDirecto || (input && input.files && input.files[0]) || archivoDemoEnMemoria;

  if (!file) {
    mostrarAlerta('Por favor seleccione un archivo primero o elija un lote para auto-cargar.', 'error');
    return;
  }

  const esRolFijo = rango === 'OPERADOR_SENIOR' || rango === 'ADMIN_CORREDORA';
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
  if (estadoTxt) estadoTxt.textContent = 'Validando regla fiscal fila por fila y ejecutando Upsert...';

  try {
    const res = await fetch('/api/carga-masiva', { method: 'POST', body: formData });
    const json = await res.json();

    if (json.success) {
      const r = json.resultado;
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

// Cargar Auditoría (Feed Oscuro y Tabla Completa)
async function cargarAuditoria() {
  try {
    const res = await fetch(`/api/auditoria?tenant_id=${tenantActivo}`);
    const json = await res.json();
    if (json.success) {
      // 1. Mini Feed en Tarjeta Oscura
      const feed = document.getElementById('miniFeedAuditoria');
      if (feed) {
        feed.innerHTML = '';
        const ultimos = json.data.slice(0, 3);
        if (ultimos.length === 0) {
          feed.innerHTML = '<span class="text-slate-500">Sin eventos de auditoría para este corredor.</span>';
        } else {
          ultimos.forEach(ev => {
            const hora = new Date(ev.timestamp).toLocaleTimeString('es-CL');
            const d = document.createElement('div');
            d.className = 'p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between';
            d.innerHTML = `
              <div class="flex items-center space-x-2 truncate">
                <span class="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10">${ev.accion}</span>
                <span class="text-slate-300 text-xs">${ev.detalle?.rut || ev.detalle?.rut_cliente || 'CALIFICACION'}</span>
              </div>
              <span class="text-[10px] text-slate-500">${hora}</span>
            `;
            feed.appendChild(d);
          });
        }
      }

      // 2. Tabla Completa en Sección de Auditoría
      const tbody = document.getElementById('tablaAuditoriaFull');
      if (tbody) {
        tbody.innerHTML = '';
        json.data.forEach(ev => {
          const tr = document.createElement('tr');
          const fecha = new Date(ev.timestamp).toLocaleString('es-CL');
          tr.innerHTML = `
            <td class="py-2.5 px-3 text-slate-500">${fecha}</td>
            <td class="py-2.5 px-3 font-semibold text-brand-black">${ev.usuario || 'operador'}</td>
            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${ev.accion}</span></td>
            <td class="py-2.5 px-3 text-slate-600">${ev.entidad}</td>
            <td class="py-2.5 px-3 text-slate-500 truncate max-w-sm">${JSON.stringify(ev.detalle)}</td>
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
    const res = await fetch('/api/bolsa-central');
    const json = await res.json();
    if (json.success) {
      const grid = document.getElementById('gridInstrumentosFull');
      if (grid) {
        grid.innerHTML = '';
        json.instrumentos.forEach(i => {
          const div = document.createElement('div');
          div.className = 'p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs';
          div.innerHTML = `
            <div>
              <span class="font-bold text-brand-black block font-mono">${i.nemotecnico}</span>
              <span class="text-[11px] text-slate-500">${i.razon_social}</span>
            </div>
            <span class="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">READ ONLY</span>
          `;
          grid.appendChild(div);
        });
      }
    }
  } catch (err) {
    console.error('Error cargando bolsa central:', err);
  }
}

// Verificación de Políticas de Acceso en Gateway Central (Enlace Seguro)
async function probarEscrituraBolsaCentral() {
  const boxes = [
    document.getElementById('resultadoTestNoImpacto'),
    document.getElementById('resultadoTestNoImpactoBolsa')
  ].filter(Boolean);

  boxes.forEach(box => {
    box.className = 'p-3 rounded-2xl text-xs bg-slate-900 border border-slate-700 text-slate-300';
    box.innerHTML = 'Verificando políticas de acceso en gateway transaccional...';
    box.classList.remove('hidden');
  });

  try {
    const res = await fetch('/api/bolsa-central/test-write', { method: 'POST' });
    const json = await res.json();

    if (res.status === 403) {
      boxes.forEach(box => {
        box.className = 'p-4 rounded-2xl text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-200';
        box.innerHTML = `
          <div class="flex items-start space-x-2.5">
            <i data-lucide="shield-check" class="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5"></i>
            <div>
              <span class="font-extrabold block text-xs text-emerald-300">ENLACE SEGURO CONFIRMADO: HTTP 403 FORBIDDEN</span>
              <p class="mt-1 text-xs text-slate-200 leading-relaxed">${json.mensaje}</p>
              <div class="mt-2 text-[10px] text-slate-300 font-mono flex flex-wrap gap-2">
                <span class="bg-black/40 px-2 py-0.5 rounded border border-white/10">Módulo: ${json.modulo}</span>
                <span class="bg-black/40 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300">Permisos otorgados: [SELECT]</span>
                <span class="bg-black/40 px-2 py-0.5 rounded border border-rose-500/30 text-rose-300">Permisos denegados: [INSERT, UPDATE, DELETE, DROP]</span>
              </div>
            </div>
          </div>
        `;
      });
      if (window.lucide) lucide.createIcons();
    }
  } catch (err) {
    boxes.forEach(box => {
      box.textContent = 'Error: ' + err.message;
    });
  }
}

// Monitoreo de Salud del Servidor
async function verificarSalud() {
  try {
    const inicio = performance.now();
    const res = await fetch('/api/health');
    const latencia = Math.round(performance.now() - inicio);
    const json = await res.json();

    if (json.status === 'ONLINE') {
      const landingStatus = document.getElementById('landingGatewayStatus');
      if (landingStatus) {
        landingStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block mr-1.5"></span> Sistema Operacional • Enlace nuam Core Activo`;
        landingStatus.className = 'text-emerald-700 font-semibold text-xs bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 flex items-center space-x-1.5';
      }
    }
  } catch (e) {
    console.error('Sin conexión con /health');
    const landingStatus = document.getElementById('landingGatewayStatus');
    if (landingStatus) {
      landingStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1.5"></span> Gateway Fuera de Línea`;
      landingStatus.className = 'text-rose-600 font-semibold text-xs bg-rose-50 px-3.5 py-1.5 rounded-full border border-rose-200 flex items-center space-x-1.5';
    }
  }
}

// Control del Drawer Lateral de nuam Core y Auditoría
function toggleDrawerCore() {
  const drawer = document.getElementById('drawerCore');
  const backdrop = document.getElementById('drawerBackdrop');
  const panel = document.getElementById('drawerPanel');
  if (!drawer) return;

  if (drawer.classList.contains('hidden')) {
    drawer.classList.remove('hidden');
    setTimeout(() => {
      if (backdrop) {
        backdrop.classList.remove('opacity-0');
        backdrop.classList.add('opacity-100');
      }
      if (panel) {
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
      }
    }, 10);
    cargarAuditoria();
  } else {
    if (backdrop) {
      backdrop.classList.remove('opacity-100');
      backdrop.classList.add('opacity-0');
    }
    if (panel) {
      panel.classList.remove('translate-x-0');
      panel.classList.add('translate-x-full');
    }
    setTimeout(() => {
      drawer.classList.add('hidden');
    }, 300);
  }
  if (window.lucide) lucide.createIcons();
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

// =========================================================================
// MÓDULO: GESTIÓN DE USUARIOS, ROLES Y RANGOS INSTITUCIONALES (RBAC)
// =========================================================================

async function cargarUsuarios() {
  try {
    const res = await fetch('/api/usuarios');
    const json = await res.json();
    if (json.success) {
      usuariosActuales = json.data;
      actualizarMetricasUsuarios();
      filtrarTablaUsuarios();
    }
  } catch (err) {
    mostrarAlerta('Error cargando cuentas de usuarios: ' + err.message, 'error');
  }
}

function actualizarMetricasUsuarios() {
  const total = usuariosActuales.length;
  const superAdmins = usuariosActuales.filter(u => u.rango === 'SUPER_ADMIN').length;
  const adminsMesa = usuariosActuales.filter(u => u.rango === 'ADMIN_CORREDORA').length;
  const operAuditores = usuariosActuales.filter(u => u.rango === 'OPERADOR_SENIOR' || u.rango === 'AUDITOR_CMF').length;

  const elTotal = document.getElementById('statTotalUsuarios');
  const elSuper = document.getElementById('statSuperAdmins');
  const elAdmins = document.getElementById('statAdminsMesa');
  const elOper = document.getElementById('statOperadoresAuditores');

  if (elTotal) elTotal.textContent = `${total} ${total === 1 ? 'Cuenta' : 'Cuentas'}`;
  if (elSuper) elSuper.textContent = `${superAdmins} Super Admin`;
  if (elAdmins) elAdmins.textContent = `${adminsMesa} Admin${adminsMesa === 1 ? '' : 's'} Mesa`;
  if (elOper) elOper.textContent = `${operAuditores} Operativo${operAuditores === 1 ? '' : 's'}`;
}

function filtrarUsuariosRango(rango) {
  filtroUsuarioRangoActivo = rango;
  const btnIds = {
    'TODOS': 'filtroUsrTodos',
    'SUPER_ADMIN': 'filtroUsrSuper',
    'ADMIN_CORREDORA': 'filtroUsrAdmin',
    'OPERADOR_SENIOR': 'filtroUsrOp',
    'AUDITOR_CMF': 'filtroUsrAuditor'
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
    filtrados = filtrados.filter(u => u.rango === filtroUsuarioRangoActivo);
  }

  if (query) {
    filtrados = filtrados.filter(u => 
      (u.nombre && u.nombre.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.cargo && u.cargo.toLowerCase().includes(query)) ||
      (u.corredora_nombre && u.corredora_nombre.toLowerCase().includes(query)) ||
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
    'SUPER_ADMIN': { 
      label: 'SUPER ADMIN (N1)', 
      bg: 'bg-amber-100 text-amber-800 border-amber-300', 
      dot: 'bg-amber-500' 
    },
    'ADMIN_CORREDORA': { 
      label: 'ADMIN MESA (N2)', 
      bg: 'bg-indigo-100 text-indigo-800 border-indigo-300', 
      dot: 'bg-indigo-500' 
    },
    'OPERADOR_SENIOR': { 
      label: 'OPERADOR SR (N3)', 
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', 
      dot: 'bg-emerald-500' 
    },
    'AUDITOR_CMF': { 
      label: 'AUDITOR CMF (N4)', 
      bg: 'bg-slate-100 text-slate-700 border-slate-300', 
      dot: 'bg-slate-400' 
    }
  };

  const miRangoActual = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';

  lista.forEach(u => {
    const badgeInfo = badgeRangos[u.rango] || { 
      label: u.rango, 
      bg: 'bg-slate-100 text-slate-700 border-slate-200', 
      dot: 'bg-slate-400' 
    };

    const estadoActivo = (u.estado || 'ACTIVO') === 'ACTIVO';
    const initials = u.avatar || (u.nombre ? u.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'OP');

    // Permisos por fila según rango activo
    const puedeEditarFila = miRangoActual === 'SUPER_ADMIN' || (miRangoActual === 'ADMIN_CORREDORA' && u.rango !== 'SUPER_ADMIN' && u.tenant_id === tenantActivo);
    const puedeEliminarFila = miRangoActual === 'SUPER_ADMIN' || (miRangoActual === 'ADMIN_CORREDORA' && u.rango !== 'SUPER_ADMIN' && u.rango !== 'AUDITOR_CMF' && u.tenant_id === tenantActivo);

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

  const initials = u.avatar || (u.nombre ? u.nombre.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'OP');

  sessionStorage.setItem('nuam_auth', 'true');
  sessionStorage.setItem('nuam_user', u.nombre);
  sessionStorage.setItem('nuam_user_email', u.email);
  sessionStorage.setItem('nuam_user_cargo', u.cargo);
  sessionStorage.setItem('nuam_user_rank', u.rango);
  sessionStorage.setItem('nuam_user_initials', initials);

  if (u.tenant_id && u.tenant_id !== 'GLOBAL') {
    tenantActivo = u.tenant_id;
    sessionStorage.setItem('nuam_tenant', tenantActivo);
  }

  actualizarBadgesTenant();
  await cargarCalificaciones();
  await cargarAuditoria();
  await cargarBolsaCentral();
  mostrarAlerta(`Sesión cambiada a: ${u.nombre} (${u.rango}).`, 'success');
  cambiarSeccion('calificaciones');
}

function abrirModalUsuario(id = null) {
  const miRango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (miRango === 'AUDITOR_CMF' || miRango === 'OPERADOR_SENIOR') {
    mostrarAlerta(`Acceso Denegado: Su rango (${miRango}) no posee autorización para administrar cuentas de usuario.`, 'error');
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

    if (miRango === 'ADMIN_CORREDORA') {
      if (u.rango === 'SUPER_ADMIN') {
        mostrarAlerta('Acceso Denegado: Un Jefe de Mesa no puede modificar cuentas de Super Administrador.', 'error');
        return;
      }
      if (u.tenant_id !== tenantActivo && u.tenant_id !== 'GLOBAL') {
        mostrarAlerta('Aislamiento Multitenant: No puede administrar usuarios de otras corredoras.', 'error');
        return;
      }
    }

    if (titulo) titulo.textContent = `Editar Cuenta: ${u.nombre}`;
    if (btnGuardar) btnGuardar.textContent = 'Guardar Cambios';
    if (inputId) inputId.value = u.id;
    if (inputNombre) inputNombre.value = u.nombre;
    if (inputEmail) inputEmail.value = u.email;
    if (selectTenant) {
      selectTenant.value = u.tenant_id;
      selectTenant.disabled = (miRango === 'ADMIN_CORREDORA');
    }
    if (selectRango) {
      selectRango.value = u.rango;
      ajustarOpcionesRango(miRango, selectRango);
    }
    if (inputCargo) inputCargo.value = u.cargo;
    if (selectEstado) selectEstado.value = u.estado || 'ACTIVO';
  } else {
    if (titulo) titulo.textContent = 'Crear Cuenta de Operador';
    if (btnGuardar) btnGuardar.textContent = 'Guardar Cuenta';
    if (inputId) inputId.value = '';
    if (inputNombre) inputNombre.value = '';
    if (inputEmail) inputEmail.value = '';
    if (selectTenant) {
      selectTenant.value = tenantActivo || 'corr-lv-01';
      selectTenant.disabled = (miRango === 'ADMIN_CORREDORA');
    }
    if (selectRango) {
      selectRango.value = 'OPERADOR_SENIOR';
      ajustarOpcionesRango(miRango, selectRango);
    }
    if (inputCargo) inputCargo.value = 'Operador Renta Variable';
    if (selectEstado) selectEstado.value = 'ACTIVO';
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function ajustarOpcionesRango(miRango, selectRango) {
  if (!selectRango) return;
  const opciones = selectRango.querySelectorAll('option');
  opciones.forEach(opt => {
    if (miRango === 'ADMIN_CORREDORA') {
      // Un admin de corredora solo puede crear o editar Operadores y Admins de Mesa
      if (opt.value === 'SUPER_ADMIN' || opt.value === 'AUDITOR_CMF') {
        opt.disabled = true;
      } else {
        opt.disabled = false;
      }
    } else {
      opt.disabled = false;
    }
  });
}

function cerrarModalUsuario() {
  const modal = document.getElementById('modalUsuario');
  if (modal) modal.classList.add('hidden');
}

async function guardarUsuario(e) {
  if (e) e.preventDefault();
  const miRango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (miRango === 'AUDITOR_CMF' || miRango === 'OPERADOR_SENIOR') {
    mostrarAlerta('Acceso Denegado: Su rango no posee autorización para guardar cuentas.', 'error');
    return;
  }

  const id = document.getElementById('usuarioId').value;
  const nombre = document.getElementById('formUsuarioNombre').value.trim();
  const email = document.getElementById('formUsuarioEmail').value.trim();
  let tenant_id = document.getElementById('formUsuarioTenant').value;
  const rango = document.getElementById('formUsuarioRango').value;
  const cargo = document.getElementById('formUsuarioCargo').value.trim();
  const estado = document.getElementById('formUsuarioEstado').value;

  // Si es ADMIN_CORREDORA, forzar tenant a su corredora asignada y restringir rango
  if (miRango === 'ADMIN_CORREDORA') {
    tenant_id = tenantActivo;
    if (rango === 'SUPER_ADMIN' || rango === 'AUDITOR_CMF') {
      mostrarAlerta('Acceso Denegado: Un Jefe de Mesa no puede otorgar rangos de Super Admin ni Auditor CMF.', 'error');
      return;
    }
  }

  const autor = sessionStorage.getItem('nuam_user_email') || 'cesar.contreras@larrainvial.com';

  try {
    let res;
    if (id) {
      res = await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, tenant_id, rango, cargo, estado, autor })
      });
    } else {
      res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, tenant_id, rango, cargo, estado, autor })
      });
    }

    const json = await res.json();
    if (json.success) {
      mostrarAlerta(id ? 'Cuenta institucional actualizada con éxito.' : 'Nueva cuenta creada y rango asignado correctamente.', 'success');
      cerrarModalUsuario();
      await cargarUsuarios();
      actualizarBadgesTenant();
    } else {
      mostrarAlerta('Error: ' + (json.error || json.mensaje || json.message || 'No se pudo guardar el usuario.'), 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de comunicación con el servidor: ' + err.message, 'error');
  }
}

async function eliminarUsuarioCuenta(id) {
  const miRango = sessionStorage.getItem('nuam_user_rank') || 'SUPER_ADMIN';
  if (miRango === 'AUDITOR_CMF' || miRango === 'OPERADOR_SENIOR') {
    mostrarAlerta(`Acceso Denegado: Su rango (${miRango}) no posee autorización para revocar cuentas.`, 'error');
    return;
  }

  const u = usuariosActuales.find(x => x.id === id);
  if (!u) return;

  if (miRango === 'ADMIN_CORREDORA') {
    if (u.rango === 'SUPER_ADMIN' || u.rango === 'AUDITOR_CMF') {
      mostrarAlerta('Acceso Denegado: Un Jefe de Mesa no puede eliminar cuentas de Super Admin ni Auditores.', 'error');
      return;
    }
    if (u.tenant_id !== tenantActivo) {
      mostrarAlerta('Aislamiento Multitenant: No puede eliminar usuarios de otra corredora.', 'error');
      return;
    }
  }

  const nombre = u ? u.nombre : 'este usuario';
  if (!confirm(`¿Está seguro de revocar y eliminar la cuenta de ${nombre}?`)) {
    return;
  }

  const autor = sessionStorage.getItem('nuam_user_email') || 'cesar.contreras@larrainvial.com';

  try {
    const res = await fetch(`/api/usuarios/${id}?autor=${encodeURIComponent(autor)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      mostrarAlerta('Cuenta eliminada de los registros institucionales.', 'success');
      await cargarUsuarios();
    } else {
      mostrarAlerta('Error al eliminar: ' + (json.error || json.mensaje || json.message || 'No se pudo eliminar la cuenta.'), 'error');
    }
  } catch (err) {
    mostrarAlerta('Error de comunicación: ' + err.message, 'error');
  }
}
