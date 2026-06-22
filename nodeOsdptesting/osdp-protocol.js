/**
 * OSDP Protocol Engine & Bitstream Parser Module
 * Handles rolling packet sequencing, CRC-16 signatures, and cross-mode decoding.
 */
class OsdpProtocol {
    constructor(readerAddress, onCardSwipe, onLog) {
        this.address = readerAddress;
        this.onCardSwipe = onCardSwipe;
        this.onLog = onLog || console.log;
        
        // OSDP rolling sequence pointer: cycles 1, 2, 3, then loops back to 1...
        this.currentSeq = 1; 
        this.incomingBuffer = Buffer.alloc(0);
    }

    /**
     * Increments and fetches the next rolling sequence byte.
     * Sets bit 2 (value 0x04) to signal CRC validation mode to the reader.
     */
    getNextControlByte() {
        const ctrl = 0x04 | (this.currentSeq & 0x03);
        this.currentSeq = (this.currentSeq % 3) + 1;
        return ctrl;
    }

    /**
     * Standard OSDP CRC-16/AUG-CCITT bit calculation scheme
     */
    calculateCRC(buffer) {
        let crc = 0x1D0F; 
        for (let i = 0; i < buffer.length; i++) {
            let x = ((crc >> 8) ^ buffer[i]) & 0xFF;
            x ^= x >> 4;
            crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
        }
        return crc;
    }

    /**
     * Builds a structured 8-byte command block matching osdpTool output footprints
     */
    buildCommandBuffer(commandCode) {
        const pkt = Buffer.alloc(8);
        pkt[0] = 0x53;                     // SOM
        pkt[1] = this.address;             // PD Address
        pkt[2] = 0x08;                     // Total Len LSB (Always 8 bytes)
        pkt[3] = 0x00;                     // Total Len MSB
        pkt[4] = this.getNextControlByte();// Control byte with auto-increment sequence
        pkt[5] = commandCode;              // Command (e.g., 0x60 for POLL)
        
        // Sign and place Little-Endian CRC-16
        const crc = this.calculateCRC(pkt.subarray(0, 6));
        pkt.writeUInt16LE(crc, 6);
        return pkt;
    }

    /**
     * Appends streaming serial fragments and evaluates bounded packet shapes
     */
    feed(chunk) {
        this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

        while (this.incomingBuffer.length >= 5) {
            // Find the universal Start of Message pointer
            const somIdx = this.incomingBuffer.indexOf(0x53);
            if (somIdx === -1) {
                this.incomingBuffer = Buffer.alloc(0);
                break;
            }
            if (somIdx > 0) {
                this.incomingBuffer = this.incomingBuffer.subarray(somIdx);
                continue;
            }

            // Extract the frame boundary dynamically from the OSDP header length parameters
            const packetLength = this.incomingBuffer.readUInt16LE(2);
            if (this.incomingBuffer.length < packetLength) {
                break; // Framed packet is incomplete, await subsequent streaming data
            }

            const frame = this.incomingBuffer.subarray(0, packetLength);
            this.incomingBuffer = this.incomingBuffer.subarray(packetLength);
            this.processIncomingFrame(frame);
        }
    }

    /**
     * Internally routes verified reader responses to their functional listeners
     */
    processIncomingFrame(frame) {
        const replyAddress = frame[1];
        const msgTypeCode = frame[5];

        // Mask off the top transmission reply flag (0x80) to verify origin address matching
        if ((replyAddress & 0x7F) !== this.address) return;

        if (msgTypeCode === 0x48) {
            this.onLog(`<!> [Reader Status Alert]: Input Circuit Change Reported (osdp_LSTATR)`);
        } else if (msgTypeCode === 0x50) {
            this.decodeRawCardSwipe(frame);
        }
    }

