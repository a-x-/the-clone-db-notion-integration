# 🚀 Деплой на Vercel

## Шаг 1: Настройка Notion Integration

1. Перейди на [Notion Developers](https://www.notion.so/my-integrations)
2. Нажми **"+ New integration"**
3. Заполни:
   - **Name**: `Database Cloner`
   - **Logo**: загрузи или оставь дефолтное
   - **Associated workspace**: выбери нужный workspace
4. Нажми **"Submit"**
5. **ВАЖНО:** Скопируй токен (начинается с `secret_`) - он понадобится позже

## Шаг 2: Дать доступ интеграции к страницам

1. Открой страницу в Notion, где будешь создавать копии баз данных
2. Нажми на **"••• "** в правом верхнем углу
3. Выбери **"+ Add connections"**
4. Найди и выбери свою интеграцию **"Database Cloner"**
5. Нажми **"Confirm"**

Повтори это для всех баз данных, которые хочешь копировать.

## Шаг 3: Деплой на Vercel

### Вариант A: Через GitHub (Рекомендуется)

1. Загрузи проект на GitHub:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/твой-username/notion-integration.git
   git push -u origin main
   ```

2. Перейди на [vercel.com](https://vercel.com)
3. Нажми **"New Project"**
4. Выбери репозиторий из GitHub
5. Framework Preset: **"Other"**
6. Нажми **"Deploy"**

### Вариант B: Через Vercel CLI

1. Установи Vercel CLI:

   ```bash
   npm i -g vercel
   ```

2. Войди в аккаунт:

   ```bash
   vercel login
   ```

3. Деплой:

   ```bash
   vercel
   ```

4. Отвечай на вопросы:
   - Set up and deploy? **Y**
   - Which scope? **твой-username**
   - Link to existing project? **N**
   - What's your project's name? **notion-cloner**
   - In which directory is your code located? **./**

## Шаг 4: Настройка переменных окружения

1. В Vercel Dashboard найди свой проект
2. Перейди в **Settings → Environment Variables**
3. Добавь переменную:
   - **Name**: `NOTION_TOKEN`
   - **Value**: твой токен из Notion (secret_...)
   - **Environments**: All (Production, Preview, Development)
4. Нажми **"Save"**

## Шаг 5: Redeply (Перезапуск)

1. В Vercel Dashboard перейди в **Deployments**
2. Найди последний деплой
3. Нажми **"••• " → "Redeploy"**
4. Выбери **"Use existing Build Cache"**
5. Нажми **"Redeploy"**

## Шаг 6: Тестирование

1. Перейди по URL твоего проекта (что-то вроде `https://notion-cloner-xxx.vercel.app`)
2. Увидишь красивую HTML форму для тестирования
3. Заполни:
   - **Source Database ID**: ID базы данных для копирования
   - **Parent Page ID**: ID страницы, куда вставить копию
4. Нажми **"Clone Database"**

### Как получить ID

1. Открой базу данных или страницу в Notion
2. Скопируй URL: `https://notion.so/workspace/DATABASE_ID?...`
3. ID это 32 символа между слешами (можно с дефисами или без)

**Пример URL:**

```
https://www.notion.so/myworkspace/a1b2c3d4e5f67890abcdef1234567890?v=...
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                   Это и есть DATABASE_ID
```

## 🎯 Готовые эндпоинты

- **Главная страница**: `https://твой-проект.vercel.app/`
- **API для дублирования**: `https://твой-проект.vercel.app/api/duplicate`
- **Health check**: `https://твой-проект.vercel.app/api/health`

## 🛠️ Отладка

Если что-то не работает:

1. **Проверь логи в Vercel:**
   - Vercel Dashboard → твой проект → Functions
   - Найди `/api/duplicate` и посмотри логи

2. **Частые ошибки:**
   - `unauthorized`: Неправильный токен или нет доступа к базе/странице
   - `object_not_found`: Неправильный ID или нет доступа
   - `Invalid ID format`: ID должен быть 32 символа (с дефисами или без)

3. **Проверь переменные окружения:**

   ```bash
   curl https://твой-проект.vercel.app/api/health
   ```

   Должно показать `"hasToken": true`

## 💰 Стоимость

- **Vercel Free Tier:**
  - 100GB bandwidth в месяц
  - 1,000,000 function invocations
  - 100GB-hours compute time
  
Для твоего случая использования это **полностью бесплатно**!

## 🔒 Безопасность в продакшене

1. **Ограничь домены** (опционально):

   ```json
   // vercel.json
   {
     "headers": [
       {
         "source": "/api/(.*)",
         "headers": [
           {
             "key": "Access-Control-Allow-Origin",
             "value": "https://твой-домен.com"
           }
         ]
       }
     ]
   }
   ```

2. **Добавь rate limiting** (для больших нагрузок):

   ```javascript
   // В api/duplicate.js
   const rateLimit = new Map();
   
   if (rateLimit.get(req.headers['x-forwarded-for']) > 10) {
     return res.status(429).json({ error: 'Too many requests' });
   }
   ```

3. **Monitoring**: включи Vercel Analytics для отслеживания использования

## ✅ Checklist готовности к продакшену

- [ ] Notion Integration создана
- [ ] Токен скопирован
- [ ] Доступ выдан нужным страницам/базам
- [ ] Проект задеплоен на Vercel
- [ ] Переменная NOTION_TOKEN добавлена
- [ ] Health check возвращает `{"status": "healthy", "hasToken": true}`
- [ ] Тестовое дублирование прошло успешно
- [ ] Изучена документация в README.md

🎉 **Готово! Твоя интеграция работает в продакшене!**
