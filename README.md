# 🚀 NOVA Framework

**Complete Business Application Framework inspired by Microsoft Dynamics 365 Business Central AL Architecture**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-2022-red)](https://www.microsoft.com/sql-server)
[![Node.js](https://img.shields.io/badge/Node.js-18-green)](https://nodejs.org/)

## 📋 Overview

NOVA Framework is a **production-ready, metadata-driven, event-based business application framework** that fully implements the Microsoft Dynamics 365 Business Central AL architecture. It enables rapid development of enterprise-grade business applications with:

- **AL-like object definitions** (Tables, Pages, Codeunits, Reports, XMLPorts, Queries, Enums)
- **Strongly typed data model** with SQL Server
- **Event-driven programming** model
- **Dynamic UI generation** from metadata
- **Built-in validation and business logic**
- **Multi-tenant architecture**
- **Role-based security**

## 🎯 Key Features

### 🔧 **Complete AL Compiler**
- Full AL language parser with PEG.js grammar
- Semantic validation and type checking
- Code generation for SQL Server and TypeScript
- Query and code optimization

### ⚡ **Runtime Engine**
- Multi-tenant application server
- Session and transaction management
- Event dispatcher with subscriber model
- Workflow engine with state machines

### 📊 **SQL Server Integration**
- Full T-SQL support
- Stored procedures and views
- Backup/restore management
- SQL Server Agent jobs
- Transaction log management

### 🎨 **UI Framework**
- Dynamic page rendering with React/MUI
- 20+ built-in controls
- Responsive layouts
- Real-time updates with WebSocket

### 🔐 **Security**
- JWT authentication
- Role-based access control
- Row-level security
- Audit logging
- Field-level permissions

### 📈 **Reporting**
- Multiple export formats (PDF, Excel, CSV, JSON, XML, HTML, YAML)
- Chart visualizations
- Scheduled reports
- Email subscriptions

### 🔌 **Integration**
- RESTful APIs with OpenAPI
- OData v4 services
- Webhooks with retry logic
- XMLPort import/export
- GraphQL support

## 🏗️ Architecture
NOVA Framework
├── packages/ (Core Libraries)
│ ├── compiler/ - AL Compiler, Parser, Generator
│ ├── core/ - Application, Session, Database
│ ├── metadata/ - Metadata Repository, Cache
│ ├── orm/ - Record, Query, Relationships
│ ├── security/ - Auth, Permissions, Audit
│ ├── ui/ - Pages, Controls, Renderer
│ ├── reporting/ - Reports, Exports, Charts
│ └── integration/ - REST, OData, Webhooks, XML
│
└── apps/ (Applications)
├── runtime/ - Production Server
└── studio/ - Development IDE

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- SQL Server 2016+ (or Azure SQL)
- Redis 7+ (optional, for caching)

### Installation

```bash
# Clone repository
git clone https://github.com/nova-framework/nova.git
cd nova

# Install dependencies
npm install typescript@5.4.5 --save-dev

npm install -g lerna
npm install -g typescript ts-node

npm install

npm cache clean
# Bootstrap packages
npm run bootstrap

# Build all packages
npm run build