const { createBot } = require('./modules/auth');
const { navigateToWorlds } = require('./modules/navigation');
const config = require('./config.json');
const chalk = require('chalk');

async function main() {
    console.log(chalk.bold.cyan('[ArtemideOss] Avvio bot stash hunter...\n'));

    try {
        // 1. Login
        const bot = await createBot(config.account, config);
        console.log(chalk.bold.green('[ArtemideOss] Bot connesso e loggato!\n'));

        // 2. Navigazione attraverso i portali
        console.log(chalk.bold.cyan('[ArtemideOss] Inizio navigazione portali...'));
        await navigateToWorlds(bot, config);

        // 3. Bot pronto nel mondo vanilla
        console.log(chalk.bold.green('\n[ArtemideOss] Bot nel mondo vanilla! Pronto per cacciare stash!\n'));

        // --- Eventi base ---
        bot.on('chat', (username, message) => {
            console.log(chalk.gray(`[Chat] ${username}: ${message}`));
        });

        bot.on('kicked', (reason) => {
            console.log(chalk.red(`[Bot] Kickato: ${reason}`));
        });

        bot.on('end', () => {
            console.log(chalk.red('[Bot] Disconnesso.'));
        });

        // --- Comandi chat ---
        setupCommands(bot);

    } catch (err) {
        console.error(chalk.red(`[ArtemideOss] Errore: ${err.message}`));

        // Auto-reconnect
        if (config.stash && config.stash.autoReconnect) {
            const delay = config.stash.reconnectDelay || 10000;
            console.log(chalk.yellow(`[ArtemideOss] Riconnessione tra ${delay / 1000}s...`));
            setTimeout(main, delay);
        }
    }
}

function setupCommands(bot) {
    bot.on('chat', (username, message) => {
        if (message === '!status') {
            bot.chat(`Posizione: ${bot.entity.position.x.toFixed(0)}, ${bot.entity.position.y.toFixed(0)}, ${bot.entity.position.z.toFixed(0)} | Health: ${bot.health.toFixed(1)} | Dimensione: ${bot.game.dimension}`);
        }
    });
}

main();
