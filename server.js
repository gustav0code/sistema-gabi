const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');

// Suprimir aviso de experimental do node:sqlite
const { emitWarning } = process;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === 'string' && warning.includes('SQLite')) return;
  emitWarning.call(process, warning, ...args);
};

const app = express();
const PORT = 3000;

// Criar pasta data se não existir
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

// Banco de dados SQLite nativo do Node.js
const db = new DatabaseSync('./data/gabi.db');
db.exec('PRAGMA foreign_keys = ON');

// Wrapper: converte undefined/'' → null automaticamente (node:sqlite é estrito com tipos)
const _origPrepare = db.prepare.bind(db);
const N = args => args.map(v => (v === undefined || v === '') ? null : v);
db.prepare = (sql) => {
  const stmt = _origPrepare(sql);
  return new Proxy(stmt, {
    get(target, prop) {
      if (prop === 'run') return (...a) => target.run(...N(a));
      if (prop === 'get') return (...a) => target.get(...N(a));
      if (prop === 'all') return (...a) => target.all(...N(a));
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    }
  });
};

// Inicializar schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cpf TEXT,
    birth_date TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    health_insurance TEXT,
    insurance_number TEXT,
    occupation TEXT,
    marital_status TEXT,
    referral TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    duration INTEGER DEFAULT 50,
    price REAL DEFAULT 0,
    color TEXT DEFAULT '#6C63FF',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 50,
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    price REAL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS session_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    content TEXT,
    mood INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    amount REAL,
    payment_date TEXT,
    method TEXT DEFAULT 'pix',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// Tabela de usuários
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// Criar usuário padrão se não existir
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'gabi_salt_2024').digest('hex');
}
const defaultUser = db.prepare('SELECT id FROM users WHERE username=?').get('gabi');
if (!defaultUser) {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?)').run('gabi', hashPassword('gabi2024'));
}

// Inserir configurações padrão
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('clinic_name', 'Consultório de Psicologia');
insertSetting.run('psychologist_name', 'Dra. Gabrielle');
insertSetting.run('crp', '');
insertSetting.run('phone', '');
insertSetting.run('email', '');
insertSetting.run('address', '');
insertSetting.run('working_hours_start', '08:00');
insertSetting.run('working_hours_end', '18:00');
insertSetting.run('default_duration', '50');
insertSetting.run('default_price', '150');

// Inserir serviços padrão
const countServices = db.prepare('SELECT COUNT(*) as c FROM services').get();
if (countServices.c === 0) {
  const ins = db.prepare('INSERT INTO services (name, description, duration, price, color) VALUES (?, ?, ?, ?, ?)');
  ins.run('Consulta Individual', 'Sessão de psicoterapia individual', 50, 150, '#6C63FF');
  ins.run('Consulta de Casal', 'Sessão de terapia para casais', 80, 220, '#4ECDC4');
  ins.run('Consulta Familiar', 'Sessão de terapia familiar', 80, 250, '#FF6B6B');
  ins.run('Avaliação Psicológica', 'Avaliação e testagem psicológica', 90, 300, '#F39C12');
  ins.run('Orientação de Pais', 'Sessão de orientação parental', 50, 180, '#2ECC71');
}

app.use(express.json());

// ==================== SESSÃO ====================
app.use(session({
  secret: 'gabi_sistema_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

// ==================== AUTH ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  res.json({ username: req.session.username });
});

app.post('/api/change-password', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (user.password_hash !== hashPassword(current_password)) {
    return res.status(400).json({ error: 'Senha atual incorreta' });
  }
  if (!new_password || new_password.length < 4) {
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 4 caracteres' });
  }
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(new_password), req.session.userId);
  res.json({ success: true });
});

// Middleware: protege todas as rotas /api/* exceto /api/login
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  next();
});

// Arquivos estáticos — login.html sempre acessível, index.html protegido
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DASHBOARD ====================
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  const stats = {
    total_patients: db.prepare("SELECT COUNT(*) as c FROM patients WHERE status='active'").get().c,
    appointments_today: db.prepare("SELECT COUNT(*) as c FROM appointments WHERE date=? AND status!='cancelled'").get(today).c,
    appointments_month: db.prepare("SELECT COUNT(*) as c FROM appointments WHERE date>=? AND date<=? AND status!='cancelled'").get(monthStart, today).c,
    revenue_month: db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE payment_date>=? AND payment_date<=? AND status='paid'").get(monthStart, today).s,
    pending_payments: db.prepare("SELECT COUNT(*) as c FROM payments WHERE status='pending'").get().c,
  };

  const today_appointments = db.prepare(`
    SELECT a.*, p.name as patient_name, s.name as service_name, s.color as service_color
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.date = ? AND a.status != 'cancelled'
    ORDER BY a.time
  `).all(today);

  const recent_patients = db.prepare(`
    SELECT * FROM patients ORDER BY created_at DESC LIMIT 5
  `).all();

  const monthly_revenue = db.prepare(`
    SELECT substr(payment_date,1,7) as month, SUM(amount) as total
    FROM payments
    WHERE status='paid' AND payment_date >= date('now','-6 months')
    GROUP BY month ORDER BY month
  `).all();

  const upcoming = db.prepare(`
    SELECT a.*, p.name as patient_name, s.name as service_name, s.color as service_color
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.date > ? AND a.status = 'scheduled'
    ORDER BY a.date, a.time
    LIMIT 5
  `).all(today);

  res.json({ stats, today_appointments, recent_patients, monthly_revenue, upcoming });
});

