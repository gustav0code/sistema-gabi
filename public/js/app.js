// =====================================================
// SISTEMA GABI — APP.JS — Lógica principal do sistema
// =====================================================

// ==================== AUTH ====================
async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}

function openChangePassword() {
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  openModal('changePasswordModal');
}

async function saveNewPassword() {
  const current = document.getElementById('cp-current').value;
  const novo = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  if (novo !== confirm) return showToast('As senhas não coincidem', 'error');
  const res = await fetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: current, new_password: novo })
  });
  const data = await res.json();
  if (res.ok) {
    closeModal('changePasswordModal');
    showToast('Senha alterada com sucesso!', 'success');
  } else {
    showToast(data.error || 'Erro ao alterar senha', 'error');
  }
}

let calendar = null;
let revenueChart = null;
let finChart = null;
let payMethodChart = null;
let currentSection = 'dashboard';
let servicesCache = [];
let settingsCache = {};

// ==================== NAVEGAÇÃO ====================
function navigate(section) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('section-' + section);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', agenda: 'Agenda', patients: 'Pacientes',
    prontuario: 'Prontuário', financeiro: 'Financeiro',
    servicos: 'Serviços', config: 'Configurações', 'patient-profile': 'Perfil do Paciente'
  };
  document.getElementById('pageTitle').textContent = titles[section] || section;
  updateTopbarActions(section);
  currentSection = section;

  if (section === 'dashboard') loadDashboard();
  else if (section === 'agenda') initCalendar();
  else if (section === 'patients') loadPatients();
  else if (section === 'prontuario') loadProntuario();
  else if (section === 'financeiro') loadFinanceiro();
  else if (section === 'servicos') loadServices();
  else if (section === 'config') loadSettings();
}

function updateTopbarActions(section) {
  const el = document.getElementById('topbarActions');
  const map = {
    agenda: `<button class="btn btn-primary" onclick="openNewAppointment()">+ Nova Consulta</button>`,
    patients: `<button class="btn btn-primary" onclick="openPatientModal()">+ Novo Paciente</button>`,
    servicos: `<button class="btn btn-primary" onclick="openServiceModal()">+ Novo Serviço</button>`,
  };
  el.innerHTML = map[section] || '';
}

