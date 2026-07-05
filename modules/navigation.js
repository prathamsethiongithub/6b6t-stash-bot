const chalk = require('chalk');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let navigating = false;
let isDead = false;

// ============================================================
// Controlla se siamo in una lobby/spawn island
// (sulla spawn island la difficoltà NON è 'hard')
// ============================================================
function isInLobby(bot) {
    if (!bot || !bot.game || !bot.entity) return true;
    return bot.game.difficulty !== 'hard';
}

// ============================================================
// Cammina in avanti usando waitForTicks
// ============================================================
async function walkForwardTicks(bot, ticks) {
    bot.setControlState('forward', true);
    await bot.waitForTicks(ticks);
    bot.setControlState('forward', false);
    await sleep(1000);
}

// ============================================================
// Navigazione verso il portale usando mineflayer-pathfinder
// ============================================================
async function navigateToPortal(bot, portalCoords) {
    if (!bot.pathfinder) {
        bot.loadPlugin(pathfinder);
    }

    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allowParkour = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);

    const approachDist = portalCoords.approach_distance || 3;

    console.log(chalk.yellow(`[Nav] Pathfinding verso portale (${portalCoords.x}, ${portalCoords.y}, ${portalCoords.z})...`));

    try {
        await bot.pathfinder.goto(new goals.GoalNear(portalCoords.x, portalCoords.y, portalCoords.z, approachDist));
        console.log(chalk.green('[Nav] Raggiunta prossimità del portale!'));
        return true;
    } catch (err) {
        console.log(chalk.red(`[Nav] Pathfinding fallito: ${err.message}`));
        return false;
    }
}

// ============================================================
// Entra fisicamente nel portale camminando in avanti
// Tutti i listener vengono registrati PRIMA di iniziare il movimento
// per evitare race condition con l'evento spawn
// ============================================================
async function enterPortal(bot, walkTicks) {
    console.log(chalk.yellow('[Nav] Entrata nel portale...'));

    const startPos = { x: bot.entity.position.x, z: bot.entity.position.z };

    return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
            clearTimeout(timeout);
            clearInterval(posCheck);
            bot.removeListener('spawn', onSpawn);
            bot.setControlState('forward', false);
        };

        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            console.log(chalk.yellow('[Nav] Timeout cambio dimensione. Verifico posizione...'));
            resolve(false);
        }, 10000);

        const onSpawn = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            console.log(chalk.green('[Nav] Cambio dimensione rilevato (evento spawn)!'));
            resolve(true);
        };

        const posCheck = setInterval(() => {
            if (resolved) return;
            const dx = Math.abs(bot.entity.position.x - startPos.x);
            const dz = Math.abs(bot.entity.position.z - startPos.z);
            if (dx > 50 || dz > 50) {
                resolved = true;
                cleanup();
                console.log(chalk.green('[Nav] Teletrasporto rilevato!'));
                resolve(true);
            }
        }, 500);

        // REGISTRA LISTENER PRIMA di iniziare il movimento
        bot.once('spawn', onSpawn);

        // Ora inizia il movimento
        bot.setControlState('forward', true);

        // Se walkTicks è specificato, ferma dopo N tick (~50ms per tick)
        if (walkTicks && walkTicks > 0) {
            setTimeout(() => {
                if (!resolved) {
                    // Non fermare il movimento, ma segnala che abbiamo camminato abbastanza
                    // Il bot continuerà ad avanzare fino al timeout o cambio dimensione
                    console.log(chalk.gray(`[Nav] Camminato per ${walkTicks} tick, in attesa cambio dimensione...`));
                }
            }, walkTicks * 50);
        }
    });
}

