#!/usr/bin/env node
'use strict';

const http = require('http');

// ========================================================
// 1. Dynamic Parameter Extraction
// ========================================================
const args = process.argv.slice(2);
const host = args[0];
const command = args[1];
const trailingArgs = args.slice(2);

if (!host || !command || host === 'h' || host === '-h' || host === '--help') {
    console.error(`Usage:   node rdtf.js <host> <command> [arg1] [arg2] ... [argN]`);
    console.error(`Example: node rdtf.js 192.168.1.50 setreadertype 1 osdp\n`);
    process.exit(1);
}

// ========================================================
// 2. Construct the REST Payload
// ========================================================
const payload = {
    cmd: command,
    timeout: '5000'
};

if (trailingArgs.length > 0) {
    payload.arg = trailingArgs.join(' ');
}

const postData = JSON.stringify(payload);

// ========================================================
// 3. HTTP Transaction Engine
// ========================================================
const options = {
    hostname: host,
    port: 3300,
    path: '/commands',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    let responseData = '';
    res.setEncoding('utf8');
    
    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        try {
            let cleanedData = responseData.trim();

            // Auto-heal malformed JSON arrays if the server drops the opening bracket
            if (command === 'help' && !cleanedData.startsWith('[')) {
                cleanedData = '[' + cleanedData;
            }

            const jsonObject = JSON.parse(cleanedData);

            // 🟢 CASE 1: Decode "help" Command Payload Line-by-Line
            if (command === 'help' && Array.isArray(jsonObject)) {
                const targetCmd = trailingArgs[0];
                jsonObject.forEach((item) => {
                    if (item && item.cmd) {
                        if (targetCmd && item.cmd !== targetCmd) return;
                        const cmdText = item.cmd.padEnd(16);
                        const descText = item.desc || 'No description provided';
                        let usageTemplate = '';
                        if (item.arg) usageTemplate = ` [Usage: ${item.arg}]`;
                        else if (item.args) usageTemplate = ` [Usage: ${item.args}]`;
                        else if (item.timeoutMs) usageTemplate = ` [Timeout: ${item.timeoutMs}ms]`;
                        console.log(` -> ${cmdText} : ${descText}${usageTemplate}`);
                    }
                });
            }
            // 🟢 CASE 2: Decode "getconfig" Server Payload Fields (Skipping status line)
            else if (command === 'getconfig' && typeof jsonObject === 'object') {
                if (jsonObject.status === false) console.log(`❌ Status      : FAILED`);
                console.log(`🔹 Reader 1 Type: ${jsonObject.reader1Type || 'N/A'}`);
                console.log(`🔹 Reader 1 Baud: ${jsonObject.osdpReader1BaudRate || 'N/A'} bps`);
                console.log(`----------`);
                console.log(`🔹 Reader 2 Type: ${jsonObject.reader2Type || 'N/A'}`);
                console.log(`🔹 Reader 2 Baud: ${jsonObject.osdpReader2BaudRate || 'N/A'} bps`);
            }
            // 🟢 CASE 3: Decode "about" / System Information Payload Fields (Skipping status line)
            else if (command === 'about' && typeof jsonObject === 'object') {
                if (jsonObject.status === false) console.log(`❌ Status      : FAILED`);
                console.log(`🔹 Firmware Ver: v${jsonObject.fw || '1.0.0'}`);
                console.log(`🔹 System Uptime: ${jsonObject.uptime_days || 0} days, ${jsonObject.uptime_hours || 0} hours, ${jsonObject.uptime_minutes || 0} minutes`);
            }
            // 🟢 CASE 4: Standard Universal Action Response Decoder (setreadertype, motormove, reboot, etc.)
            else if (typeof jsonObject === 'object') {
                const statusFlag = jsonObject.status;
                if (statusFlag === true) {
                    let hasData = false;
                    Object.keys(jsonObject).forEach((key) => {
                        if (key === 'cmd' || key === 'status') return;
                        console.log(`🔹 ${key.padEnd(12)}: ${jsonObject[key]}`);
                        hasData = true;
                    });
                    if (!hasData) {
                        console.log('Action executed successfully.');
                    }
                } else {
                    console.log(`❌ Status      : FAILED`);
                    console.log(`⚠️ Error Cause  : ${jsonObject.error || 'Unknown execution variance error encountered.'}`);
                }
            }
        } catch (e) {
            console.log(responseData.trim());
        }
    });
});

req.on('error', (err) => {
    console.error(`[-] core26 Network Error: ${err.message}`);
    process.exit(1);
});

req.write(postData);
req.end();
