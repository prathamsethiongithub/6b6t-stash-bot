# 6b6t Stash Bot

A Minecraft bot that connects to the 6b6t anarchy server, navigates through the spawn portal, and hunts for stashes in the vanilla world.

## Features

- **Automatic registration/login** — 6b6t requires `/register` + `/login` even for offline mode; the bot handles it automatically
- **Portal navigation** — walks from spawn island through the nether portal to the anarchy world
- **Auto-reconnect** — reconnects on disconnect or kick, cleans up old bot listeners properly
- **Private commands** — `!status` replies via `/msg` to keep your position hidden from other players
- **Void guard** — stops movement if the bot starts falling into the void
- **EnderDash detection** — logs verification URLs when EnderDash is triggered
- **Graceful shutdown** — press Ctrl+C to cleanly stop the bot

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A Minecraft account (offline/cracked or premium)

## Installation

```bash
# Clone the repo
git clone https://github.com/prathamsethiongithub/6b6t-stash-bot.git
cd 6b6t-stash-bot

# Install dependencies
npm install
```

## Configuration

1. Copy the example config:

```bash
cp config.example.json config.json
```

2. Edit `config.json` with your bot's settings:

```json
{
  "account": {
    "username": "YOUR_BOT_USERNAME",
    "password": "YOUR_PASSWORD"
  },
  "server": {
    "host": "play.6b6t.org",
    "port": 25565,
    "auth": "offline",
    "version": "1.21.1"
  },
  "portal": {
    "x": -999,
    "y": 101,
    "z": -989,
    "approach_distance": 3,
    "walk_into_ticks": 30
  },
  "navigation": {
    "wait_after_login_ms": 5000,
    "wait_between_worlds_ms": 4000,
    "max_portal_attempts": 3
  },
  "stash": {
    "exploreRadius": 256,
    "checkDelay": 500,
    "autoReconnect": true,
    "reconnectDelay": 10000
  },
  "whitelist": ["YOUR_USERNAME"]
}
```

> ⚠️ **Security note:** `config.json` is gitignored so your password won't be committed. Use `config.example.json` as the template.

### Config Options

| Field | Description |
|-------|-------------|
| `account.username` | Your bot's Minecraft username |
| `account.password` | Password for `/register` and `/login`. If empty, one is auto-generated |
| `server.host` | Minecraft server IP |
| `server.auth` | `"offline"` for cracked servers, `"microsoft"` for premium accounts |
| `portal.x/y/z` | Coordinates of the portal to navigate to |
| `stash.autoReconnect` | Whether to auto-reconnect on disconnect |
| `whitelist` | List of usernames allowed to use bot commands |

## Usage

```bash
npm start
```

The bot will:
1. Connect to the server
2. Automatically register/login
3. Navigate from spawn island through the portal to the anarchy world
4. Stay online and respond to commands via private message

### Commands

- `!status` — The bot replies with its position, health, and dimension via `/msg` (whitelist-only)

## Project Structure

```
6b6t-stash-bot/
├── index.js              # Main entry point
├── config.json           # Your bot configuration (gitignored)
├── config.example.json   # Example config template
├── package.json          # Dependencies and scripts
├── modules/
│   ├── auth.js           # Authentication and login handler
│   └── navigation.js     # Portal navigation and pathfinding
└── README.md             # This file
```

## Dependencies

- [mineflayer](https://github.com/PrismarineJS/mineflayer) — Minecraft bot library
- [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) — Pathfinding for bot navigation
- [chalk](https://github.com/chalk/chalk) — Terminal styling

## License

MIT
