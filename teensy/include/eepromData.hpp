#ifndef EEPROM_DATA_H
#define EEPROM_DATA_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <FastCRC.h>
#include <common.hpp>
#include <logger.hpp>
#include <shellFunctor.hpp>
#include <stdio.h>
#include <string.h>

struct ReaderData {
    ReaderData() { memset(padding, 0, sizeof(padding)); };
    uint32_t osdpBaudRate = OSDP_PORT_BAUD_RATE; ///< OSDP port baudrate for the reader
    ReaderType readerType = ReaderType::Wiegand; ///< Type of reader connected
    uint8_t padding[3];
};

struct EEProm {
    EEProm() { memset(padding, 0, sizeof(padding)); };
    ReaderData readers[2];                  ///< Persistent reader settings for two readers
    logLevel loglevel = logLevel::kLogInfo; ///< Persistent log level for the device
    uint8_t termMode = 1;                   ///< Terminal echo and promt enable or disable flag
    uint8_t padding[1];
    uint8_t crc; ///< CRC8 covering struct (excluding this field)
};

class EepromData {
public:
    /**
         * Constructor
         * Registers shell commands "getconfig" and "setconfig".
         */
    EepromData() {
        ShellFunctor::getInstance().add("getconfig", getconfig);
        ShellFunctor::getInstance().add("setreadertype", setreadertype);
        ShellFunctor::getInstance().add("setbaudrate", setbaudrate);
        ShellFunctor::getInstance().add("dumpeeprom", dumpeeprom);
        ShellFunctor::getInstance().add("setloglevel", setloglevel);
        ShellFunctor::getInstance().add("saveeeprom", saveeeprom);
        ShellFunctor::getInstance().add("getloglevel", getloglevel);
    };

    /**
         * getInstance
         * Singleton accessor for global EepromData instance.
         */
    static EepromData& getInstance() {
        static EepromData instance; // Guaranteed to be destroyed.
        // Instantiated on first use.
        return instance;
    }

    /**
         * getOsdpPortBaudrate
         * Returns stored OSDP baudrate for the given reader id.
         */
    uint32_t getOsdpPortBaudrate(ReaderId readerId) {
        const ReaderData* readerData = getReaderData(readerId);
        if (readerData == nullptr)
            return OSDP_PORT_BAUD_RATE;
        return readerData->osdpBaudRate;
    }

    /**
         * getReaderType
         * Returns the configured ReaderType for the given reader id.
         */
    ReaderType getReaderType(ReaderId readerId) {
        const ReaderData* readerData = getReaderData(readerId);
        if (readerData == nullptr)
            return ReaderType::None;
        return readerData->readerType;
    };

    /**
         * setReaderType
         * Updates in-memory reader type (does not persist until updateEeprom()).
         */
    void setReaderType(ReaderId readerId, ReaderType value) {
        ReaderData* readerData = getReaderData(readerId);
        if (readerData == nullptr)
            return;
        readerData->readerType = value;
    };

    /**
         * setReaderOsdBaudrate
         * Updates in-memory OSDP baudrate for reader (does not persist until updateEeprom()).
         */
    void setReaderOsdBaudrate(ReaderId readerId, uint32_t value) {
        ReaderData* readerData = getReaderData(readerId);
        if (readerData == nullptr)
            return;
        readerData->osdpBaudRate = value;
    };

    /**
           * setTerminalMode
           * Updates in-memory terminal interaction mode (does not persist until updateEeprom()).
           */
    void setTerminalMode(uint8_t mode) { eepromdata.termMode = mode; };

    /**
            * getTerminalMode
          * Returns the configured terminal mode
          */
    uint8_t getTerminalMode() { return eepromdata.termMode; };

    /**
          * getLogLevel
          * Returns the configured getLogLevel
          */
    logLevel getLogLevel() { return eepromdata.loglevel; };

    /**
        * printEpromData
        * Human readable dump of current in-memory eeprom data to logger.
        */
    void printEpromData(const EEProm& data) {
        uint baudRate;
        String readerType;
        baudRate = data.readers[getReaderIndex(ReaderId::reader1)].osdpBaudRate;
        readerType = getReaderTypeString(data.readers[getReaderIndex(ReaderId::reader1)].readerType);
        LoggerSerialDev.printf("Reader1:\n\r\tosdpBaudRate: %d\n\r\treaderType: %s\n\r", baudRate, readerType.c_str());
        baudRate = data.readers[getReaderIndex(ReaderId::reader2)].osdpBaudRate;
        readerType = getReaderTypeString(data.readers[getReaderIndex(ReaderId::reader2)].readerType);
        LoggerSerialDev.printf("Reader2:\n\r\tosdpBaudRate: %d\n\r\treaderType: %s\n\r\n\r", baudRate, readerType.c_str());
    }

