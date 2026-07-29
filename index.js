//Dark path Index.js 
//bot start file Terminal pairing 
//credit to Roja Graphix + Lord Mega + Mr admin blue 
//Open source 

require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000)

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1)
    }
}, 30_000)

global.botname = "DARKPATH-MD ☠️"
global.themeemoji = "&"

// ── Session / Config paths ────────────────────────────────────
const SESSION_DIR = './session'
const CONFIG_FILE = './data/config.json'

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })

// ── TTY / Readline ────────────────────────────────────────────
const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY)
const rl = hasTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null

const question = (text) => {
    if (rl) return new Promise(resolve => rl.question(text, resolve))
    return Promise.resolve('')
}

// ── Phone helpers ─────────────────────────────────────────────
const cleanPhone = (value) => String(value || '').replace(/[^0-9]/g, '').trim()

const getEnvPhone = () => {
    return cleanPhone(
        process.env.PHONE_NUMBER ||
        process.env.PHONE ||
        (settings ? settings.ownerNumber : '') ||
        ''
    )
}

const resolvePhone = async (phoneOverride = '') => {
    const direct = cleanPhone(phoneOverride)
    if (direct) return direct

    const envPhone = getEnvPhone()
    if (envPhone) {
        console.log(chalk.cyan('ℹ️ Using configured phone from env/settings'))
        return envPhone
    }

    if (rl) {
        console.log(chalk.white('\nEnter WhatsApp number with country code'))
        console.log(chalk.gray('Example: 256781631700 (without + or spaces)\n'))
        const input = await question(chalk.green('Number: '))
        const phone = cleanPhone(input)
        if (!phone || phone.length < 7) {
            console.log(chalk.red('❌ Invalid number'))
            process.exit(1)
        }
        console.log(chalk.green('✅ Accepted: +' + phone))
        return phone
    }

    console.log(chalk.red('❌ No PHONE_NUMBER configured and no TTY available'))
    process.exit(1)
}

// ── Session validation ────────────────────────────────────────
const hasExistingSession = () => {
    try {
        const files = fs.readdirSync(SESSION_DIR)
        if (!files.includes('creds.json')) return false
        const activityFiles = files.filter(f =>
            f.startsWith('app-state-sync-key-') ||
            f.startsWith('app-state-sync-version-') ||
            f.startsWith('sender-key-') ||
            f.startsWith('session-') ||
            f.startsWith('pre-key-')
        )
        return activityFiles.length >= 2
    } catch {
        return false
    }
}

const wipeSession = () => {
    try {
        rmSync(SESSION_DIR, { recursive: true, force: true })
        fs.mkdirSync(SESSION_DIR, { recursive: true })
        console.log(chalk.yellow('⚠️ Session wiped'))
    } catch (_) {}
}

// ═════════════════
//  SESSION ID SYSTEM - DARK PATH-MD;;; Base64 format
// ═════════════════
const loadSessionFromId = async (sessionStr) => {
    if (!sessionStr.startsWith('DARKPATH-MD;;;')) {
        throw new Error('Invalid format - must start with DARKPATH;;;')
    }
    
    const base64Data = sessionStr.replace('DARKPATH-MD;;;', '')
    
    if (!base64Data || base64Data.length < 100) {
        throw new Error('Session data too short')
    }
    
    console.log(chalk.cyan('⏳ Extracting  session...'))
    
    try {
        const credsBuffer = Buffer.from(base64Data, 'base64')
        const credsJson = JSON.parse(credsBuffer.toString('utf8'))
        
        if (!credsJson || !credsJson.me || !credsJson.me.id) {
            throw new Error('Invalid creds.json structure')
        }
        
        console.log(chalk.green('✅ Valid session ID extracted'))
        
        rmSync(SESSION_DIR, { recursive: true, force: true })
        fs.mkdirSync(SESSION_DIR, { recursive: true })
        
        fs.writeFileSync(path.join(SESSION_DIR, 'creds.json'), credsBuffer)
        console.log(chalk.green('✅ Session saved to folder'))
        
    } catch (err) {
        throw new Error('Decode failed: ' + err.message)
    }
}

// ── Simple phone validation (no external lib) like awesome phone number which breaks and rejects some numbers ────────────────
const validatePhone = (phone) => {
    // WhatsApp numbers are between 7 and 15 digits
    if (!phone || phone.length < 7 || phone.length > 15) {
        console.log(chalk.red('❌ Invalid phone number. Please enter your full international number (e.g., 254111284665 for Ke🇰🇪, 256754773765 for Ug 🇺🇬) without + or spaces.'))
        process.exit(1)
    }
}

// Helper to format JID as +number display string
const fmtJidNum = (jid) => {
    if (!jid) return jid
    return '+' + String(jid).replace(/@s\.whatsapp\.net|@g\.us/g, '').replace(/:\d+/, '')
}

// ══════════════════════════════════════════════════════════════
//  MAIN BOT
// ══════════════════════════════════════════════════════════════
let pairingRequested = false

