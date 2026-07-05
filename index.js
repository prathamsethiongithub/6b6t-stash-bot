const { createBot } = require('./modules/auth');
const { navigateToWorlds } = require('./modules/navigation');
const chalk = require('chalk');

let currentBot = null;
let shouldReconnect = true;
let commandWhitelist = []; // Add your friends' usernames here

async function main() {
    const config = require('./config.json');
    commandWhitelist = config.whitelist || ['YOUR_USERNAME'];

    console.log(chalk.bold.cyan('[Bot] Avvio bot stash hunter...\n'));

    // Clean up old bot if reconnecting
    if (currentBot) {
        try {
            currentBot.removeAllListeners();
            currentBot.end();
        } catch (e) {
            // Ignore cleanup errors
        }
        currentBot = null;
    }

    try {
        // 1. Login
        const bot = await createBot(config.account, config);
        currentBot = bot;
        console.log(chalk.bold.green('[Bot] Bot connesso e loggato!\n'));

        // 2. Navigazione attraverso i portali
        console.log(chalk.bold.cyan('[Bot] Inizio navigazione portali...'));
        await navigateToWorlds(bot, config);

        // 3. Bot pronto nel mondo vanilla
        console.log(chalk.bold.green('\n[Bot] Bot nel mondo vanilla! Pronto per cacciare stash!\n'));

        // --- Eventi base ---
        bot.on('chat', (username, message) => {
            console.log(chalk.gray(`[Chat] ${username}: ${message}`));

            // Handle commands - respond via /msg to keep position hidden
            if (message === '!status') {
                if (commandWhitelist.includes(username)) {
                    const pos = bot.entity.position;
                    bot.chat(`/msg ${username} Posizione: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)} | Health: ${bot.health.toFixed(1)} | Dimensione: ${bot.game.dimension}`);
                    console.log(chalk.green(`[Bot] Inviato status a ${username} via messaggio privato.`));
                } else {
                    bot.chat(`/msg ${username} Non hai i permessi per usare questo comando.`);
                }
            }
        });

        bot.on('kicked', (reason) => {
            const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
            console.log(chalk.red(`[Bot] Kickato: ${reasonStr}`));

            // EnderDash or other verification - extract URL if present
            const match = reasonStr.match(/https?:\/\/[^\s]+/);
            if (match) {
                console.log(chalk.yellow(`[Bot] Link di verifica: ${match[0]}`));
            }
        });

        bot.on('end', () => {
            console.log(chalk.red('[Bot] Disconnesso.'));
            handleReconnect();
        });

    } catch (err) {
        console.error(chalk.red(`[Bot] Errore: ${err.message}`));
        handleReconnect();
    }
}

function handleReconnect() {
    if (!shouldReconnect) return;

    const config = require('./config.json');
    if (config.stash && config.stash.autoReconnect) {
        const delay = config.stash.reconnectDelay || 10000;
        console.log(chalk.yellow(`[Bot] Riconnessione tra ${delay / 1000}s...`));
        setTimeout(main, delay);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n[Bot] Arresto richiesto...'));
    shouldReconnect = false;
    if (currentBot) {
        currentBot.end();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    shouldReconnect = false;
    if (currentBot) {
        currentBot.end();
    }
    process.exit(0);
});

main();
