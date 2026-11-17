# CONTEXT.md — MediaVault API

## 1. Visão Geral do Projeto
Microsserviço RESTful autônomo em **Node.js + TypeScript** para upload, validação de segurança, redimensionamento e otimização automática de imagens (conversão para `.webp`). Projeto de portfólio com foco em arquitetura limpa, testes automatizados e infraestrutura DevOps.

## 2. Stack Tecnológica & Versões
- **Runtime:** Node.js (v20+ LTS) + TypeScript (`strict: true`)
- **Framework HTTP:** Express
- **Validação:** Zod
- **Upload & Manipulação de Imagem:** Multer (`memoryStorage`) + Sharp
- **Testes:** Vitest + Supertest
- **Infraestrutura:** Docker (`Dockerfile` multi-stage + `docker-compose.yml`) + GitHub Actions (CI/CD)

## 3. Arquitetura e Estrutura de Pastas
```text
media-vault-api/
├── .github/workflows/ci.yml   # Pipeline CI/CD
├── src/
│   ├── config/                # Configurações do Multer e limites de upload
│   ├── controllers/           # Controladores HTTP (recebem req/res)
│   ├── services/              # Lógica de negócio e processamento Sharp
│   ├── validators/            # Schemas de validação Zod
│   ├── middlewares/           # Tratamento global de erros e validações
│   ├── routes/                # Definição das rotas v1
│   ├── app.ts                 # Instância do Express (separada para testes)
│   └── server.ts              # Inicialização da porta HTTP
├── tests/
│   ├── unit/                  # Testes unitários (services e validators)
│   └── integration/           # Testes de rota HTTP com Supertest
├── uploads/                   # Armazenamento local (ignorado no Git)
├── CONTEXT.md                 # Este arquivo de sincronização
├── Dockerfile
└── docker-compose.yml