// ==================== UTILS ====================
const fmt = {
  currency: v => v != null ? `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '—',
  date: d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
  time: t => t ? t.substring(0,5) : '—',
  age: d => {
    if (!d) return '—';
    const birth = new Date(d + 'T12:00:00');
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age + ' anos';
  },
  statusLabel: s => ({ scheduled:'Agendado', completed:'Realizado', cancelled:'Cancelado', no_show:'Não Compareceu', pending:'Pendente', paid:'Pago', active:'Ativo', inactive:'Inativo', discharged:'Alta' })[s] || s,
  methodLabel: m => ({ pix:'PIX', dinheiro:'Dinheiro', cartao_credito:'Cartão Crédito', cartao_debito:'Cartão Débito', transferencia:'Transferência' })[m] || m,
  monthLabel: m => { const [y,mo] = m.split('-'); return new Date(y, mo-1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' }); },
};

function badge(status) {
  return `<span class="badge badge-${status}">${fmt.statusLabel(status)}</span>`;
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro na requisição'); }
  return res.json();
}

function toast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toastContainer').appendChild(div);
  setTimeout(() => { div.classList.add('fade-out'); setTimeout(() => div.remove(), 300); }, 3000);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function confirmDelete(msg, onConfirm) {
  document.getElementById('deleteModalMsg').textContent = msg;
  const btn = document.getElementById('deleteConfirmBtn');
  btn.onclick = () => { closeModal('deleteModal'); onConfirm(); };
  openModal('deleteModal');
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  try {
    const data = await api('GET', '/api/dashboard');
    const s = data.stats;

    document.getElementById('statPatients').textContent = s.total_patients;
    document.getElementById('statToday').textContent = s.appointments_today;
    document.getElementById('statMonth').textContent = s.appointments_month;
    document.getElementById('statRevenue').textContent = fmt.currency(s.revenue_month);

    // Badge de pendentes
    const badge = document.getElementById('pendingBadge');
    if (s.pending_payments > 0) { badge.textContent = s.pending_payments; badge.style.display = ''; }
    else badge.style.display = 'none';

    // Agenda de hoje
    const todayEl = document.getElementById('todayList');
    if (data.today_appointments.length === 0) {
      todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">☀️</div><p>Nenhuma consulta agendada para hoje</p></div>';
    } else {
      todayEl.innerHTML = data.today_appointments.map(a => `
        <div class="agenda-item" onclick="showAptDetail(${a.id})" style="border-left-color:${a.service_color||'var(--primary)'}">
          <span class="agenda-time">${fmt.time(a.time)}</span>
          <div class="agenda-color-dot" style="background:${a.service_color||'var(--primary)'}"></div>
          <div class="agenda-info">
            <div class="agenda-patient">${a.patient_name}</div>
            <div class="agenda-service">${a.service_name || 'Consulta'} · ${a.duration}min</div>
          </div>
          ${badge(a.status)}
        </div>
      `).join('');
    }

    // Próximas
    const upEl = document.getElementById('upcomingList');
    if (data.upcoming.length === 0) {
      upEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Sem consultas futuras agendadas</p></div>';
    } else {
      upEl.innerHTML = data.upcoming.map(a => `
        <div class="agenda-item" onclick="showAptDetail(${a.id})" style="border-left-color:${a.service_color||'var(--primary)'}">
          <div>
            <div style="font-size:11px;color:var(--text-muted)">${fmt.date(a.date)}</div>
            <div class="agenda-time">${fmt.time(a.time)}</div>
          </div>
          <div class="agenda-color-dot" style="background:${a.service_color||'var(--primary)'}"></div>
          <div class="agenda-info">
            <div class="agenda-patient">${a.patient_name}</div>
            <div class="agenda-service">${a.service_name || 'Consulta'}</div>
          </div>
        </div>
      `).join('');
    }

    // Pacientes recentes
    const rpEl = document.getElementById('recentPatients');
    rpEl.innerHTML = data.recent_patients.map(p => `
      <div class="agenda-item" onclick="openPatientProfile(${p.id})" style="border-left-color:var(--primary)">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${p.name.charAt(0).toUpperCase()}</div>
        <div class="agenda-info">
          <div class="agenda-patient">${p.name}</div>
          <div class="agenda-service">${fmt.date(p.created_at?.split('T')[0] || p.created_at?.split(' ')[0])}</div>
        </div>
        ${badge(p.status)}
      </div>
    `).join('');

    // Gráfico de receita
    if (revenueChart) revenueChart.destroy();
    const ctx = document.getElementById('revenueChart').getContext('2d');
    const labels = data.monthly_revenue.map(r => fmt.monthLabel(r.month).split(' ')[0]);
    const values = data.monthly_revenue.map(r => r.total);
    revenueChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Receita', data: values, backgroundColor: 'rgba(108,99,255,0.7)', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$'+v } } } }
    });
  } catch(e) { console.error(e); }
}

// ==================== CALENDAR (AGENDA) ====================
function initCalendar() {
  if (calendar) { calendar.render(); return; }

  const el = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(el, {
    locale: 'pt-br',
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
    buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
    height: 'auto',
    selectable: true,
    events: async (info, success) => {
      try {
        const data = await api('GET', `/api/appointments?start=${info.startStr.split('T')[0]}&end=${info.endStr.split('T')[0]}`);
        success(data.map(a => ({
          id: a.id,
          title: a.patient_name,
          start: `${a.date}T${a.time}`,
          backgroundColor: a.service_color || '#6C63FF',
          borderColor: a.service_color || '#6C63FF',
          extendedProps: a
        })));
      } catch(e) { success([]); }
    },
    eventClick: info => showAptDetail(info.event.id),
    dateClick: info => {
      showDayAppointments(info.dateStr);
    },
    select: info => openNewAppointment(info.startStr),
  });
  calendar.render();

  // Show today on sidebar
  const today = new Date().toISOString().split('T')[0];
  showDayAppointments(today);
}

async function showDayAppointments(dateStr) {
  const titleEl = document.getElementById('agendaSideDateTitle');
  const listEl = document.getElementById('agendaSideList');
  const d = new Date(dateStr + 'T12:00:00');
  titleEl.textContent = d.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const data = await api('GET', `/api/appointments?start=${dateStr}&end=${dateStr}`);
    if (data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Nenhuma consulta neste dia</p></div>';
    } else {
      listEl.innerHTML = data.filter(a => a.status !== 'cancelled').sort((a,b) => a.time.localeCompare(b.time)).map(a => `
        <div class="agenda-item" onclick="showAptDetail(${a.id})" style="border-left-color:${a.service_color||'var(--primary)'}">
          <span class="agenda-time">${fmt.time(a.time)}</span>
          <div class="agenda-info">
            <div class="agenda-patient">${a.patient_name}</div>
            <div class="agenda-service">${a.service_name||'Consulta'} · ${a.duration}min</div>
          </div>
          ${badge(a.status)}
        </div>
      `).join('');
    }
  } catch(e) { listEl.innerHTML = '<p>Erro ao carregar</p>'; }
}

// ==================== APPOINTMENT MODALS ====================
async function openNewAppointment(date) {
  await loadServicesForSelect();
  const d = date || new Date().toISOString().split('T')[0];
  const settings = await getSettings();
  clearForm('af-', ['id','patient_id','patient-search','date','time','service_id','duration','price','status','notes']);
  document.getElementById('af-date').value = d;
  document.getElementById('af-time').value = settings.working_hours_start || '08:00';
  document.getElementById('af-duration').value = settings.default_duration || '50';
  document.getElementById('af-price').value = settings.default_price || '';
  document.getElementById('af-status').value = 'scheduled';
  document.getElementById('aptModalTitle').textContent = 'Nova Consulta';
  openModal('appointmentModal');
}

async function openEditAppointment(id) {
  await loadServicesForSelect();
  const a = await api('GET', `/api/appointments/${id}`);
  document.getElementById('af-id').value = a.id;
  document.getElementById('af-patient-search').value = a.patient_name;
  document.getElementById('af-patient_id').value = a.patient_id;
  document.getElementById('af-date').value = a.date;
  document.getElementById('af-time').value = a.time;
  document.getElementById('af-service_id').value = a.service_id || '';
  document.getElementById('af-duration').value = a.duration;
  document.getElementById('af-price').value = a.price || '';
  document.getElementById('af-status').value = a.status;
  document.getElementById('af-notes').value = a.notes || '';
  document.getElementById('aptModalTitle').textContent = 'Editar Consulta';
  closeModal('aptDetailModal');
  openModal('appointmentModal');
}

async function saveAppointment() {
  const id = document.getElementById('af-id').value;
  const patient_id = document.getElementById('af-patient_id').value;
  const date = document.getElementById('af-date').value;
  const time = document.getElementById('af-time').value;
  if (!patient_id) { toast('Selecione um paciente', 'error'); return; }
  if (!date || !time) { toast('Data e horário são obrigatórios', 'error'); return; }
  const body = {
    patient_id: parseInt(patient_id),
    service_id: document.getElementById('af-service_id').value || null,
    date, time,
    duration: parseInt(document.getElementById('af-duration').value) || 50,
    price: parseFloat(document.getElementById('af-price').value) || null,
    status: document.getElementById('af-status').value,
    notes: document.getElementById('af-notes').value,
  };
  try {
    if (id) await api('PUT', `/api/appointments/${id}`, body);
    else await api('POST', '/api/appointments', body);
    toast(id ? 'Consulta atualizada!' : 'Consulta agendada!');
    closeModal('appointmentModal');
    if (calendar) calendar.refetchEvents();
    if (currentSection === 'dashboard') loadDashboard();
    if (currentSection === 'financeiro') loadFinanceiro();
  } catch(e) { toast(e.message, 'error'); }
}

async function showAptDetail(id) {
  try {
    const a = await api('GET', `/api/appointments/${id}`);
    const body = document.getElementById('aptDetailBody');
    const footer = document.getElementById('aptDetailFooter');
    body.innerHTML = `
      <div class="appt-detail">
        <div class="detail-row">
          <span class="detail-icon">👤</span>
          <div><div class="detail-label">Paciente</div><div class="detail-value">${a.patient_name}</div></div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">🗂️</span>
          <div><div class="detail-label">Serviço</div><div class="detail-value">${a.service_name||'—'}</div></div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">📅</span>
          <div><div class="detail-label">Data e Horário</div><div class="detail-value">${fmt.date(a.date)} às ${fmt.time(a.time)}</div></div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">⏱️</span>
          <div><div class="detail-label">Duração</div><div class="detail-value">${a.duration} minutos</div></div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">💰</span>
          <div><div class="detail-label">Valor</div><div class="detail-value">${fmt.currency(a.price)}</div></div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">📌</span>
          <div><div class="detail-label">Status</div><div class="detail-value">${badge(a.status)}</div></div>
        </div>
        ${a.notes ? `<div class="detail-row"><span class="detail-icon">📝</span><div><div class="detail-label">Observações</div><div class="detail-value">${a.notes}</div></div></div>` : ''}
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="closeModal('aptDetailModal')">Fechar</button>
      ${a.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="markAptStatus(${a.id},'completed')">✓ Realizado</button>` : ''}
      ${a.status === 'scheduled' ? `<button class="btn btn-warning btn-sm" onclick="markAptStatus(${a.id},'no_show')">Não Compareceu</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="openEditAppointment(${a.id})">✏️ Editar</button>
      <button class="btn btn-secondary btn-sm" onclick="openNoteFromApt(${a.id},${a.patient_id})">📋 Anotação</button>
      <button class="btn btn-danger btn-sm" onclick="deleteAppointment(${a.id})">🗑</button>
    `;
    openModal('aptDetailModal');
  } catch(e) { toast('Erro ao carregar consulta', 'error'); }
}

async function markAptStatus(id, status) {
  try {
    await api('PATCH', `/api/appointments/${id}/status`, { status });
    toast(`Status atualizado para: ${fmt.statusLabel(status)}`);
    closeModal('aptDetailModal');
    if (calendar) calendar.refetchEvents();
    if (currentSection === 'dashboard') loadDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

function deleteAppointment(id) {
  confirmDelete('Tem certeza que deseja excluir esta consulta? Esta ação não pode ser desfeita.', async () => {
    try {
      await api('DELETE', `/api/appointments/${id}`);
      toast('Consulta excluída');
      if (calendar) calendar.refetchEvents();
      if (currentSection === 'dashboard') loadDashboard();
    } catch(e) { toast(e.message, 'error'); }
  });
}

function onServiceChange() {
  const sid = document.getElementById('af-service_id').value;
  if (!sid) return;
  const svc = servicesCache.find(s => s.id == sid);
  if (svc) {
    if (svc.price) document.getElementById('af-price').value = svc.price;
    if (svc.duration) document.getElementById('af-duration').value = svc.duration;
  }
}

// ==================== PATIENT SEARCH IN APT FORM ====================
let patientSearchTimeout = null;
async function searchPatientForApt() {
  clearTimeout(patientSearchTimeout);
  patientSearchTimeout = setTimeout(async () => {
    const q = document.getElementById('af-patient-search').value;
    if (q.length < 2) { document.getElementById('af-patient-dropdown').style.display='none'; return; }
    const data = await api('GET', `/api/patients?search=${encodeURIComponent(q)}`);
    const list = document.getElementById('af-patient-list');
    const dd = document.getElementById('af-patient-dropdown');
    if (data.length === 0) {
      list.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text-muted);">Nenhum paciente encontrado</div>';
    } else {
      list.innerHTML = data.map(p => `
        <div onclick="selectPatient(${p.id},'${p.name.replace(/'/g,"\\'")}'); event.stopPropagation()"
          style="padding:10px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid var(--border);"
          onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
        >${p.name} <span style="color:var(--text-muted);font-size:12px;">${p.phone||''}</span></div>
      `).join('');
    }
    dd.style.display = 'block';
  }, 250);
}

function selectPatient(id, name) {
  document.getElementById('af-patient_id').value = id;
  document.getElementById('af-patient-search').value = name;
  document.getElementById('af-patient-dropdown').style.display = 'none';
}

document.addEventListener('click', () => {
  const dd = document.getElementById('af-patient-dropdown');
  if (dd) dd.style.display = 'none';
});

// ==================== PATIENTS ====================
async function loadPatients() {
  const search = document.getElementById('patientSearch').value;
  const status = document.getElementById('patientStatusFilter').value;
  let url = '/api/patients?';
  if (search) url += `search=${encodeURIComponent(search)}&`;
  if (status) url += `status=${status}`;
  try {
    const data = await api('GET', url);
    const tbody = document.getElementById('patientsTbody');
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><h4>Nenhum paciente encontrado</h4><p>Clique em "+ Novo Paciente" para adicionar</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(p => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${p.name.charAt(0).toUpperCase()}</div>
            <div>
              <div style="font-weight:600;">${p.name}</div>
              ${p.email ? `<div style="font-size:12px;color:var(--text-muted)">${p.email}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${p.cpf || '—'}</td>
        <td>${p.phone || '—'}</td>
        <td>${p.email || '—'}</td>
        <td>${fmt.age(p.birth_date)}</td>
        <td>${badge(p.status)}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-secondary" onclick="openPatientProfile(${p.id})" title="Ver perfil">👁</button>
            <button class="btn btn-sm btn-secondary" onclick="openPatientModal(${p.id})" title="Editar">✏️</button>
            <button class="btn btn-sm btn-secondary" onclick="openNewAppointmentForPatient(${p.id},'${p.name.replace(/'/g,"\\'")}')">📅</button>
            <button class="btn btn-sm btn-secondary" onclick="deletePatient(${p.id},'${p.name.replace(/'/g,"\\'")}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch(e) { toast('Erro ao carregar pacientes', 'error'); }
}

