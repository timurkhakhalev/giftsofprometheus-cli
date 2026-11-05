<p align="center">
  <a href="https://giftsofprometheus.com"><img alt="Дары Прометея: мировые знания об ИИ на русском" src=".github/assets/banner.jpg" width="100%"></a>
</p>

# CLI «Даров Прометея»

Ищите доклады AI-конференций, читайте их транскрипты и сохраняйте избранное на [giftsofprometheus.com](https://giftsofprometheus.com) из терминала или через AI-агента.

<p>
  <a href="https://github.com/timurkhakhalev/giftsofprometheus-cli/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/timurkhakhalev/giftsofprometheus-cli/ci.yml?branch=main&amp;style=for-the-badge&amp;labelColor=0a0f1c&amp;color=173a63&amp;label=CI" height="28"></a>
  <a href="LICENSE"><img alt="Лицензия: Apache-2.0" src="https://img.shields.io/github/license/timurkhakhalev/giftsofprometheus-cli.svg?style=for-the-badge&amp;labelColor=0a0f1c&amp;color=173a63" height="28"></a>
  <a href="https://giftsofprometheus.com"><img alt="giftsofprometheus.com" src="https://img.shields.io/badge/каталог-giftsofprometheus.com-173a63.svg?style=for-the-badge&amp;labelColor=0a0f1c" height="28"></a>
</p>

«Дары Прометея» собирают доклады AI-конференций (AI Engineer, BAAI, 云栖 и других) и дают каждому русское название и описание. Сайт — чтобы читать. CLI отдаёт тот же каталог вашему агенту: он подбирает доклады под задачу, читает полные транскрипты и сохраняет то, что вы попросите, в тот же аккаунт, что и на сайте.

## Установка

Нужен Node.js 22.12 или новее.

```bash
npm install -g https://github.com/timurkhakhalev/giftsofprometheus-cli/releases/download/v0.1.1/giftsofprometheus-cli-0.1.1.tgz
giftsofprometheus doctor
```

Пакет `@giftsofprometheus/cli` скоро появится в npm. Пока его нет, ставьте сборку из [последнего релиза](https://github.com/timurkhakhalev/giftsofprometheus-cli/releases/latest), как выше.

## Быстрый старт

```bash
giftsofprometheus talks search 'оценка агентов'    # без аккаунта
giftsofprometheus talks get <slug>                  # описание, спикеры, темы, ссылка на видео

giftsofprometheus login                             # откроет браузер, подтвердите там код
giftsofprometheus talks content <slug>              # полный транскрипт
giftsofprometheus favorites add <slug>              # появится в избранном на сайте
giftsofprometheus feed                              # подборка по вашим интересам
```

`login` подключает устройство через подтверждение в браузере, токены копировать не нужно. Сессия живёт 30 дней и хранится в `$XDG_CONFIG_HOME/giftsofprometheus/credentials.json` (по умолчанию `~/.config/giftsofprometheus/`), читать её можете только вы. В кабинете на сайте видны все подключённые устройства, любое можно отключить. `giftsofprometheus logout` отключает текущее.

## Для AI-агентов

В репозитории есть skill: он объясняет агенту, когда и как пользоваться CLI. Поставить его в Claude Code, Codex, Cursor и других агентов можно через [skills](https://skills.sh):

```bash
npx skills add timurkhakhalev/giftsofprometheus-cli
```

В Claude Code его можно поставить и как плагин:

```text
/plugin marketplace add timurkhakhalev/giftsofprometheus-cli
/plugin install giftsofprometheus@giftsofprometheus
```

Или добавьте строку в свой `AGENTS.md`:

```markdown
Для поиска докладов AI-конференций и их транскриптов используй `giftsofprometheus`. Перед первым использованием выполни `giftsofprometheus skill` и следуй инструкции.
```

`giftsofprometheus skill` печатает skill той же версии, что и установленный CLI, а `giftsofprometheus skill --path` — путь к его папке, чтобы сделать ссылку.

По инструкции skill агент меняет избранное и интересы только по вашей просьбе. Поиск и чтение ничего не сохраняют, не лайкают и не скрывают.

## Команды

С флагом `--json` любая команда печатает компактный JSON. Ошибка тогда выглядит как `{"error":{"message","status"}}`, а код выхода — 1.

| Команда | Что делает | Аккаунт |
|---|---|---|
| `talks search <запрос> [--page n]` | Поиск опубликованных докладов по названию, описанию, спикеру и теме | |
| `talks list [--page n]` | Каталог по страницам | |
| `talks get <slug-или-id>` | Доклад с описанием, спикерами, темами и видео | |
| `talks content <slug-или-id>` | Полный транскрипт на языке доклада | ✓ |
| `favorites list [--page n] [--limit n]` | Ваше избранное | ✓ |
| `favorites add <slug-или-id>` / `remove` | Добавить в избранное или убрать | ✓ |
| `profile get` | Ваши интересы и текущая задача | ✓ |
| `profile update --file <json>` | Заменить их содержимым JSON-файла | ✓ |
| `feed` | Подборка по вашему профилю | ✓ |
| `request <путь>` | GET-запрос только на чтение к `/api/knowledge/…` или `/api/account/…` | ✓ |
| `login`, `logout`, `whoami`, `doctor` | Вход, выход, текущий аккаунт, проверка настройки | |
| `skill [--path]` | Skill для агента | |

## Настройки

| Переменная | По умолчанию | |
|---|---|---|
| `GIFTSOFPROMETHEUS_URL` | `https://giftsofprometheus.com` | Адрес сервиса. HTTP без TLS разрешён только для `localhost` |
| `XDG_CONFIG_HOME` | `~/.config` | Где хранится сессия |

## Разработка

```bash
pnpm install
pnpm check      # линтер, форматирование, типы, сборка и тесты
node dist/index.js --help
```

Устройство репозитория и что обновлять при каждом изменении — в [AGENTS.md](AGENTS.md).

## Участие

Об ошибках пишите в [Issues](https://github.com/timurkhakhalev/giftsofprometheus-cli/issues), идеи и вопросы — в [Discussions](https://github.com/timurkhakhalev/giftsofprometheus-cli/discussions). Pull requests репозиторий не принимает, подробнее в [CONTRIBUTING.md](CONTRIBUTING.md). Об уязвимостях сообщайте приватно, как описано в [SECURITY.md](SECURITY.md).

## Лицензия

[Apache-2.0](LICENSE)
