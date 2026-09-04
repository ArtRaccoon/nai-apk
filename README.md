# NAI Opus APK MVP

Русскоязычный Expo-клиент NovelAI Image: токен пользователя остаётся на устройстве, а небольшой сервер нужен только для учётной записи и Telegram-зеркала. Сервер использует `data.json` как простое MVP-хранилище (не подходит для многосерверного production).

## Возможности и ограничения

* Приложение вызывает `https://image.novelai.net/ai/generate-image` **напрямую** с Persistent API Token (`pst-…`) из `expo-secure-store`; токен не передаётся backend и не коммитится.
* Ответ ZIP распаковывается на устройстве библиотекой JSZip. Успешная картинка отправляется backend'у для `sendPhoto` только когда привязан Telegram.
* Профиль по умолчанию — Opus `nai-diffusion-4-5-full`, Normal 832×1216, 28 шагов, один sample, `k_dpmpp_sde`, scale 7, cfg rescale .18, Karras, quality toggle, ucPreset 3, skip CFG 58 и `params_version: 3` с v4 captions. Пустые промпты намеренно не содержат NSFW-текста.
* При выключенном (по умолчанию) **Расходовать Anlas** клиент запрещает любые размеры кроме 832×1216 и больше 28 шагов. В v1 нет img2img, vibe, upscale, NovelAI email/password либо story/text API.

## Локальный запуск

Требуется Node 20+. Скопируйте `.env.example` в `server/.env`, задайте длинный `JWT_SECRET` и Telegram token. Затем:

```bash
npm install
npm --prefix server install
npm run server
# В отдельном терминале: IP компьютера, доступный телефону
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000 npx expo start
```

Зарегистрируйтесь в приложении, затем в **Настройки** вставьте свой `pst-…` Persistent API Token. Никогда не добавляйте его в `.env`, git или backend. Эмулятор Android обычно использует `http://10.0.2.2:3000`.

## Telegram

1. В [@BotFather](https://t.me/BotFather) создайте бота командой `/newbot` и скопируйте token.
2. Задайте его только как `TELEGRAM_BOT_TOKEN` в `server/.env`, перезапустите сервер.
3. В приложении откройте **Telegram**, получите код и отправьте боту предложенную команду `/start <код>`.
4. Каждая успешная генерация загрузится в привязанный чат с коротким prompt, seed, моделью и размером.

Для MVP бот использует long polling: запускайте лишь один экземпляр backend'а с конкретным токеном.

## APK через EAS

```bash
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```

Профиль `preview` в `eas.json` задаёт `android.buildType: apk`, поэтому результат можно установить напрямую. Интерфейс применяет гибкую прокручиваемую раскладку и боковую навигацию на планшетах.