let searchTimeout = null;
function searchPatients() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadPatients, 300);
}

async function openPatientModal(id) {
  const fields = ['id','name','cpf','birth_date','email','phone','address','city','state','zip',
    'emergency_contact_name','emergency_contact_phone','health_insurance','insurance_number',
    'occupation','marital_status','referral','notes','status'];
  clearForm('pf-', fields);
  document.getElementById('pf-status').value = 'active';
  document.getElementById('patientModalTitle').textContent = id ? 'Editar Paciente' : 'Novo Paciente';
  if (id) {
    try {
      const p = await api('GET', `/api/patients/${id}`);
      fields.forEach(f => { const el = document.getElementById('pf-'+f); if (el && p[f] != null) el.value = p[f]; });
    } catch(e) { toast('Erro ao carregar paciente', 'error'); return; }
  }
  openModal('patientModal');
}

async function savePatient() {
  const id = document.getElementById('pf-id').value;
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { toast('Nome é obrigatório', 'error'); return; }
  const fields = ['cpf','birth_date','email','phone','address','city','state','zip',
    'emergency_contact_name','emergency_contact_phone','health_insurance','insurance_number',
    'occupation','marital_status','referral','notes','status'];
  const body = { name };
  fields.forEach(f => { body[f] = document.getElementById('pf-'+f).value || null; });
  try {
    if (id) await api('PUT', `/api/patients/${id}`, body);
    else await api('POST', '/api/patients', body);
    toast(id ? 'Paciente atualizado!' : 'Paciente cadastrado!');
    closeModal('patientModal');
    loadPatients();
  } catch(e) { toast(e.message, 'error'); }
}