    /**
         * begin
         * Loads EEPROM into memory and validates CRC.
         * Returns true if loaded and valid, false if defaults will be used.
         */
    bool begin() {
        EEProm data;
        EEPROM.get(kEppromOffset, data);

        if (!checkCrc(data)) {
            logger().warn(logger().printHeader, __FILE__, __LINE__, "Eeprom Data is not valid, using defaults");
            printEpromData(eepromdata);
            return false;
        }

        eepromdata = data;
        //    uint8_t loglevel = LogLevelToInt(logLevel::kLogInfo); ///< Persistent log level for the device
        // uint8_t termEchoOn = 1; ///< Terminal echo on flag
        //uint8_t termPrmptOn = 1; ///< Terminal prompt on flag
        return true;
    }

    /**
         * updateEeprom
         * Recomputes CRC and writes in-memory data to EEPROM.
         */
    void updateEeprom() {
        updatecCrc(eepromdata);
        EEPROM.put(kEppromOffset, eepromdata);
    }

private:
    const static int kEppromOffset = 0; ///< EEPROM offset where EEProm struct is stored
    int8_t timeOfset;
    uint8_t interPulseClocks;
    uint32_t cycleTime;
    uint32_t stepperTimerTiming = 6600; // uSec per step 6 - 8 mSec seems OK for this mechanical setup
    uint8_t replyDelay;
    EEProm eepromdata; ///< in-memory copy of persisted settings

    const ReaderData* getReaderData(ReaderId readerId) const {
        switch (readerId) {
        case ReaderId::reader1:
            return &eepromdata.readers[0];
        case ReaderId::reader2:
            return &eepromdata.readers[1];
        default:
            logger().error(logger().printHeader, __FILE__, __LINE__, "Invalid reader id %d", static_cast<int>(readerId));
            return nullptr;
        }
    }

    ReaderData* getReaderData(ReaderId readerId) {
        return const_cast<ReaderData*>(static_cast<const EepromData*>(this)->getReaderData(readerId));
    }

    /**
         * updatecCrc
         * Computes CRC8 over the EEProm struct (excluding crc field) and stores it.
         */
    void updatecCrc(EEProm& data) {
        FastCRC8 fastcrc;
        data.crc = fastcrc.smbus((uint8_t*)&data, sizeof(data) - 1);
    }

    /**
         * checkCrc
         * Validates provided EEProm struct against CRC8.
         */
    bool checkCrc(EEProm& data) {
        FastCRC8 fastcrc;
        uint8_t crc = fastcrc.smbus((uint8_t*)&data, sizeof(data) - 1);
        return data.crc == crc;
    }

