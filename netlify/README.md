# Netlify Functions

Эта папка содержит serverless функции для развертывания на Netlify.

## Структура

```
netlify/
├── functions/
│   ├── api.ts          # Главная функция-обертка для Express API
│   └── package.json    # Зависимости для функций
└── README.md
```

## Как это работает

1. **api.ts** оборачивает Express приложение с помощью `serverless-http`
2. Все запросы к `/api/*` и `/auth/*` перенаправляются на эту функцию через `netlify.toml`
3. Функция подключается к MongoDB и обрабатывает запросы
4. Сессии хранятся в MongoDB через MongoStore

## Локальное тестирование

```bash
# Установите Netlify CLI
npm install -g netlify-cli

# Запустите локально
netlify dev
```

Это запустит:
- Frontend на http://localhost:8888
- Functions на http://localhost:8888/.netlify/functions/api

## Переменные окружения

Создайте файл `.env` в корне проекта с переменными из `.env.example`

## Отладка

Логи функций доступны в:
1. Netlify Dashboard → Functions → api
2. Или через CLI: `netlify functions:log api`

## Ограничения Netlify Functions

- Максимальное время выполнения: 10 секунд (Pro: 26 секунд)
- Максимальный размер payload: 6 MB
- Холодный старт: ~1-2 секунды
- Для production рекомендуется использовать connection pooling для MongoDB

