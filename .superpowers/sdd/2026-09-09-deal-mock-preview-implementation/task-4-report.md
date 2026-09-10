# Task 4 — Revision-safe deal search

## Изменения

- Добавлены `DealSearchState` и reducer с ревизиями, явными состояниями
  результата и неизменяемыми исключениями только для ID текущей выдачи.
- Добавлен `useDealSearch(adapter)`: поиск запускается только явной командой,
  поздние ответы старой ревизии игнорируются, отклонение адаптера становится
  `failure/unexpected`.
- Cleanup жизненного цикла hook не позволяет асинхронному ответу после
  размонтирования или development-перемонтирования принять результат.
- Добавлены reducer- и hook-тесты для ревизий, переключения ID, неизвестного
  ID, отсутствия автопоиска, rejection и размонтирования.

## TDD и проверки

- RED: `npm test -- src/deals/state` — ожидаемо упал: отсутствовали
  `./searchState` и `./useDealSearch`.
- GREEN: `npm test -- src/deals/state src/deals/domain src/deals/data` —
  5 файлов, 26 тестов прошли.
- `npm run typecheck` — прошёл.
- `npm run lint` — прошёл.
- `npm run format:check` — остаётся красным из-за девяти ранее существовавших
  неотформатированных документов вне Task 4; новые файлы отформатированы.

## Commit

`feat: ignore stale deal search responses`
