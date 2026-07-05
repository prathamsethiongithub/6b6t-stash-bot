# 6b6t Stash Bot

A Minecraft bot that connects to the 6b6t anarchy server, navigates through the spawn portal, and hunts for stashes in the vanilla world.

## Features

- Automatic login and authentication (supports both offline and premium accounts)
- Portal navigation — walks from spawn island through the nether portal to the anarchy world
- Auto-reconnect on disconnect or kick
- Chat commands (`!status` to check position, health, and dimension)
- Built with mineflayer for reliable Minecraft bot control

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A Minecraft account (offline/cracked or premium)

## Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/6b6t-stash-bot.git
cd 6b6t-stash-bot

# Install dependencies
npm install
```

## Configuration

Edit `config.json` to set up your bot:

```json
{
  "account": {
    "username": "YOUR_BOT_USERNAME",
    "password": ""
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
  }
}
```

### Config Options

| Field | Description |
|-------|-------------|
| `account.username` | Your bot's Minecraft username |
| `account.password` | Leave empty for offline mode, or set your password if the server requires login |
| `server.host` | Minecraft server IP |
| `server.auth` | `"offline"` for cracked servers, `"microsoft"` for premium accounts |
| `portal.x/y/z` | Coordinates of the portal to navigate to |
| `stash.autoReconnect` | Whether to auto-reconnect on disconnect |

## Usage

```bash
npm start
```

The bot will:
1. Connect to the server
2. Wait for the world to load
3. Automatically navigate to the portal and enter the anarchy world
4. Stay online and respond to the `!status` command in chat

### Chat Commands

- `!status` — Shows the bot's current position, health, and dimension

## Project Structure

```
6b6t-stash-bot/
├── index.js           # Main entry point
├── config.json        # Bot configuration
├── package.json       # Dependencies and scripts
├── modules/
│   ├── auth.js        # Authentication and login handler
│   └── navigation.js  # Portal navigation and pathfinding
└── README.md          # This file
```

## Dependencies

- [mineflayer](https://github.com/PrismarineJS/mineflayer) — Minecraft bot library
- [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) — Pathfinding for bot navigation
- [chalk](https://github.com/chalk/chalk) — Terminal styling

## License

MIT
