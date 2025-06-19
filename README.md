# Notion Database Cloner

Интеграция с Notion API для дублирования баз данных через вебхук.

## 🚀 Быстрый старт

### 1. Настройка Notion Integration

1. Перейди на [Notion Developers](https://developers.notion.com/docs/create-a-notion-integration)
2. Создай новую интеграцию
3. Скопируй токен (начинается с `secret_`)
4. Добавь интеграцию к нужным страницам/базам данных в Notion

### 2. Деплой на Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/notion-integration)

Или вручную:

```bash
# Установи Vercel CLI
npm i -g vercel

# Деплой
vercel

# Добавь переменную окружения
vercel env add NOTION_TOKEN
```

### 3. Использование

POST запрос к `https://your-app.vercel.app/api/duplicate`:

```json
{
  "sourceDatabaseId": "database-id-to-copy",
  "parentPageId": "page-where-to-insert-copy",
  "copyContent": true,
  "maxRows": 100
}
```

## 📋 API Endpoints

### POST `/api/duplicate`

Дублирует базу данных Notion.

**Параметры:**

- `sourceDatabaseId` (обязательно) - ID базы данных для копирования
- `parentPageId` (обязательно) - ID страницы, куда вставить копию
- `copyContent` (опционально) - копировать ли содержимое (по умолчанию `true`)
- `maxRows` (опционально) - максимальное количество строк для копирования (по умолчанию 100, максимум 500)

**Пример запроса:**

```javascript
const response = await fetch('/api/duplicate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sourceDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    parentPageId: 'z9y8x7w6-v5u4-3210-9876-543210fedcba',
    copyContent: true,
    maxRows: 50
  })
});

const result = await response.json();
console.log(result);
```

**Успешный ответ:**

```json
{
  "ok": true,
  "data": {
    "newDatabaseId": "new-database-id",
    "originalDatabaseId": "source-database-id",
    "title": "Copy of My Database - 12/25/2024",
    "copiedRows": 42,
    "timestamp": "2024-12-25T10:30:00.000Z"
  }
}
```

### GET `/api/health`

Проверка состояния сервиса.

## 🔧 Ограничения

1. **Не копируются:**
   - Формулы (formula)
   - Rollup поля
   - Системные поля (created_time, created_by, etc.)
   - Связи между базами данных (relation)

2. **Копируются:**
   - Заголовки (title)
   - Текст (rich_text)
   - Числа (number)
   - Выбор (select/multi_select)
   - Чекбоксы (checkbox)
   - Даты (date)
   - URL, email, телефон

3. **Лимиты:**
   - Максимум 500 записей за один запрос
   - Время выполнения до 30 секунд

## 🛠️ Разработка

```bash
# Установка зависимостей
npm install

# Локальная разработка
npm run dev

# Тестирование
npm test
```

## 📝 HTML кнопка для тестирования

Создай простую HTML страницу для тестирования:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Notion Cloner</title>
</head>
<body>
    <h1>Notion Database Cloner</h1>
    
    <form id="cloneForm">
        <input type="text" id="sourceDb" placeholder="Source Database ID" required>
        <input type="text" id="parentPage" placeholder="Parent Page ID" required>
        <input type="number" id="maxRows" placeholder="Max Rows (default 100)" value="100">
        <button type="submit">Clone Database</button>
    </form>
    
    <div id="result"></div>
    
    <script>
        document.getElementById('cloneForm').onsubmit = async (e) => {
            e.preventDefault();
            
            const result = await fetch('/api/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceDatabaseId: document.getElementById('sourceDb').value,
                    parentPageId: document.getElementById('parentPage').value,
                    maxRows: parseInt(document.getElementById('maxRows').value) || 100
                })
            });
            
            const data = await result.json();
            document.getElementById('result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        };
    </script>
</body>
</html>
```

## 🚨 Безопасность

- Токен Notion храни только в переменных окружения
- Не комитть `.env` файлы в git
- Ограничивай доступ к интеграции только нужными страницами

## 📞 Поддержка

При проблемах проверь:

1. Правильность токена Notion
2. Доступ интеграции к базам данных
3. Формат ID (32 символа)
4. Логи в Vercel Dashboard
