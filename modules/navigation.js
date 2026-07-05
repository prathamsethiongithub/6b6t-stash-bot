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
async function strafeIntoPortal(bot, startPos, durationMs, cancelRef) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let strafeDir = 'left';

        const interval = setInterval(() => {
            // Stop immediately if enterPortal has resolved
            if (cancelRef && cancelRef.cancelled) {
                clearInterval(interval);
                bot.setControlState('left', false);
                bot.setControlState('right', false);
                resolve();
                return;
            }

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
// Trova il portale più vicino (nether_portal o end_portal)
// ============================================================
async function findPortalBlock(bot, maxDistance) {
    if (!bot.findBlock) return null;

    const portalBlock = bot.findBlock({
        matching: (block) => block.name === 'nether_portal' || block.name === 'end_portal',
        maxDistance: maxDistance || 100
    });

    if (portalBlock) {
        console.log(chalk.green(`[Nav] Trovato portale nelle vicinanze: ${portalBlock.name} a (${portalBlock.position.x}, ${portalBlock.position.y}, ${portalBlock.position.z})`));
        return portalBlock;
    }

    console.log(chalk.yellow(`[Nav] Nessun portale trovato nel raggio di ${maxDistance || 100} blocchi.`));
    return null;
}

// ============================================================
// Navigazione verso coordinate usando mineflayer-pathfinder
// ============================================================
async function navigateToCoords(bot, x, y, z, approachDist) {
    if (!bot.pathfinder) {
        bot.loadPlugin(pathfinder);
    }

    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allowParkour = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);

    const dist = approachDist || 1;

    console.log(chalk.yellow(`[Nav] Pathfinding verso (${x}, ${y}, ${z})...`));

    try {
        await bot.pathfinder.goto(new goals.GoalNear(x, y, z, dist));
        console.log(chalk.green(`[Nav] Raggiunta destinazione!`));
        return true;
    } catch (err) {
        console.log(chalk.red(`[Nav] Pathfinding fallito: ${err.message}`));
        return false;
    }
}

// ============================================================
// Entra fisicamente nel portale camminando in avanti
// ============================================================
async function enterPortal(bot, portalCoords) {
    console.log(chalk.yellow('[Nav] Entrata nel portale...'));

    // First, look at the portal block so forward movement goes through it
    try {
        const dx = portalCoords.x - bot.entity.position.x;
        const dz = portalCoords.z - bot.entity.position.z;
        const yaw = Math.atan2(-dx, dz);
        await bot.look(yaw, 0, false);
        console.log(chalk.gray(`[Nav] Guardando verso portale (yaw: ${yaw.toFixed(2)})`));
    } catch (e) {
        console.log(chalk.red(`[Nav] Errore nel puntare verso il portale: ${e.message}`));
    }

    const startPos = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    console.log(chalk.gray(`[Nav] Posizione iniziale: ${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}`));

    return new Promise((resolve) => {
        let resolved = false;

        let cleanup = () => {
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
                    const cancelRef = { cancelled: false };
                    // Cancel strafe when enterPortal resolves
                    const origCleanup = cleanup;
                    cleanup = () => {
                        cancelRef.cancelled = true;
                        origCleanup();
                    };
                    strafeIntoPortal(bot, startPos, 3000, cancelRef).then(() => {
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
// Trova e naviga verso un portale (nether o end) nelle
// vicinanze. Se non trova nulla, usa le coordinate config.
// ============================================================
async function findAndGoToPortal(bot, portalCoords, maxAttempts, walkTicks) {
    console.log(chalk.yellow('[Nav] Cerco un portale nelle vicinanze...'));

    // Try to find a portal block dynamically
    const foundPortal = await findPortalBlock(bot, 100);

    let targetCoords;
    let foundDynamically = false;

    if (foundPortal) {
        targetCoords = {
            x: foundPortal.position.x,
            y: foundPortal.position.y,
            z: foundPortal.position.z
        };
        foundDynamically = true;
        console.log(chalk.green(`[Nav] Usando portale trovato in posizione!`));
    } else {
        targetCoords = portalCoords;
        console.log(chalk.yellow(`[Nav] Nessun portale trovato, uso coordinate configurate: (${portalCoords.x}, ${portalCoords.y}, ${portalCoords.z})`));
    }

    // Navigate to the portal
    let reachedPortal = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(chalk.bold.yellow(`\n[Nav] Tentativo ${attempt}/${maxAttempts}: navigazione verso portale...`));

        reachedPortal = await navigateToCoords(bot, targetCoords.x, targetCoords.y, targetCoords.z,
            foundDynamically ? 2 : (portalCoords.approach_distance || 1));

        if (reachedPortal) break;

        if (attempt < maxAttempts) {
            console.log(chalk.yellow('[Nav] Attesa 5s prima del prossimo tentativo...'));
            await sleep(5000);
        }
    }

    // If pathfinding failed and we have configured coords we haven't tried, try those too
    if (!reachedPortal && !foundDynamically) {
        console.log(chalk.yellow('[Nav] Pathfinding fallito. Tentativo movimento manuale...'));

        try {
            const dx = portalCoords.x - bot.entity.position.x;
            const dz = portalCoords.z - bot.entity.position.z;            const yaw = Math.atan2(-dx, dz);
                        await bot.look(yaw, 0, false);
                    } catch (e) {}
                    await sleep(500);

                    console.log(chalk.yellow('[Nav] Movimento manuale verso presunta direzione del portale...'));
                    await walkForwardTicks(bot, walkTicks);
    }

    if (!reachedPortal) {
        console.log(chalk.yellow('[Nav] Non sono riuscito a raggiungere il portale. Provo comunque entrata...'));
    }

    // Enter the portal
    const entered = await enterPortal(bot, targetCoords);

    if (!entered) {
        console.log(chalk.yellow('[Nav] Il portale non ha funzionato. Potrebbe non essere attivo.'));
    }

    return entered;
}

// ============================================================
// Navigazione completa attraverso le dimensioni
// The End (spawn) -> Overworld (portale nether) -> Nether
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

                // If already in hard difficulty (anarchy world), no navigation needed
                if (!isInLobby(bot)) {
                    console.log(chalk.green('[Nav] Difficoltà HARD - già nel mondo anarchy! Nessuna navigazione necessaria.'));
                    isNavigating = false;
                    resolve();
                    return;
                }

                // Log which kind of spawn island we're on
                const dimension = bot.game.dimension;
                console.log(chalk.yellow(`[Nav] Rilevata spawn island in dimensione: ${dimension}`));

                // ============================================================
                // STAGE 1: If in The End, find the exit portal back to Overworld
                // ============================================================
                if (dimension === 'the_end') {
                    console.log(chalk.bold.yellow('\n[Nav] === STAGE 1: USCITA DAL THE END ==='));
                    console.log(chalk.yellow('[Nav] Siamo nel The End! Cerco il portale di uscita...'));

                    // First try to find an end portal block (exit portal)
                    const endPortal = await findPortalBlock(bot, 256);

                    if (endPortal) {
                        console.log(chalk.green(`[Nav] Trovato portale di uscita del The End!`));
                        const portalPos = {
                            x: endPortal.position.x,
                            y: endPortal.position.y,
                            z: endPortal.position.z
                        };

                        const reached = await navigateToCoords(bot, portalPos.x, portalPos.y, portalPos.z, 1);
                        if (reached) {
                            const changed = await enterPortal(bot, portalPos);
                            if (changed) {
                                console.log(chalk.green('[Nav] Usciti dal The End!'));
                                await sleep(3000);

                                // Check new dimension
                                console.log(chalk.gray(`[Nav] Nuova dimensione: ${bot.game.dimension}`));
                                console.log(chalk.gray(`[Nav] Nuova posizione: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));

                                // If still in the_end, end portal didn't work - try configured coords
                                if (bot.game.dimension === 'the_end') {
                                    console.log(chalk.yellow('[Nav] Ancora nel The End! Provo le coordinate configurate...'));
                                } else {
                                    // We're now in the Overworld - proceed to Stage 2
                                    console.log(chalk.green('[Nav] Successo! Ora nell\'Overworld.'));
                                }
                            } else {
                                console.log(chalk.yellow('[Nav] Portale di uscita non funzionante. Provo coordinate configurate...'));
                            }
                        } else {
                            console.log(chalk.yellow('[Nav] Impossibile raggiungere il portale di uscita. Provo coordinate configurate...'));
                        }
                    } else {
                        console.log(chalk.yellow('[Nav] Nessun portale di uscita trovato nel The End. Provo le coordinate configurate...'));
                    }

                    // Fallback: try configured coordinates (might be a player-built portal in The End)
                    if (bot.game.dimension === 'the_end') {
                        console.log(chalk.bold.yellow('\n[Nav] Tentativo con coordinate configurate nel The End...'));
                        await findAndGoToPortal(bot, portalCoords, maxAttempts, walkTicks);
                        await sleep(3000);

                        if (bot.game.dimension !== 'the_end') {
                            console.log(chalk.green('[Nav] Dimensione cambiata!'));
                            console.log(chalk.gray(`[Nav] Nuova dimensione: ${bot.game.dimension}`));
                        }
                    }
                }

                // ============================================================
                // STAGE 2: If in Overworld, find the nether portal
                // ============================================================
                if (bot.game.dimension === 'overworld') {
                    console.log(chalk.bold.yellow('\n[Nav] === STAGE 2: OVERWORLD -> NETHER ==='));
                    console.log(chalk.yellow(`[Nav] Cerco il portale per il Nether verso (${portalCoords.x}, ${portalCoords.y}, ${portalCoords.z})...`));

                    await findAndGoToPortal(bot, portalCoords, maxAttempts, walkTicks);
                    await sleep(3000);
                }

                // ============================================================
                // STAGE 3: If in Nether, we're done! (or check if we need to go further)
                // ============================================================
                console.log(chalk.bold.yellow('\n[Nav] === VERIFICA FINALE ==='));
                console.log(chalk.gray(`[Nav] Posizione finale: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`));
                console.log(chalk.gray(`[Nav] Dimensione: ${bot.game.dimension}`));

                if (bot.game.dimension === 'the_end') {
                    console.log(chalk.red('[Nav] Ancora nel The End! La navigazione non è riuscita.'));
                    console.log(chalk.yellow('[Nav] Il server potrebbe richiedere una verifica EnderDash per uscire dal The End.'));
                } else if (bot.game.dimension === 'overworld') {
                    console.log(chalk.yellow('[Nav] Nell\'Overworld ma non nel Nether. Il portale potrebbe non essere attivo.'));
                } else if (bot.game.dimension === 'nether') {
                    console.log(chalk.green('[Nav] Nel Nether! Navigazione completata con successo!'));
                }

                bot.clearControlStates();
                await sleep(2000);

                isNavigating = false;
                console.log(chalk.bold.green('\n[Nav] === NAVIGAZIONE COMPLETATA ==='));
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
