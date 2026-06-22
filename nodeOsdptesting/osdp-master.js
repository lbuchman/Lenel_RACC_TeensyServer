/**
 * OSDP / Wiegand Universal Master Controller Executive Hook
 * Usage: node osdp-master.js <device_path> <baud_rate> <reader_address> <reader_mode>
 */
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const OsdpProtocol = require('./osdp-protocol');

// ==========================================
// 1. Runtime Environment Verification
// ==========================================
if (process.argv.length < 6) {
    console.log("\n=======================================================");
    console.log("Universal Access Reader Controller - Dual Mode Setup");
    console.log("=======================================================");
    console.log("Usage: node osdp-master.js <device_path> <baud_rate> <reader_address> <reader_mode>");
    console.log("Modes: osdp | wiegand");
    console.log("Example OSDP   : node osdp-master.js /dev/ttyACM0 115200 1 osdp");
    console.log("Example WIEGAND: node osdp-master.js /dev/ttyACM0 115200 1 wiegand\n");
    process.exit(1);
}

const devicePath = process.argv.at(2);
const baudRate = parseInt(process.argv.at(3), 10);
const readerAddress = parseInt(process.argv.at(4), 10);
const readerMode = process.argv.at(5).toLowerCase();

if (readerMode !== 'osdp' && readerMode !== 'wiegand') {
    console.error("[-] Initialization Error: Reader mode choice must be exactly 'osdp' or 'wiegand'.");
    process.exit(1);
}

let pollingIntervalHandle = null;

// ==========================================
// 2. Hardware Serial Communications Layer
// ==========================================
const port = new SerialPort({
    path: devicePath,
    baudRate: baudRate,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    autoOpen: false
});

// Instantiate the custom protocol tracker object instance
const osdp = new OsdpProtocol(
    readerAddress,
    (card) => {
        // Shared execution event callback target hook placeholder
    },
    (logMsg) => console.log(`[SYSTEM LOG]: ${logMsg}`)
);

// ==========================================
// 3. Operational Interface Router Logic
// ==========================================
port.open((err) => {
    if (err) {
        console.error(`[-] Serial Link Connection Failed:`, err.message);
        process.exit(1);
    }
    
    console.log(`[+] Link Opened via ${devicePath} (${baudRate} bps). Operational Mode: ${readerMode.toUpperCase()}`);

    if (readerMode === 'osdp') {
        // Native Mode: Direct continuous streaming buffer channel data straight down to the OSDP engine
        port.on('data', (chunk) => osdp.feed(chunk));

        // Start standard 45 millisecond interval heartbeat polling schedule
        pollingIntervalHandle = setInterval(() => {
            const pollFrame = osdp.buildCommandBuffer(0x60); // 0x60 is the code for osdp_POLL
            port.write(pollFrame, (writeErr) => {
                if (writeErr) console.error("[-] Wire drop on polling cycle loop:", writeErr.message);
            });
        }, 45);
        console.log(`[+] OSDP 45ms continuous hardware polling loop initiated.`);
    } 
    else if (readerMode === 'wiegand') {
        // Passive Mode: Use text string parser to isolate line-by-line inputs 
        const lineParser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
        
        lineParser.on('data', (line) => {
            try {
                const cleanLine = line.trim();
                if (!cleanLine.startsWith('{')) return; // Clear out raw hardware setup echo flags
                
                const msg = JSON.parse(cleanLine);
                
                // Ignore the converter reader channel identity indices. Safely read fields if status is true.
                if (msg.status && msg.code) {
                    osdp.decodeWiegandBinaryString(msg.bitCount, msg.code);
                }
            } catch (jsonErr) {
                // Ignore parsing fragment collisions cleanly
            }
        });
        console.log(`[+] Awaiting passive Wiegand JSON tracking stream events...`);
    }
});

// ==========================================
// 4. Clean System Lifespan Demolition Hooks
// ==========================================
process.on('SIGINT', () => {
    console.log("\n[-] Terminating background processes...");
    if (pollingIntervalHandle) clearInterval(pollingIntervalHandle);
    port.close(() => {
        console.log("[+] System hardware paths torn down cleanly.\n");
        process.exit(0);
    });
});