// ============================================================
// Navigazione completa: spawn island -> portale -> mondo anarchy
// ============================================================
async function navigateToWorlds(bot, config) {
    const nav = config.navigation || {};
    const portalCoords = config.portal || { x: -999, y: 101, z: -989 };
    const walkTicks = portalCoords.walk_into_ticks || 30;
    const waitAfterLogin = nav.wait_after_login_ms || 5000;
    const maxAttempts = nav.max_portal_attempts || 3;

    isDead = false;
    navigating = true;

    return new Promise((resolve, reject) => {
        const onKicked = (reason) => {
            if (!isDead) {
                isDead = true;
                console.log(chalk.red(`[Nav] Kickato: ${reason}`));
            }
        };

        const onEnd = () => {
            if (navigating && !isDead) {
                isDead = true;
                reject(new Error('Disconnesso durante navigazione'));
            }
        };

        bot.on('kicked', onKicked);
        bot.on('end', onEnd);

        (async () => {
            try {
                console.log(chalk.bold.yellow('\n[Nav] === RILEVAMENTO POSIZIONE ==='));
                console.log(chalk.gray(`[Nav] Posizione: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                console.log(chalk.gray(`[Nav] Dimensione: ${bot.game.dimension}`));
                console.log(chalk.gray(`[Nav] Difficoltà: ${bot.game.difficulty}`));

                console.log(chalk.yellow(`[Nav] Attesa ${waitAfterLogin}ms per caricamento mondo...`));
                await sleep(waitAfterLogin);

                if (isDead) throw new Error('Disconnesso');

                if (!isInLobby(bot)) {
                    console.log(chalk.green('[Nav] Difficoltà HARD - già nel mondo anarchy! Nessuna navigazione necessaria.'));
                    navigating = false;
                    resolve();
                    return;
                }

                console.log(chalk.yellow('[Nav] Rilevata spawn island (difficoltà non-HARD). Navigazione verso il portale...'));
                console.log(chalk.yellow(`[Nav] Coordinate portale: ${portalCoords.x}, ${portalCoords.y}, ${portalCoords.z}`));

                let reachedPortal = false;
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    if (isDead) throw new Error('Disconnesso');

                    console.log(chalk.bold.yellow(`\n[Nav] Tentativo ${attempt}/${maxAttempts}: navigazione verso portale...`));

                    reachedPortal = await navigateToPortal(bot, portalCoords);

                    if (reachedPortal) break;

                    if (attempt < maxAttempts) {
                        console.log(chalk.yellow('[Nav] Attesa 5s prima del prossimo tentativo...'));
                        await sleep(5000);
                    }
                }

                if (!reachedPortal) {
                    console.log(chalk.yellow('[Nav] Pathfinding fallito. Tentativo movimento manuale...'));

                    try {
                        const dx = portalCoords.x - bot.entity.position.x;
                        const dz = portalCoords.z - bot.entity.position.z;
                        const yaw = Math.atan2(dx, dz);
                        await bot.look(yaw, 0, false);
                    } catch (e) {}
                    await sleep(500);

                    console.log(chalk.yellow('[Nav] Movimento manuale verso presunta direzione del portale...'));
                    await walkForwardTicks(bot, walkTicks);
                }

                if (isDead) throw new Error('Disconnesso');

                const dimensionChanged = await enterPortal(bot, walkTicks);

                if (!dimensionChanged) {
                    console.log(chalk.yellow('[Nav] Nessun cambio dimensione rilevato. Potrei già essere nel mondo anarchy.'));
                }

                bot.clearControlStates();
                await sleep(2000);

                console.log(chalk.bold.green('\n[Nav] === NAVIGAZIONE COMPLETATA ==='));
                console.log(chalk.green(`[Nav] Posizione finale: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                console.log(chalk.green(`[Nav] Dimensione: ${bot.game.dimension}`));

                navigating = false;
                console.log(chalk.bold.green('\n[Nav] Bot pronto nel mondo anarchy!'));
                resolve();

            } catch (err) {
                navigating = false;
                console.error(chalk.red(`[Nav] Errore navigazione: ${err.message}`));
                reject(err);
            } finally {
                bot.removeListener('kicked', onKicked);
                bot.removeListener('end', onEnd);
            }
        })();
    });
}

function getNavigationState() {
    return {
        navigating: navigating,
        isDead: isDead
    };
}

module.exports = { navigateToWorlds, isInLobby, getNavigationState };
