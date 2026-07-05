const chalk = require('chalk');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Controlla se siamo in una lobby/spawn island
// (sulla spawn island la difficoltà NON è 'hard')
// ============================================================
function isInLobby(bot) {
    if (!bot || !bot.game || !bot.entity) return true;
    return bot.game.difficulty !== 'hard';
}

// ============================================================
// Cammina in avanti usando waitForTicks, con void guard
// ============================================================
async function walkForwardTicks(bot, ticks) {
    const startY = bot.entity.position.y;
    bot.setControlState('forward', true);

    // Monitor Y position to avoid walking off the void
    let voidCheckInterval = setInterval(() => {
        const y = bot.entity ? bot.entity.position.y : startY;
        if (y < startY - 5) {
            bot.setControlState('forward', false);
            console.log(chalk.red('[Nav] Rilevato vuoto! Movimento fermato.'));
            clearInterval(voidCheckInterval);
            voidCheckInterval = null;
        }
    }, 200);

    await bot.waitForTicks(ticks);
    bot.setControlState('forward', false);

    if (voidCheckInterval) {
        clearInterval(voidCheckInterval);
    }
    await sleep(1000);
}

// ============================================================
// Strafe lateralmente per trovare il portale quando il bot
// non riesce a camminarci dentro dritto
// ============================================================
async function strafeIntoPortal(bot, startPos, durationMs) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let strafeDir = 'left';

        const interval = setInterval(() => {
            if (Date.now() - startTime > durationMs) {
                clearInterval(interval);
                bot.setControlState('left', false);
                bot.setControlState('right', false);
                resolve();
                return;
            }

            // Switch direction every 800ms
            if (strafeDir === 'left') {
                bot.setControlState('left', true);
                bot.setControlState('right', false);
            } else {
                bot.setControlState('left', false);
                bot.setControlState('right', true);
            }
            strafeDir = strafeDir === 'left' ? 'right' : 'left';
        }, 800);
    });
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

    const approachDist = portalCoords.approach_distance || 1;

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
// ============================================================
async function enterPortal(bot, portalCoords, walkTicks) {
    console.log(chalk.yellow('[Nav] Entrata nel portale...'));

    // First, look at the portal block so forward movement goes through it
    try {
        const dx = portalCoords.x - bot.entity.position.x;
        const dz = portalCoords.z - bot.entity.position.z;
        const yaw = Math.atan2(dx, dz);
        await bot.look(yaw, 0, false);
        console.log(chalk.gray(`[Nav] Guardando verso portale (yaw: ${yaw.toFixed(2)})`));
    } catch (e) {
        console.log(chalk.red(`[Nav] Errore nel puntare verso il portale: ${e.message}`));
    }

    const startPos = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    console.log(chalk.gray(`[Nav] Posizione iniziale: ${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}`));

    return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
            clearTimeout(timeout);
            clearInterval(posCheck);
            clearInterval(voidGuard);
            bot.removeListener('spawn', onSpawn);
            bot.setControlState('forward', false);
        };

        // Use a longer timeout for portal travel (30s should be enough)
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            console.log(chalk.yellow('[Nav] Timeout cambio dimensione dopo 30s.'));
            resolve(false);
        }, 30000);

        const onSpawn = () => {
            if (resolved) return;
            // Brief delay to let dimension/chunk load
            setTimeout(() => {
                if (!resolved && bot.entity) {
                    resolved = true;
                    cleanup();
                    console.log(chalk.green('[Nav] Cambio dimensione rilevato (evento spawn)!'));
                    resolve(true);
                }
            }, 2000);
        };

        // Note: 'end' event is handled by navigateToWorlds which will
        // reject the navigation promise. We don't register our own 'end'
        // listener here because it would race with the parent handler.

        const posCheck = setInterval(() => {
            if (resolved || !bot.entity) return;
            const dx = Math.abs(bot.entity.position.x - startPos.x);
            const dz = Math.abs(bot.entity.position.z - startPos.z);
            const dy = Math.abs(bot.entity.position.y - startPos.y);
            // Check for a significant change in position indicating teleport
            if (dx > 50 || dz > 50 || dy > 20) {
                resolved = true;
                cleanup();
                console.log(chalk.green(`[Nav] Teletrasporto rilevato! Posizione: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                resolve(true);
            }
        }, 500);

        // Void guard - stop if Y drops significantly
        const voidGuard = setInterval(() => {
            if (resolved) return;
            const y = bot.entity ? bot.entity.position.y : startPos.y;
            if (y < startPos.y - 5) {
                resolved = true;
                cleanup();
                console.log(chalk.red('[Nav] Rilevata caduta nel vuoto! Movimento fermato.'));
                resolve(false);
            }
        }, 200);

        // Register event listener before moving
        bot.once('spawn', onSpawn);

        // ------------------------------------------------------------
        // Walk INTO the portal for a short burst, then STOP and wait.
        // Minecraft requires standing INSIDE the portal block for ~4
        // seconds (Survival mode) before the teleport fires. If the bot
        // keeps walking forward, it'll pass through the 1-block-thick
        // portal and exit the other side before the timer completes.
        // ------------------------------------------------------------
        bot.setControlState('forward', true);

        // Walk forward for ~1.5 seconds to step inside the portal frame
        setTimeout(() => {
            if (!resolved) {
                bot.setControlState('forward', false);
                const curPos = bot.entity ? bot.entity.position : startPos;
                const distMoved = Math.sqrt(
                    Math.pow(curPos.x - startPos.x, 2) +
                    Math.pow(curPos.z - startPos.z, 2)
                );
                console.log(chalk.gray(`[Nav] Fermo nel portale (spostato ${distMoved.toFixed(1)}m). In attesa cambio dimensione...`));

                // If we barely moved, try to strafe into the portal
                if (distMoved < 1.5 && !resolved) {
                    console.log(chalk.yellow('[Nav] Poco movimento, provo strafe per trovare il portale...'));
                    strafeIntoPortal(bot, startPos, 3000).then(() => {
                        if (!resolved) {
                            console.log(chalk.gray('[Nav] Strafe completato, in attesa...'));
                        }
                    });
                }
            }
        }, 1500);
    });
}

// ============================================================
// Navigazione completa: spawn island -> portale -> mondo anarchy
// ============================================================
async function navigateToWorlds(bot, config) {
    const nav = config.navigation || {};
    const portalCoords = config.portal || { x: -999, y: 101, z: -989 };
    const walkTicks = portalCoords.walk_into_ticks || 60;
    const waitAfterLogin = nav.wait_after_login_ms || 5000;
    const maxAttempts = nav.max_portal_attempts || 3;

    // Per-instance state (not module-level globals)
    let isNavigating = false;
    let isDead = false;

    return new Promise((resolve, reject) => {
        const onKicked = (reason) => {
            if (!isDead) {
                isDead = true;
                console.log(chalk.red(`[Nav] Kickato: ${reason}`));
                isNavigating = false;
            }
        };

        const onEnd = () => {
            if (isNavigating && !isDead) {
                isDead = true;
                isNavigating = false;
                reject(new Error('Disconnesso durante navigazione'));
            }
        };

        bot.on('kicked', onKicked);
        bot.on('end', onEnd);

        (async () => {
            try {
                isNavigating = true;

                console.log(chalk.bold.yellow('\n[Nav] === RILEVAMENTO POSIZIONE ==='));
                console.log(chalk.gray(`[Nav] Posizione: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                console.log(chalk.gray(`[Nav] Dimensione: ${bot.game.dimension}`));
                console.log(chalk.gray(`[Nav] Difficoltà: ${bot.game.difficulty}`));

                console.log(chalk.yellow(`[Nav] Attesa ${waitAfterLogin}ms per caricamento mondo...`));
                await sleep(waitAfterLogin);

                if (isDead) throw new Error('Disconnesso');

                if (!isInLobby(bot)) {
                    console.log(chalk.green('[Nav] Difficoltà HARD - già nel mondo anarchy! Nessuna navigazione necessaria.'));
                    isNavigating = false;
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

                const dimensionChanged = await enterPortal(bot, portalCoords, walkTicks);

                if (!dimensionChanged) {
                    console.log(chalk.yellow('[Nav] Nessun cambio dimensione rilevato. Potrei già essere nel mondo anarchy o il portale non era attivo.'));
                }

                bot.clearControlStates();
                await sleep(2000);

                console.log(chalk.bold.green('\n[Nav] === NAVIGAZIONE COMPLETATA ==='));
                console.log(chalk.green(`[Nav] Posizione finale: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                console.log(chalk.green(`[Nav] Dimensione: ${bot.game.dimension}`));

                isNavigating = false;
                console.log(chalk.bold.green('\n[Nav] Bot pronto nel mondo anarchy!'));
                resolve();

            } catch (err) {
                isNavigating = false;
                console.error(chalk.red(`[Nav] Errore navigazione: ${err.message}`));
                reject(err);
            } finally {
                bot.removeListener('kicked', onKicked);
                bot.removeListener('end', onEnd);
            }
        })();
    });
}

module.exports = { navigateToWorlds };
