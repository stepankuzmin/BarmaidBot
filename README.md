# Barmaid Bot

Live at [t.me/BarmaidBot](https://t.me/BarmaidBot).

Barmaid is a telegram bot that will help you find the nearest bar.

## Setup

```shell
git clone https://github.com/stepankuzmin/BarmaidBot.git
cd BarmaidBot
```

Create and populate `up.json`

```shell
cp example.up.json up.json
```

Deploy using [apex/up](https://github.com/apex/up).

```shell
up
```

Register your bot with

```shell
curl -F "url=$(up url)" https://api.telegram.org/bot<TELEGRAM_API_TOKEN>/setWebhook
```