async function startXeonBotInc(phoneOverride = null) {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
        const msgRetryCounterCache = new NodeCache()

        const isReturning = hasExistingSession()

        if (isReturning) {
            console.log(chalk.green('✅ Session found — resuming connection...'))
        } else {
            console.log(chalk.cyan('🆕 Fresh start — DARKPATH-MD v' + version.join('.')))
        }

        let phone = ''
        if (!state.creds.registered) {
            phone = await resolvePhone(phoneOverride)
            phone = cleanPhone(phone)
            if (!phone || phone.length < 7) {
                console.log(chalk.red('❌ Invalid phone'))
                process.exit(1)
            }
            validatePhone(phone)
            console.log(chalk.green('📱 Phone: +' + phone))
            console.log(chalk.white('⚡ Starting socket...'))
        }

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

        store.bind(XeonBotInc.ev)

        // Message handling
        XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(XeonBotInc, chatUpdate);
                    return;
                }
                if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                    if (!isGroup) return
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                if (XeonBotInc?.msgRetryCounterCache) {
                    XeonBotInc.msgRetryCounterCache.clear()
                }

                try {
                    await handleMessages(XeonBotInc, chatUpdate, true)
                } catch (err) {
                    console.error("Error in handleMessages:", err)
                    if (mek.key && mek.key.remoteJid) {
                        await XeonBotInc.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.',
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363401831624774@newsletter',
                                    newsletterName: 'darkpath',
                                    serverMessageId: -1
                                }
                            }
                        }).catch(console.error);
                    }
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        XeonBotInc.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        XeonBotInc.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = XeonBotInc.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        XeonBotInc.getName = (jid, withoutContact = false) => {
            id = XeonBotInc.decodeJid(jid)
            withoutContact = XeonBotInc.withoutContact || withoutContact
            let v
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
                resolve(v.name || v.subject || fmtJidNum(id))
            })
            else v = id === '0@s.whatsapp.net' ? {
                id,
                name: 'WhatsApp'
            } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
                XeonBotInc.user :
                (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || fmtJidNum(jid)
        }

        XeonBotInc.public = true
        XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

        // Connection handling
        XeonBotInc.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update
            
            if (connection === 'connecting') {
                console.log(chalk.yellow('🟩 Connecting to WhatsApp...Please Wait🟢'))
                
                if (!state.creds.registered && phone && !pairingRequested) {
                    pairingRequested = true
                    await delay(5000)
                    try {
                        let code = await XeonBotInc.requestPairingCode(phone)
                        code = code?.match(/.{1,4}/g)?.join('-') || code
                        console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                        console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                    } catch (error) {
                        console.error('Error requesting pairing code:', error)
                        console.log(chalk.red('❌ Failed to get pairing code. Please check your phone number and try again.'))
                        pairingRequested = false
                    }
                }
            }
            
            if (connection === 'open') {
                if (rl) rl.close()
                pairingRequested = false

                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`✅️✅️Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    await XeonBotInc.sendMessage(botNumber, {
                        text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n👤Dev.Number: +256781631700\n\n📝Follow Channel For Updates And More`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363431165425233@newsletter',
                                newsletterName: 'darkpath☠️',
                                serverMessageId: -1
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error sending connection message:', error.message)
                }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'DARK PATH ☠️'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: ROJA GRAPHIX `))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB:darkpath`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: 256781631700`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: ROJA GRAPHIX  `))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Dark path ☠️ Connected Successfully! ✅`))
                console.log(chalk.blue(`Bot Version: 1.0.7`))
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut

                console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                    } catch (error) {
                        console.error('Error deleting session:', error)
                    }
                    console.log(chalk.red('Session logged out. Please re-authenticate.'))
                }
                
                if (shouldReconnect) {
                    console.log(chalk.yellow('Reconnecting...'))
                    pairingRequested = false
                    await delay(5000)
                    startXeonBotInc(phoneOverride)
                }
            }
        })

        // Track recently-notified callers to avoid spamming messages
        const antiCallNotified = new Set();

        // Anticall handler: block callers when enabled
        XeonBotInc.ev.on('call', async (calls) => {
            try {
                const { readState: readAnticallState } = require('./commands/anticall');
                const state = readAnticallState();
                if (!state.enabled) return;
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    try {
                        try {
                            if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                                await XeonBotInc.rejectCall(call.id, callerJid);
                            } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                                await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                            }
                        } catch {}

                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid);
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                            await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                        }
                    } catch {}
                    setTimeout(async () => {
                        try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                    }, 800);
                }
            } catch (e) {
                // ignore
            }
        });

        XeonBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(XeonBotInc, update);
        });

        XeonBotInc.ev.on('messages.upsert', async (m) => {
            if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, m);
            }
        });

        XeonBotInc.ev.on('status.update', async (status) => {
            await handleStatus(XeonBotInc, status);
        });

        XeonBotInc.ev.on('messages.reaction', async (status) => {
            await handleStatus(XeonBotInc, status);
        });

        return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc(phoneOverride)
    }
}

// ══════════════════════════════════════════════════════════════
//  LAUNCHER - Smart pairing logic made by Roja graphix 
// ══════════════════════════════════════════════════════════════
async function launch() {
    console.log(chalk.blue.bold('\n🤖  DARK PATH 🤖\n'))

    if (hasExistingSession()) {
        console.log(chalk.green('✅ Existing session found — resuming bot'))
        console.log('')
        