function deletePatient(id, name) {
  confirmDelete(`Excluir o paciente "${name}"? Todas as consultas e anotações serão removidas.`, async () => {
    try {
      await api('DELETE', `/api/patients/${id}`);
      toast('Paciente excluído');
      loadPatients();
    } catch(e) { toast(e.message, 'error'); }
  });
}

async function openNewAppointmentForPatient(id, name) {
  await loadServicesForSelect();
  const settings = await getSettings();
  clearForm('af-', ['id','patient_id','patient-search','date','time','service_id','duration','price','status','notes']);
  document.getElementById('af-patient_id').value = id;
  document.getElementById('af-patient-search').value = name;
  document.getElementById('af-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('af-time').value = settings.working_hours_start || '08:00';
  document.getElementById('af-duration').value = settings.default_duration || '50';
  document.getElementById('af-price').value = settings.default_price || '';
  document.getElementById('af-status').value = 'scheduled';
  document.getElementById('aptModalTitle').textContent = `Nova Consulta — ${name}`;
  openModal('appointmentModal');
}

// ==================== PATIENT PROFILE ====================
async function openPatientProfile(id) {
  navigate('patient-profile');
  const contentEl = document.getElementById('patientProfileContent');
  contentEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const [patient, appointments, notes] = await Promise.all([
      api('GET', `/api/patients/${id}`),
      api('GET', `/api/patients/${id}/appointments`),
      api('GET', `/api/patients/${id}/notes`),
    ]);

    const totalSessions = appointments.filter(a => a.status === 'completed').length;
    const totalPaid = appointments.reduce((acc, a) => acc + (a.price||0), 0);

    contentEl.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">${patient.name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;">
          <div class="profile-name">${patient.name}</div>
          <div class="profile-meta">
            ${patient.phone ? `<span>📱 ${patient.phone}</span>` : ''}
            ${patient.email ? `<span>📧 ${patient.email}</span>` : ''}
            ${patient.birth_date ? `<span>🎂 ${fmt.age(patient.birth_date)}</span>` : ''}
            ${patient.cpf ? `<span>🪪 ${patient.cpf}</span>` : ''}
            <span>${badge(patient.status)}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="openPatientModal(${id})">✏️ Editar</button>
          <button class="btn btn-primary btn-sm" onclick="openNewAppointmentForPatient(${id},'${patient.name.replace(/'/g,"\\'")}')" >📅 Agendar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div class="stat-card stat-primary" style="padding:14px;">
          <div class="stat-icon" style="width:40px;height:40px;font-size:18px;">📅</div>
          <div class="stat-content"><div class="stat-value" style="font-size:22px;">${appointments.length}</div><div class="stat-label">Total de Consultas</div></div>
        </div>
        <div class="stat-card stat-success" style="padding:14px;">
          <div class="stat-icon" style="width:40px;height:40px;font-size:18px;">✅</div>
          <div class="stat-content"><div class="stat-value" style="font-size:22px;">${totalSessions}</div><div class="stat-label">Sessões Realizadas</div></div>
        </div>
        <div class="stat-card stat-warning" style="padding:14px;">
          <div class="stat-icon" style="width:40px;height:40px;font-size:18px;">💰</div>
          <div class="stat-content"><div class="stat-value" style="font-size:18px;">${fmt.currency(totalPaid)}</div><div class="stat-label">Total em Consultas</div></div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn active" onclick="switchProfileTab('info',this)">📋 Informações</button>
        <button class="tab-btn" onclick="switchProfileTab('appointments',this)">📅 Consultas (${appointments.length})</button>
        <button class="tab-btn" onclick="switchProfileTab('notes',this)">📝 Prontuário (${notes.length})</button>
      </div>

      <div id="ptab-info" class="tab-content active">
        <div class="card"><div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
            <div>
              <p class="form-section-title">Dados Pessoais</p>
              ${infoRow('Estado Civil', patient.marital_status)}
              ${infoRow('Profissão', patient.occupation)}
              ${infoRow('Como encontrou', patient.referral)}
              ${infoRow('Plano de Saúde', patient.health_insurance)}
              ${infoRow('Nº Carteirinha', patient.insurance_number)}
            </div>
            <div>
              <p class="form-section-title">Endereço</p>
              ${infoRow('Endereço', patient.address)}
              ${infoRow('Cidade/Estado', [patient.city, patient.state].filter(Boolean).join(' - '))}
              ${infoRow('CEP', patient.zip)}
              <p class="form-section-title mt-8">Emergência</p>
              ${infoRow('Nome', patient.emergency_contact_name)}
              ${infoRow('Telefone', patient.emergency_contact_phone)}
            </div>
          </div>
          ${patient.notes ? `<div class="mt-16"><p class="form-section-title">Observações</p><p style="font-size:14px;line-height:1.6;">${patient.notes}</p></div>` : ''}
        </div></div>
      </div>

      <div id="ptab-appointments" class="tab-content">
        <div class="card"><div class="card-body" style="padding:0;">
          ${appointments.length === 0
            ? '<div class="empty-state"><div class="empty-icon">📅</div><h4>Nenhuma consulta</h4></div>'
            : `<table><thead><tr><th>Data</th><th>Horário</th><th>Serviço</th><th>Duração</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${
              appointments.map(a => `<tr>
                <td>${fmt.date(a.date)}</td>
                <td>${fmt.time(a.time)}</td>
                <td>${a.service_name||'—'}</td>
                <td>${a.duration}min</td>
                <td>${fmt.currency(a.price)}</td>
                <td>${badge(a.status)}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="showAptDetail(${a.id})">Ver</button></td>
              </tr>`).join('')
            }</tbody></table>`
          }
        </div></div>
      </div>

      <div id="ptab-notes" class="tab-content">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
          <button class="btn btn-primary btn-sm" onclick="openNoteModal(${id})">+ Nova Anotação</button>
        </div>
        ${notes.length === 0
          ? '<div class="empty-state"><div class="empty-icon">📝</div><h4>Nenhuma anotação</h4><p>Adicione anotações após as sessões</p></div>'
          : notes.map(n => `
            <div class="note-card">
              <div class="note-meta">
                <div>
                  <span class="note-date">${fmt.date(n.date||n.created_at?.split('T')[0]||n.created_at?.split(' ')[0])} ${n.time ? '· ' + fmt.time(n.time) : ''}</span>
                  ${n.service_name ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">${n.service_name}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  ${n.mood ? `<span>${['','😞','😟','😐','🙂','😊'][n.mood]}</span>` : ''}
                  <button class="btn btn-sm btn-secondary" onclick="openEditNote(${n.id})">✏️</button>
                  <button class="btn btn-sm btn-secondary" onclick="deleteNote(${n.id},${id})">🗑</button>
                </div>
              </div>
              <div class="note-content">${n.content || '(sem conteúdo)'}</div>
            </div>
          `).join('')
        }
      </div>
    `;
  } catch(e) { contentEl.innerHTML = '<p>Erro ao carregar perfil</p>'; }
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div style="margin-bottom:8px;"><span style="font-size:12px;color:var(--text-muted);">${label}</span><div style="font-size:14px;font-weight:500;">${value}</div></div>`;
}

function switchProfileTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ptab-'+tab).classList.add('active');
}

// ==================== PRONTUÁRIO ====================
async function loadProntuario() {
  const q = document.getElementById('prontuarioSearch').value;
  let url = '/api/patients?status=active';
  if (q) url = `/api/patients?search=${encodeURIComponent(q)}`;
  try {
    const patients = await api('GET', url);
    const el = document.getElementById('prontuarioPatientList');
    el.innerHTML = patients.map(p => `
      <div onclick="loadPatientNotes(${p.id},'${p.name.replace(/'/g,"\\'")}')"
        style="padding:10px 12px;cursor:pointer;border-radius:8px;font-size:14px;font-weight:500;margin-bottom:4px;transition:all .2s"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
        id="pron-patient-${p.id}"
      >
        <div>${p.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${badge(p.status)}</div>
      </div>
    `).join('');
  } catch(e) {}
}

async function loadPatientNotes(patientId, name) {
  // Highlight selected
  document.querySelectorAll('[id^="pron-patient-"]').forEach(el => el.style.background='');
  const sel = document.getElementById('pron-patient-'+patientId);
  if (sel) sel.style.background = 'rgba(108,99,255,0.08)';

  const contentEl = document.getElementById('prontuarioContent');
  contentEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const notes = await api('GET', `/api/patients/${patientId}/notes`);
    contentEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:18px;font-weight:700;">📋 ${name}</h3>
        <button class="btn btn-primary btn-sm" onclick="openNoteModal(${patientId})">+ Nova Anotação</button>
      </div>
      ${notes.length === 0
        ? '<div class="empty-state"><div class="empty-icon">📝</div><h4>Nenhuma anotação ainda</h4><p>Adicione a primeira anotação desta paciente</p></div>'
        : notes.map(n => `
          <div class="note-card">
            <div class="note-meta">
              <div>
                <span class="note-date">${fmt.date(n.date||n.created_at?.split('T')[0]||n.created_at?.split(' ')[0])}</span>
                ${n.service_name ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">· ${n.service_name}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${n.mood ? `<span title="Humor do paciente">${['','😞','😟','😐','🙂','😊'][n.mood]}</span>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="openEditNote(${n.id})">✏️</button>
                <button class="btn btn-sm btn-secondary" onclick="deleteNote(${n.id},null,${patientId})">🗑</button>
              </div>
            </div>
            <div class="note-content">${n.content || '(sem conteúdo)'}</div>
          </div>
        `).join('')
      }
    `;
  } catch(e) {}
}

let prontuarioSearchTimeout = null;
function searchProntuario() {
  clearTimeout(prontuarioSearchTimeout);
  prontuarioSearchTimeout = setTimeout(loadProntuario, 300);
}

// ==================== NOTES ====================
function openNoteModal(patientId, aptId) {
  document.getElementById('nf-id').value = '';
  document.getElementById('nf-patient_id').value = patientId;
  document.getElementById('nf-appointment_id').value = aptId || '';
  document.getElementById('nf-content').value = '';
  document.querySelectorAll('input[name="nf-mood"]').forEach(r => r.checked = false);
  document.getElementById('noteModalTitle').textContent = 'Nova Anotação';
  openModal('noteModal');
}

async function openNoteFromApt(aptId, patientId) {
  closeModal('aptDetailModal');
  openNoteModal(patientId, aptId);
}

async function openEditNote(id) {
  try {
    const note = await api('GET', `/api/notes/${id}`);
    document.getElementById('nf-id').value = note.id;
    document.getElementById('nf-patient_id').value = note.patient_id;
    document.getElementById('nf-appointment_id').value = note.appointment_id || '';
    document.getElementById('nf-content').value = note.content || '';
    if (note.mood) {
      const radio = document.querySelector(`input[name="nf-mood"][value="${note.mood}"]`);
      if (radio) radio.checked = true;
    }
    document.getElementById('noteModalTitle').textContent = 'Editar Anotação';
    openModal('noteModal');
  } catch(e) { toast('Erro ao carregar anotação', 'error'); }
}

async function saveNote() {
  const id = document.getElementById('nf-id').value;
  const patient_id = document.getElementById('nf-patient_id').value;
  const appointment_id = document.getElementById('nf-appointment_id').value;
  const content = document.getElementById('nf-content').value;
  const moodEl = document.querySelector('input[name="nf-mood"]:checked');
  const mood = moodEl ? parseInt(moodEl.value) : null;
  try {
    if (id) await api('PUT', `/api/notes/${id}`, { content, mood });
    else await api('POST', '/api/notes', { patient_id: parseInt(patient_id), appointment_id: appointment_id ? parseInt(appointment_id) : null, content, mood });
    toast('Anotação salva!');
    closeModal('noteModal');
    // Reload if on prontuario
    if (currentSection === 'prontuario') {
      const sel = document.querySelector('[id^="pron-patient-"][style*="background"]');
      if (sel) { const pid = sel.id.split('-')[2]; const name = sel.querySelector('div').textContent; loadPatientNotes(pid, name); }
    }
    // Reload profile if on profile
    if (currentSection === 'patient-profile') {
      const pid = document.getElementById('nf-patient_id').value;
      openPatientProfile(pid);
    }
  } catch(e) { toast(e.message, 'error'); }
}

function deleteNote(id, patientId, altPatientId) {
  confirmDelete('Excluir esta anotação?', async () => {
    try {
      await api('DELETE', `/api/notes/${id}`);
      toast('Anotação excluída');
      const pid = patientId || altPatientId;
      if (currentSection === 'patient-profile' && pid) openPatientProfile(pid);
      if (currentSection === 'prontuario') {
        const sel = document.querySelector('[id^="pron-patient-"][style*="background"]');
        if (sel) { const p2 = sel.id.split('-')[2]; const name = sel.querySelector('div').textContent; loadPatientNotes(p2, name); }
      }
    } catch(e) { toast(e.message, 'error'); }
  });
}

// ==================== FINANCEIRO ====================
function initFinMonthFilter() {
  const sel = document.getElementById('finMonthFilter');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos os meses</option>';
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().substring(0, 7);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function loadFinanceiro() {
  initFinMonthFilter();
  const month = document.getElementById('finMonthFilter')?.value || '';
  const status = document.getElementById('finStatusFilter')?.value || '';
  try {
    // Summary for current month
    const currentMonth = new Date().toISOString().substring(0,7);
    const allMonth = await api('GET', `/api/payments?month=${currentMonth}`);
    const received = allMonth.filter(p => p.status==='paid').reduce((a,p)=>a+p.amount,0);
    const pending = allMonth.filter(p => p.status==='pending').reduce((a,p)=>a+p.amount,0);
    document.getElementById('finReceived').textContent = fmt.currency(received);
    document.getElementById('finPending').textContent = fmt.currency(pending);
    document.getElementById('finTotal').textContent = fmt.currency(received + pending);

    // Filtered list
    let url = '/api/payments?';
    if (month) url += `month=${month}&`;
    if (status) url += `status=${status}`;
    const payments = await api('GET', url);
    const tbody = document.getElementById('paymentsTbody');
    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💰</div><h4>Nenhum pagamento encontrado</h4></div></td></tr>`;
    } else {
      tbody.innerHTML = payments.map(p => `
        <tr>
          <td><strong>${p.patient_name}</strong></td>
          <td>${p.service_name||'—'}</td>
          <td>${fmt.date(p.appointment_date)}</td>
          <td><strong>${fmt.currency(p.amount)}</strong></td>
          <td>${badge(p.status)}</td>
          <td>${p.status==='paid' ? `${fmt.methodLabel(p.method)} · ${fmt.date(p.payment_date)}` : '—'}</td>
          <td>
            ${p.status==='pending'
              ? `<button class="btn btn-sm btn-success" onclick="openPayModal(${p.id},${p.amount})">✓ Pagar</button>`
              : `<button class="btn btn-sm btn-secondary" onclick="unpay(${p.id})">↩ Estornar</button>`
            }
          </td>
        </tr>
      `).join('');
    }

    // Charts
    const summary = await api('GET', '/api/payments/summary');
    if (finChart) finChart.destroy();
    const ctx2 = document.getElementById('finChart').getContext('2d');
    finChart = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: summary.map(s => fmt.monthLabel(s.month).split(' ')[0]),
        datasets: [
          { label: 'Recebido', data: summary.map(s=>s.received), borderColor: '#2ECC71', backgroundColor: 'rgba(46,204,113,0.1)', fill: true, tension: 0.3 },
          { label: 'Pendente', data: summary.map(s=>s.pending), borderColor: '#F39C12', backgroundColor: 'rgba(243,156,18,0.1)', fill: true, tension: 0.3 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$'+v } } } }
    });

    // Method chart
    const methodData = {};
    payments.filter(p => p.status==='paid' && p.method).forEach(p => { methodData[fmt.methodLabel(p.method)] = (methodData[fmt.methodLabel(p.method)]||0)+p.amount; });
    if (payMethodChart) payMethodChart.destroy();
    const ctx3 = document.getElementById('payMethodChart').getContext('2d');
    const mKeys = Object.keys(methodData);
    if (mKeys.length > 0) {
      payMethodChart = new Chart(ctx3, {
        type: 'doughnut',
        data: {
          labels: mKeys,
          datasets: [{ data: mKeys.map(k=>methodData[k]), backgroundColor: ['#6C63FF','#4ECDC4','#2ECC71','#F39C12','#3498DB'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    } else {
      ctx3.canvas.parentElement.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Sem dados de pagamento</p></div>';
    }
  } catch(e) { console.error(e); }
}

function openPayModal(id, amount) {
  document.getElementById('payf-id').value = id;
  document.getElementById('payf-amount').value = amount;
  document.getElementById('payf-date').value = new Date().toISOString().split('T')[0];
  openModal('payModal');
}

async function confirmPayment() {
  const id = document.getElementById('payf-id').value;
  const method = document.getElementById('payf-method').value;
  const payment_date = document.getElementById('payf-date').value;
  try {
    await api('PATCH', `/api/payments/${id}/pay`, { method, payment_date });
    toast('Pagamento confirmado!');
    closeModal('payModal');
    loadFinanceiro();
    loadDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

async function unpay(id) {
  try {
    await api('PATCH', `/api/payments/${id}/unpay`, {});
    toast('Pagamento estornado');
    loadFinanceiro();
  } catch(e) { toast(e.message, 'error'); }
}

// ==================== SERVICES ====================
async function loadServices() {
  try {
    const data = await api('GET', '/api/services');
    servicesCache = data;
    const el = document.getElementById('servicesGrid');
    if (data.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗂️</div><h4>Nenhum serviço cadastrado</h4></div>';
      return;
    }
    el.innerHTML = data.map(s => `
      <div class="service-card" style="border-top-color:${s.color}">
        <div class="service-color-bar" style="background:${s.color}"></div>
        <div class="service-info">
          <div class="service-name">${s.name}</div>
          ${s.description ? `<div class="service-desc">${s.description}</div>` : ''}
          <div class="service-meta">
            <span>⏱ ${s.duration}min</span>
            <span>💰 ${fmt.currency(s.price)}</span>
            ${!s.active ? `<span class="badge badge-inactive">Inativo</span>` : ''}
          </div>
        </div>
        <div class="service-actions">
          <button class="btn-icon" onclick="openServiceModal(${s.id})" title="Editar">✏️</button>
          <button class="btn-icon" onclick="deleteService(${s.id},'${s.name.replace(/'/g,"\\'")}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch(e) {}
}

async function loadServicesForSelect() {
  if (servicesCache.length === 0) servicesCache = await api('GET', '/api/services');
  const sel = document.getElementById('af-service_id');
  sel.innerHTML = '<option value="">— Selecione —</option>';
  servicesCache.filter(s => s.active).forEach(s => {
    sel.innerHTML += `<option value="${s.id}">${s.name} (${s.duration}min · ${fmt.currency(s.price)})</option>`;
  });
}

async function openServiceModal(id) {
  document.getElementById('sf-id').value = '';
  document.getElementById('sf-name').value = '';
  document.getElementById('sf-description').value = '';
  document.getElementById('sf-duration').value = '50';
  document.getElementById('sf-price').value = '';
  document.getElementById('sf-color').value = '#6C63FF';
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
  document.querySelector('.color-option[data-color="#6C63FF"]').classList.add('selected');
  document.getElementById('svcModalTitle').textContent = id ? 'Editar Serviço' : 'Novo Serviço';
  if (id) {
    try {
      const svc = servicesCache.find(s => s.id === id) || await api('GET', `/api/services`).then(d => d.find(s=>s.id===id));
      document.getElementById('sf-id').value = svc.id;
      document.getElementById('sf-name').value = svc.name;
      document.getElementById('sf-description').value = svc.description || '';
      document.getElementById('sf-duration').value = svc.duration;
      document.getElementById('sf-price').value = svc.price;
      document.getElementById('sf-color').value = svc.color;
      const co = document.querySelector(`.color-option[data-color="${svc.color}"]`);
      if (co) { document.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected')); co.classList.add('selected'); }
    } catch(e) {}
  }
  openModal('serviceModal');
}

async function saveService() {
  const id = document.getElementById('sf-id').value;
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { toast('Nome é obrigatório', 'error'); return; }
  const body = {
    name,
    description: document.getElementById('sf-description').value,
    duration: parseInt(document.getElementById('sf-duration').value) || 50,
    price: parseFloat(document.getElementById('sf-price').value) || 0,
    color: document.getElementById('sf-color').value,
  };
  try {
    if (id) await api('PUT', `/api/services/${id}`, body);
    else await api('POST', '/api/services', body);
    toast(id ? 'Serviço atualizado!' : 'Serviço criado!');
    closeModal('serviceModal');
    servicesCache = [];
    loadServices();
  } catch(e) { toast(e.message, 'error'); }
}

function deleteService(id, name) {
  confirmDelete(`Excluir o serviço "${name}"?`, async () => {
    try {
      await api('DELETE', `/api/services/${id}`);
      toast('Serviço excluído');
      servicesCache = [];
      loadServices();
    } catch(e) { toast(e.message, 'error'); }
  });
}

function selectColor(el) {
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('sf-color').value = el.dataset.color;
}

// ==================== SETTINGS ====================
async function getSettings() {
  if (Object.keys(settingsCache).length === 0) settingsCache = await api('GET', '/api/settings');
  return settingsCache;
}

async function loadSettings() {
  try {
    const settings = await api('GET', '/api/settings');
    settingsCache = settings;
    Object.entries(settings).forEach(([k, v]) => {
      const el = document.getElementById('cfg-' + k);
      if (el) el.value = v || '';
    });
    updateSidebarInfo(settings);
  } catch(e) {}
}

function updateSidebarInfo(settings) {
  if (settings.clinic_name) document.getElementById('sidebarClinicName').textContent = settings.clinic_name;
  if (settings.psychologist_name) document.getElementById('sidebarPsychName').textContent = settings.psychologist_name;
  if (settings.crp) document.getElementById('sidebarCRP').textContent = settings.crp;
}

async function saveSettings() {
  const keys = ['clinic_name','psychologist_name','crp','phone','email','address','working_hours_start','working_hours_end','default_duration','default_price'];
  const body = {};
  keys.forEach(k => { const el = document.getElementById('cfg-'+k); if (el) body[k] = el.value; });
  try {
    await api('PUT', '/api/settings', body);
    settingsCache = body;
    updateSidebarInfo(body);
    toast('Configurações salvas!');
  } catch(e) { toast(e.message, 'error'); }
}

// ==================== HELPERS ====================
function clearForm(prefix, fields) {
  fields.forEach(f => {
    const el = document.getElementById(prefix + f);
    if (el) el.value = '';
  });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Set date
  const now = new Date();
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Load settings for sidebar
  try { const s = await api('GET', '/api/settings'); settingsCache = s; updateSidebarInfo(s); } catch(e) {}

  // Load dashboard
  loadDashboard();

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  });

  // Init fin month filter
  initFinMonthFilter();
});
