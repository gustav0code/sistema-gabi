# Changelog — Sistema Gabi

Todas as alterações relevantes do projeto serão documentadas aqui.

---

## [1.1.0] — 2026-04-04

### Adicionado
- Sistema de login com usuário e senha
- Sessão autenticada com duração de 8 horas
- Página de login (`/login`) com design responsivo
- Botão "Sair" na sidebar
- Troca de senha pelo painel (botão 🔑 Senha na sidebar)
- Todas as rotas da API protegidas — sem login, sem acesso
- Credenciais padrão: usuário `gabi`, senha `gabi2024`

---

## [1.0.0] — 2026-04-04

### Adicionado
- Sistema de gestão para consultório de psicologia
- Cadastro e listagem de pacientes
- Agenda de consultas
- Anotações clínicas por paciente
- Interface web com HTML/CSS/JS puro
- Backend Node.js com Express e SQLite
- Scripts `instalar.bat` e `iniciar.bat` para facilitar uso no Windows
- Repositório publicado no GitHub (`gustav0code/sistema-gabi`)
- `.gitignore` configurado para proteger o banco de dados dos pacientes