// ==================== PATIENTS ====================
app.get('/api/patients', (req, res) => {
  const { search, status } = req.query;
  let sql = 'SELECT * FROM patients WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (name LIKE ? OR cpf LIKE ? OR phone LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/patients/:id', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado' });
  res.json(patient);
});

app.post('/api/patients', (req, res) => {
  const { name, cpf, birth_date, email, phone, address, city, state, zip,
    emergency_contact_name, emergency_contact_phone, health_insurance,
    insurance_number, occupation, marital_status, referral, notes, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare(`
    INSERT INTO patients (name,cpf,birth_date,email,phone,address,city,state,zip,
      emergency_contact_name,emergency_contact_phone,health_insurance,insurance_number,
      occupation,marital_status,referral,notes,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name,cpf,birth_date,email,phone,address,city,state,zip,
    emergency_contact_name,emergency_contact_phone,health_insurance,insurance_number,
    occupation,marital_status,referral,notes,status||'active');
  res.json(db.prepare('SELECT * FROM patients WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/patients/:id', (req, res) => {
  const { name, cpf, birth_date, email, phone, address, city, state, zip,
    emergency_contact_name, emergency_contact_phone, health_insurance,
    insurance_number, occupation, marital_status, referral, notes, status } = req.body;
  db.prepare(`
    UPDATE patients SET name=?,cpf=?,birth_date=?,email=?,phone=?,address=?,city=?,state=?,zip=?,
      emergency_contact_name=?,emergency_contact_phone=?,health_insurance=?,insurance_number=?,
      occupation=?,marital_status=?,referral=?,notes=?,status=?
    WHERE id=?
  `).run(name,cpf,birth_date,email,phone,address,city,state,zip,
    emergency_contact_name,emergency_contact_phone,health_insurance,insurance_number,
    occupation,marital_status,referral,notes,status,req.params.id);
  res.json(db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id));
});

app.delete('/api/patients/:id', (req, res) => {
  db.prepare('DELETE FROM patients WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/patients/:id/appointments', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, s.name as service_name, s.color as service_color
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.patient_id = ?
    ORDER BY a.date DESC, a.time DESC
  `).all(req.params.id);
  res.json(rows);
});

app.get('/api/patients/:id/notes', (req, res) => {
  const rows = db.prepare(`
    SELECT sn.*, a.date, a.time, s.name as service_name
    FROM session_notes sn
    LEFT JOIN appointments a ON sn.appointment_id = a.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE sn.patient_id = ?
    ORDER BY sn.created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

// ==================== APPOINTMENTS ====================
app.get('/api/appointments', (req, res) => {
  const { start, end, patient_id, status } = req.query;
  let sql = `
    SELECT a.*, p.name as patient_name, p.phone as patient_phone,
           s.name as service_name, s.color as service_color
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (start) { sql += ' AND a.date >= ?'; params.push(start); }
  if (end) { sql += ' AND a.date <= ?'; params.push(end); }
  if (patient_id) { sql += ' AND a.patient_id = ?'; params.push(patient_id); }
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  sql += ' ORDER BY a.date, a.time';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/appointments/:id', (req, res) => {
  const apt = db.prepare(`
    SELECT a.*, p.name as patient_name, s.name as service_name, s.color as service_color
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Consulta não encontrada' });
  res.json(apt);
});

app.post('/api/appointments', (req, res) => {
  const { patient_id, service_id, date, time, duration, notes, price, status } = req.body;
  if (!patient_id || !date || !time) return res.status(400).json({ error: 'Paciente, data e horário são obrigatórios' });

  // Auto-preencher preço do serviço se não informado
  let finalPrice = price;
  if (!finalPrice && service_id) {
    const svc = db.prepare('SELECT price FROM services WHERE id=?').get(service_id);
    if (svc) finalPrice = svc.price;
  }

  const result = db.prepare(`
    INSERT INTO appointments (patient_id,service_id,date,time,duration,notes,price,status)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(patient_id,service_id||null,date,time,duration||50,notes,finalPrice,status||'scheduled');

  // Criar registro de pagamento automaticamente
  if (finalPrice && finalPrice > 0) {
    db.prepare(`
      INSERT INTO payments (appointment_id,patient_id,amount,status)
      VALUES (?,?,?,'pending')
    `).run(result.lastInsertRowid, patient_id, finalPrice);
  }

  res.json(db.prepare(`
    SELECT a.*, p.name as patient_name, s.name as service_name, s.color as service_color
    FROM appointments a JOIN patients p ON a.patient_id=p.id
    LEFT JOIN services s ON a.service_id=s.id WHERE a.id=?
  `).get(result.lastInsertRowid));
});

app.put('/api/appointments/:id', (req, res) => {
  const { patient_id, service_id, date, time, duration, notes, price, status } = req.body;
  db.prepare(`
    UPDATE appointments SET patient_id=?,service_id=?,date=?,time=?,duration=?,notes=?,price=?,status=?
    WHERE id=?
  `).run(patient_id,service_id,date,time,duration,notes,price,status,req.params.id);
  res.json(db.prepare(`
    SELECT a.*, p.name as patient_name, s.name as service_name, s.color as service_color
    FROM appointments a JOIN patients p ON a.patient_id=p.id
    LEFT JOIN services s ON a.service_id=s.id WHERE a.id=?
  `).get(req.params.id));
});

app.patch('/api/appointments/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ==================== SERVICES ====================
app.get('/api/services', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY name').all());
});

app.post('/api/services', (req, res) => {
  const { name, description, duration, price, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare('INSERT INTO services (name,description,duration,price,color) VALUES (?,?,?,?,?)').run(name,description,duration||50,price||0,color||'#6C63FF');
  res.json(db.prepare('SELECT * FROM services WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/services/:id', (req, res) => {
  const { name, description, duration, price, color, active } = req.body;
  db.prepare('UPDATE services SET name=?,description=?,duration=?,price=?,color=?,active=? WHERE id=?').run(name,description,duration,price,color,active??1,req.params.id);
  res.json(db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id));
});

app.delete('/api/services/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ==================== SESSION NOTES ====================
app.get('/api/notes/:id', (req, res) => {
  res.json(db.prepare('SELECT * FROM session_notes WHERE id=?').get(req.params.id));
});

app.post('/api/notes', (req, res) => {
  const { appointment_id, patient_id, content, mood } = req.body;
  // Verificar se já existe nota para este agendamento
  const existing = appointment_id ? db.prepare('SELECT id FROM session_notes WHERE appointment_id=?').get(appointment_id) : null;
  if (existing) {
    db.prepare('UPDATE session_notes SET content=?,mood=?,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(content,mood,existing.id);
    res.json(db.prepare('SELECT * FROM session_notes WHERE id=?').get(existing.id));
  } else {
    const result = db.prepare('INSERT INTO session_notes (appointment_id,patient_id,content,mood) VALUES (?,?,?,?)').run(appointment_id||null,patient_id,content,mood);
    res.json(db.prepare('SELECT * FROM session_notes WHERE id=?').get(result.lastInsertRowid));
  }
});

app.put('/api/notes/:id', (req, res) => {
  const { content, mood } = req.body;
  db.prepare('UPDATE session_notes SET content=?,mood=?,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(content,mood,req.params.id);
  res.json(db.prepare('SELECT * FROM session_notes WHERE id=?').get(req.params.id));
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM session_notes WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ==================== PAYMENTS ====================
app.get('/api/payments', (req, res) => {
  const { month, status, patient_id } = req.query;
  let sql = `
    SELECT py.*, p.name as patient_name, a.date as appointment_date, a.time as appointment_time,
           s.name as service_name
    FROM payments py
    JOIN patients p ON py.patient_id = p.id
    LEFT JOIN appointments a ON py.appointment_id = a.id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (month) { sql += ' AND substr(COALESCE(py.payment_date, a.date),1,7) = ?'; params.push(month); }
  if (status) { sql += ' AND py.status = ?'; params.push(status); }
  if (patient_id) { sql += ' AND py.patient_id = ?'; params.push(patient_id); }
  sql += ' ORDER BY py.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/payments/:id/pay', (req, res) => {
  const { method, payment_date } = req.body;
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE payments SET status=\'paid\', method=?, payment_date=? WHERE id=?').run(method||'pix', payment_date||today, req.params.id);
  res.json({ success: true });
});

app.patch('/api/payments/:id/unpay', (req, res) => {
  db.prepare('UPDATE payments SET status=\'pending\', payment_date=NULL WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/payments/:id', (req, res) => {
  const { amount, method, payment_date, status, notes } = req.body;
  db.prepare('UPDATE payments SET amount=?,method=?,payment_date=?,status=?,notes=? WHERE id=?').run(amount,method,payment_date,status,notes,req.params.id);
  res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id));
});

app.get('/api/payments/summary', (req, res) => {
  const summary = db.prepare(`
    SELECT
      substr(COALESCE(payment_date, created_at),1,7) as month,
      SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as received,
      SUM(CASE WHEN status='pending' THEN amount ELSE 0 END) as pending,
      COUNT(*) as total_count
    FROM payments
    WHERE created_at >= date('now','-12 months')
    GROUP BY month ORDER BY month
  `).all();
  res.json(summary);
});

// ==================== SETTINGS ====================
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
  db.exec('BEGIN');
  try {
    for (const [key, value] of Object.entries(req.body)) upsert.run(key, value);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
  res.json({ success: true });
});

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`\n✓ Sistema Gabi rodando em http://localhost:${PORT}`);
  console.log('  Pressione Ctrl+C para encerrar.\n');
});