    /**
         * getconfig (shell command)
         * Usage: getconfig <readerIndex>
         * Returns JSON with reader config for given index.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on success, 0 on command-level failure (invalid arg), 1/other as shell expects
         */
    shellFunc getconfig = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, (char*)"\t{ \"cmd\": \"%s\", \"desc\": \"read device eeprom values\" }", stream)) {
            return 1;
        }

        JsonDocument doc;

        doc["cmd"] = args[0];
        doc["status"] = true;
        doc["osdpReader1BaudRate"] = eepromdata.readers[0].osdpBaudRate;
        doc["reader1Type"] = getReaderTypeString(eepromdata.readers[0].readerType);
        doc["osdpReader2BaudRate"] = eepromdata.readers[1].osdpBaudRate;
        doc["reader2Type"] = getReaderTypeString(eepromdata.readers[1].readerType);
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    };

    /**
         * getloglevel (shell command)
         * Usage: getloglevel
         * Retrieves and returns current logger level as JSON to the provided stream.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on success, 0 on invalid argument count
         */
    shellFunc getloglevel = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, (char*)"\t{ \"cmd\": \"%s\", \"desc\": \"read device logger level values\" }", stream)) {
            return 1;
        }

        JsonDocument doc;

        doc["cmd"] = args[0];
        doc["status"] = true;
        doc["logLevel"] = logger().getLogLevelString();
        doc["logLevelInEeprom"] = logger().logLevelToString(eepromdata.loglevel);
        serializeJsonPretty(doc, stream);
        stream.println(); // Ensure newline after JSON response
        return 1;
    };

    /**
         * setloglevel (shell command)
         * Usage: setloglevel <info|debug>
         * Sets runtime logger level and emits JSON success/error to provided stream.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on successful level change, 0 on invalid argument
         */
    shellFunc setloglevel = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(
                2, arg_cnt, args,
                (char*)"\t{ \"cmd\": \"%s\",  \"arg\": \"loglevel [error, warn, info, debug, trace]\", \"desc\": \"set logging level\" }",
                stream)) {
            return 1;
        }

        String loglevelString = args[1];
        JsonDocument doc;

        if (loglevelString == "info") {
            logger().setLogLevel(logLevel::kLogInfo);
        } else if (loglevelString == "debug") {
            logger().setLogLevel(logLevel::kLogDebug);
        } else if (loglevelString == "error") {
            logger().setLogLevel(logLevel::kLogError);
        } else if (loglevelString == "warn") {
            logger().setLogLevel(logLevel::kLogWarning);
        } else if (loglevelString == "trace") {
            logger().setLogLevel(logLevel::kLogTrace);
        } else {
            // On invalid argument, return JSON error response to the invoking stream
            doc["cmd"] = args[0];
            doc["status"] = false;
            doc["error"] = "invalid argument";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 0;
        }

        eepromdata.loglevel = logger().getLogLevel();

        // Success response
        doc["cmd"] = args[0];
        doc["status"] = true;
        serializeJsonPretty(doc, stream);
        stream.println(); // Ensure newline after JSON response
        return 1;
    };

    /**
         * dumpeeprom (shell command)
         * Dumps raw EEPROM bytes to logger in hex and returns JSON ack to the stream.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on success, 1 if help/usage printed
         */
    shellFunc dumpeeprom = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, (char*)"\t{ \"cmd\": \"%s\", \"desc\": \"dump raw HEX of eeprom to logger\" }", stream)) {
            return 1;
        }

        EEProm data;
        EEPROM.get(kEppromOffset, data);
        logger().hexDump(&data, sizeof(data), false);

        JsonDocument doc;

        doc["cmd"] = args[0];
        doc["status"] = true;
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    };

    /**
         * saveeeprom (shell command)
         * Saves current EEPROM values to persistent storage.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on success, 0 on failure
         */
    shellFunc saveeeprom = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, (char*)"\t{ \"cmd\": \"%s\",\"desc\": \"save eeprom values\" }", stream)) {
            return 1;
        }

        updateEeprom();

        JsonDocument doc;
        doc["cmd"] = args[0];
        doc["status"] = true;
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    };

    /**
            * setbaudrate (shell command)
            * Usage: setconfig <readerIndex> <baudrate>
            * Validates arguments, updates in-memory config, and persists to EEPROM.
            * Emits JSON result to provided stream.
            *
            * Parameters:
            *  - arg_cnt: number of arguments passed (including command)
            *  - args: argv-style array of C-strings (args[0] is command)
            *  - stream: output Stream to write JSON response
            *
            * Returns:
            *  - int: 1 on success, 0 on invalid argument
            */
    shellFunc setbaudrate = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(3, arg_cnt, args,
                           (char*)"\t{ \"cmd\": \"%s\", \"arg\": \"reader [0 or 1] baudrate [value]\", \"desc\": \"set device baudrate\" }",
                           stream)) {
            return 1;
        }

        JsonDocument doc;
        int readerIndex = atoi(args[1]);
        int baudrate = atoi(args[2]);
        ReaderId readerid = getReaderEnum(readerIndex);

        if (readerid == ReaderId::invalid) {
            doc["cmd"] = args[0];
            doc["status"] = false;
            doc["error"] = "invalid argument1";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 0;
        }

        setReaderOsdBaudrate(readerid, baudrate);
        updateEeprom();
        doc["cmd"] = args[0];
        doc["status"] = true;
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    };

    /**
         * setreadertype (shell command)
         * Usage: setconfig <readerIndex>  <readerType>
         * Validates arguments, updates in-memory config, and persists to EEPROM.
         * Emits JSON result to provided stream.
         *
         * Parameters:
         *  - arg_cnt: number of arguments passed (including command)
         *  - args: argv-style array of C-strings (args[0] is command)
         *  - stream: output Stream to write JSON response
         *
         * Returns:
         *  - int: 1 on success, 0 on invalid argument
         */
    shellFunc setreadertype = [this](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(
                3, arg_cnt, args,
                (char*)"\t{ \"cmd\": \"%s\", \"arg\": \"reader [0 or 1] reader type [wiegand or osdp]\", \"desc\": \"set reader type\" }",
                stream)) {
            return 1;
        }

        JsonDocument doc;
        int readerIndex = atoi(args[1]);
        String readerTypeString = args[2];
        ReaderType readertype = getReaderEnumFromString(readerTypeString);
        ReaderId readerid = getReaderEnum(readerIndex);

        if ((readertype == ReaderType::None) || (readerid == ReaderId::invalid)) {
            doc["cmd"] = args[0];
            doc["status"] = false;
            doc["error"] = "invalid argument1";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 0;
        }

        setReaderType(readerid, readertype);
        updateEeprom();
        doc["cmd"] = args[0];
        doc["status"] = true;
        doc["reader"] = readerIndex;
        doc["readerType"] = readerTypeString;
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    };
};
#endif