    /**
     * PASSIVE MODE: Handles binary string inputs directly from streaming Wiegand-JSON hardware loops
     */
    decodeWiegandBinaryString(bitCountInput, binaryStr) {
        const bitCount = parseInt(bitCountInput, 10);
        let facilityCode = 0;
        let cardNumberString = "";

        if (bitCount === 26) {
            // Standard 26-bit text slicing: Drop leading parity bit (index 0)
            const facBin = binaryStr.substring(1, 9);    // Next 8 bits: Facility Code
            const cardBin = binaryStr.substring(9, 25);  // Next 16 bits: Card Number

            facilityCode = parseInt(facBin, 2);
            const cardNumberNum = parseInt(cardBin, 2);
            cardNumberString = cardNumberNum.toString();
        } 
        else if (bitCount === 40) {
            // Special 40-bit: Convert string straight to BigInt, apply standard system multiplier factor
            const rawDecimalValue = BigInt('0b' + binaryStr);
            const finalCardNumber = rawDecimalValue * 5n;
            
            cardNumberString = finalCardNumber.toString();
            facilityCode = parseInt(binaryStr.substring(0, 8), 2); 
        } 
        else {
            const fallbackValue = BigInt('0b' + binaryStr);
            cardNumberString = fallbackValue.toString();
            this.onLog(`[!] Unmapped bit depth (${bitCount} bits). Raw decimal conversion: ${cardNumberString}`);
            return;
        }

        this.printCardData('WIEGAND', bitCount, facilityCode, cardNumberString, binaryStr);
    }

    /**
     * NATIVE MODE: Handles traditional binary packet streams from native OSDP reader links
     */
    decodeRawCardSwipe(frame) {
        const bitCount = frame.readUInt16LE(8); 
        const dataBytes = frame.subarray(10, frame.length - 2); 
        const rawHexStr = dataBytes.toString('hex').toUpperCase();

        let facilityCode = 0;
        let cardNumberString = "";

        if (bitCount === 26 && dataBytes.length >= 3) {
            // Read 4 raw bytes from the wire array as a Big-Endian 32-bit Unsigned Integer
            let rawWireBits = 0;
            if (dataBytes.length >= 4) {
                rawWireBits = dataBytes.readUInt32BE(0);
            } else {
                const paddedBuffer = Buffer.concat([dataBytes, Buffer.from([0x00])]);
                rawWireBits = paddedBuffer.readUInt32BE(0);
            }

            // Correct left-alignment bias by stripping 6 trailing padding zero positions
            const trueWiegandStream = rawWireBits >> 6;

            // Execute standard 26-bit spatial extraction positions
            facilityCode = (trueWiegandStream >> 17) & 0xFF;        // Next 8 bits
            const cardNumberNum = (trueWiegandStream >> 1) & 0xFFFF; // Next 16 bits
            cardNumberString = cardNumberNum.toString();
        } 
        else if (bitCount === 40 && dataBytes.length >= 5) {
            const rawHexStr40 = dataBytes.subarray(0, 5).toString('hex');
            const rawDecimalValue = BigInt('0x' + rawHexStr40);
            const finalCardNumber = rawDecimalValue * 5n;
            
            cardNumberString = finalCardNumber.toString();
            facilityCode = parseInt(rawHexStr40.substring(0, 2), 16);
        } 
        else {
            return;
        }

        this.printCardData('OSDP', bitCount, facilityCode, cardNumberString, rawHexStr);
    }

    /**
     * Centralized formatted console logger output engine
     */
    printCardData(mode, bitLen, facility, cardNumber, rawRepresentation) {
        console.log(`\n[${new Date().toLocaleTimeString()}] ========================================`);
        console.log(`[!] CARD SWIPE DETECTED [MODE: ${mode} / ADDR: ${this.address}]`);
        console.log(`========================================================`);
        console.log(`[*] Bit Length    : ${bitLen} Bits`);
        console.log(`[*] Facility Code : ${facility}`);
        console.log(`[*] Card Number   : ${cardNumber}`); 
        console.log(`[*] Raw Payload   : ${rawRepresentation}`);
        console.log(`========================================================\n`);

        // Execute background callback trigger safely
        if (typeof this.onCardSwipe === 'function') {
            this.onCardSwipe({ mode, bitLen, facility, cardNumber, rawString: rawRepresentation });
        }
    }
}

module.exports = OsdpProtocol;
