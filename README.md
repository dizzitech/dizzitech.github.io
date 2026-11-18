# DiziTech 1.5 — UI polish & Contacts 2.0

Компактный двуязычный лендинг: Hero, услуги, этапы и контакты/подвал. HTML, CSS, ES Modules и Canvas 2D, без runtime-зависимостей. Публикация: GitHub Pages **main → /docs**, без собственного Actions workflow.

В 1.5 доработаны шапка и контакты. WhatsApp-кнопка имеет белый фон, зелёные рамку 1 px, текст и прежнюю SVG (`#147D3D`), светло-зелёный hover `#F0FFF4` и заметный keyboard focus. Контраст текста — 5,21:1 на белом и 5,04:1 при hover. Переключатель ҚАЗ / РУС получил глобус и подвижный сегмент (200 мс); при reduced motion движение отключено. На телефоне логотип и язык расположены сверху, полная WhatsApp-кнопка — ниже. Размеры текста не уменьшались.

Под одним заголовком «Байланыс / Контакты» контакты расположены в порядке **сайт → почта → телефоны**: три колонки на компьютере, тот же порядок сверху вниз на телефоне. Номера стоят один под другим; каждый — одна ссылка WhatsApp, включая правую иконку. Большая нижняя кнопка удалена. Текст контактов — `#FFFFFF`. Hero, услуги, этапы, иллюстрации, Canvas и курсор сохранены. [Изменения](CHANGELOG.md), [проверки](TESTING.md).

## Запуск

Требуется Node.js 22+ и Google Chrome для тестов.

```powershell
Set-Location C:\Users\User\DiziTech
npm.cmd ci
npm.cmd run dev
```

Локальный адрес: **http://127.0.0.1:4173/**, русский маршрут: **http://127.0.0.1:4173/ru/**. Dev пересобирает файлы, обновление браузера — вручную. Остановка: `Ctrl+C`. На macOS/Linux используйте `npm` вместо `npm.cmd`.

```powershell
npm.cmd run build          # dist/, preview с noindex
npm.cmd run preview        # HTTP-сервер dist/ на 4173; PORT задаёт другой порт
npm.cmd test               # Chrome / Playwright, axe и проверки Canvas
npm.cmd run build:pages    # production docs/ для GitHub Pages
node scripts/check-pages.mjs
node scripts/verify-preserved.mjs
```

ES Modules требуют HTTP-сервера; `file://` не поддерживается. Старые утилиты сравнения цветов/белого текста относятся к этапам 1.3–1.4; актуальные проверки — команды выше.

## Контакты: site.config.mjs

| Поле | Назначение |
| --- | --- |
| `whatsapp` | Первый WhatsApp; используется шапкой, Hero и карточками услуг |
| `whatsappSecondary` | Необязательный второй WhatsApp; пустое значение скрывает строку |
| `phone` | Сохранённое совместимое поле телефона; отдельная дублирующая tel-строка не выводится |
| `email` | Почта, ссылка `mailto:`; пустое значение скрывает строку |
| `siteUrl` | Публичный HTTPS-адрес с завершающим `/` |
| `githubAccount` / `githubRepository` | Подтверждённый аккаунт и репозиторий GitHub Pages |

Основной номер **77753980088**, второй номер **77472831545**, почта **dizzitech@gmail.com** и адрес **https://dizzitech.github.io/** сохранены из текущего `site.config.mjs`. Контактные данные при правке оформления и порядка не изменялись. При необходимости пустое `whatsappSecondary` скрывает второй номер после пересборки.

Допустимы `+77472831545`, `77472831545`, `8 747 283 15 45`, `+7 (747) 283-15-45`. Для 11 цифр с начальной `8` меняется только первая цифра на `7`; остальные цифры сохраняются. В `wa.me` передаются только цифры. Казахстанский номер с начальной `7` должен содержать 11 цифр; остальные международные номера — 7–15. Некорректный непустой номер блокирует сборку до изменения выходных файлов.

Каждый номер получает подготовленное сообщение из существующего словаря kk/ru. Переключение языка обновляет все WhatsApp-ссылки и сохраняет выбор прежним ключом localStorage. При недоступном JS обе языковые страницы уже содержат верные ссылки и активный сегмент.

Если оба WhatsApp пусты, кнопки сохраняют доступный информационный диалог; без JS ведут к контактам. Если указан только второй номер, основные кнопки ведут к контактной области, не подменяя первый номер вторым. Отсутствующие email и сайт не создают пустых ссылок. `build:release` и `build:pages` требуют параметры хостинга; контакты остаются необязательными. Секреты и токены в публичный конфиг не помещать.

`dist/site.config.js` и `docs/site.config.js` генерируются из единственного исходного конфига. Общая нормализация номера — `src/js/contacts.js`, используется сборщиком и браузером.

## Ресурсы и сохранность

Golos Text Variable с Latin/Cyrillic/Cyrillic Extended хранится локально, SIL OFL включена. Иконки и анимация переключателя не требуют новых библиотек. WhatsApp SVG — локальная копия [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/whatsapp.svg), [CC0](public/assets/SIMPLE-ICONS-LICENSE.txt); источник и примечания — [THIRD-PARTY-NOTICES.txt](public/assets/THIRD-PARTY-NOTICES.txt). При сборке путь встраивается в HTML-sprite. Phone, Mail и Globe — оригинальные SVG проекта.

Перед правками сохранён Git-снимок `a9fa80c` в `artifacts/DiziTech-1.4-before-contacts.zip` (SHA-256 `AA32D3260478325DF77955954D3FBB7E7D9AA41EB03D61F3B3DADED92F100EA9`). Прежние архивы и `versions/1.0–1.3` сохранены. `verify-preserved.mjs` сверяет неизменные файлы, разметку основных секций и SVG с этим коммитом и проверяет, что ошибочная release-конфигурация не изменяет `docs/`.

## Сохранение и публикация

Сайт: [dizzitech.github.io](https://dizzitech.github.io/), репозиторий: [dizzitech/dizzitech.github.io](https://github.com/dizzitech/dizzitech.github.io). Корнем опубликованного сайта становится `docs/`, содержащая обе страницы, CSS, JS, шрифты, лицензии, 404, robots, sitemap и `.nojekyll`.

```powershell
Set-Location C:\Users\User\DiziTech
npm.cmd run build
npm.cmd test
npm.cmd run build:pages
node scripts/check-pages.mjs
node scripts/verify-preserved.mjs
git diff --check
git status --short
git add src scripts tests public docs reports site.config.mjs package.json package-lock.json README.md TESTING.md CHANGELOG.md
git commit -m "Polish header and add configurable WhatsApp contacts"
git push origin main
```

Push выполняет пользователь. Настройки Pages не меняются. После публикации доступна проверка без изменения сайта: `node scripts/check-pages.mjs --url https://dizzitech.github.io/` — сравнение опубликованных байтов с `docs/` и браузерные проверки. До публикации она ожидаемо видит прежнюю версию. `dist/`, `node_modules/`, `test-results/`, `versions/`, `artifacts/` игнорируются Git.
