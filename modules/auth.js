const mineflayer = require('mineflayer');
const chalk = require('chalk');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createBot(account, config) {
    return new Promise((resolve, reject) => {
        const serverConfig = config.server;

        const bot = mineflayer.createBot({
            host: serverConfig.host,
            port: serverConfig.port,
            username: account.username,
            auth: serverConfig.auth || 'offline',
            version: serverConfig.version || false,
            checkTimeoutInterval: 60000
        });

        let loginConfirmed = false;
        let isDead = false;
        let kickReason = null;
        let triedRegister = false;

        bot.on('spawn', () => {
            if (isDead || loginConfirmed) return;
            console.log(chalk.cyan('[Auth] Spawn nella stanza di login.'));

            const password = account.password ? account.password.trim() : '';

            if (!password) {
                console.log(chalk.yellow('[Auth] Nessuna password configurata, salto registrazione/login.'));
                loginConfirmed = true;
                resolve(bot);
                return;
            }

            if (!triedRegister) {
                triedRegister = true;
                console.log(chalk.cyan('[Auth] Tentativo /register...'));
                bot.chat(`/register ${password}`);
                sleep(2000).then(() => {
                    if (!loginConfirmed && !isDead) {
                        console.log(chalk.cyan('[Auth] Tentativo /login...'));
                        bot.chat(`/login ${password}`);
                    }
                });
            } else {
                console.log(chalk.cyan('[Auth] Tentativo /login...'));
                bot.chat(`/login ${password}`);
            }
        });

        bot.on('messagestr', (message) => {
            if (isDead) return;
            console.log(chalk.gray(`[Auth] MSG: "${message}"`));

            if (!loginConfirmed) {
                const msg = message.toLowerCase();
                if (msg.includes('logged in') ||
                    msg.includes('login successful') ||
                    msg.includes('you are now logged in') ||
                    msg.includes('please enter the server') ||
                    msg.includes('successfully registered')) {
                    loginConfirmed = true;
                    console.log(chalk.green('[Auth] Login confermato!'));
                    resolve(bot);
                }
            }
        });

        bot.on('error', (err) => {
            console.error(chalk.red(`[Auth] Errore: ${err.message}`));
        });

        bot.on('kicked', (reason) => {
            if (isDead) return;
            isDead = true;
            kickReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
            console.log(chalk.red(`[Auth] Kickato: ${kickReason}`));
        });

        bot.on('end', () => {
            console.log(chalk.red('[Auth] Disconnesso.'));
            if (!loginConfirmed) {
                reject(new Error(kickReason || 'Disconnesso prima del login'));
            }
        });

        setTimeout(() => {
            if (!bot.entity && !isDead) {
                reject(new Error('Timeout di connessione'));
            }
        }, 30000);
    });
}

module.exports = { createBot };
