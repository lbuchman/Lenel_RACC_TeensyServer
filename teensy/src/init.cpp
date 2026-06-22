#include "TaskScheduler.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Cmd.h>
#include <TimeLib.h>
#include <cstdint>
#include <ctype.h>
#include <eepromData.hpp>
#include <hw.h>
#include <logger.hpp>
#include <osdpPort.hpp>
#include <shellFunctor.hpp>
#include <stdio.h>
#include <stdlib.h>
#include <stepperDriver.hpp>
#include <stepperRehome.hpp>
#include <string.h>
#include <unistd.h>
#include <watchdogWrapper.h>
#include <wiegandReader.hpp>

Scheduler ts;

// Global hardware peripheral instantiation references
Stepper stepper(MOTOR_STEP, MOTOR_DIR, MOTOR_EN, ts);
StepperRehome rehome(stepper, HALL_SENSOR, ts);

// Pointers for optional reader tracking instances
WiegandReader* reader1 = nullptr;
WiegandReader* reader2 = nullptr;
osdpPort* osdpPort1 = nullptr;
osdpPort* osdpPort2 = nullptr;

/**
 * Watchdog Service Task Hook Loop
 */
Task watchDogTask((WD_EXPIRE * TASK_SECOND) / 3, TASK_FOREVER,
                  [](void) -> void {
                      static int value = 0;
                      digitalWrite(WATCHDOG_LED, value);
                      value = value ^ 1;
                      watchdog();
                  },
                  &ts, false, NULL, NULL);

/**
 * Firmware Application System Bootstrap Setup routine
 */
int setupFw() {
    pinMode(WATCHDOG_LED, OUTPUT);
    CmdSerialDev.begin(SERIAL_BAUDRATE);
    LoggerSerialDev.begin(SERIAL_BAUDRATE);

    // Bind global reporting stream context pipelines
    loggerInit((Stream&)LoggerSerialDev);
    logger().warn(logger().printHeader, __FILE__, __LINE__, "*************** REBOOT ********************");

    EepromData& eepromdata = EepromData::getInstance();
    eepromdata.begin();
    logger().setLogLevel(eepromdata.getLogLevel());

    // Initialize system hardware defense protocols early
    watchDogTask.enable();

    logger().info(logger().printHeader, __FILE__, __LINE__, "RedDiamond Reader Fixture FW ver %f", FWVERSION);

    static ShellFunctor& cshell = ShellFunctor::getInstance();
    static SerialTerminal serialTerminalPi(cshell, ts);
    serialTerminalPi.begin(&CmdSerialDev, false, NULL, false);
    serialTerminalPi.setSilentMode(eepromdata.getTerminalMode() > 0);

    // Command Registration Infrastructure Mapping Hooks
    ShellFunctor::getInstance().add("setterminalmode", [&](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(2, arg_cnt, args,
                           "\t{ \"cmd\": \"%s\", \"arg\": \"human|script\", \"desc\": \"set terminal interaction mode\" }", stream)) {
            return 1;
        }

        String mode = args[1];
        if (mode == "human") {
            serialTerminalPi.setSilentMode(false);
        } else if (mode == "script") {
            serialTerminalPi.setSilentMode(true);
        } else {
            JsonDocument doc;
            doc["status"] = false;
            doc["cmd"] = args[0];
            doc["error"] = "invalid argument";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 1;
        }

        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = args[0];
        doc["mode"] = mode;
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    });

    ShellFunctor::getInstance().add("reboot", [&](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"desc\": \"reboot\" }", stream)) {
            return 1;
        }
        watchdogReboot();
        return 1;
    });

    ShellFunctor::getInstance().add("about", [&](int arg_cnt, char** args, Stream& stream) -> int {
        if (!checkArgument(1, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"desc\": \"info\" }", stream)) {
            return 1;
        }
        unsigned long totalSeconds = millis() / 1000;
        unsigned long totalMinutes = totalSeconds / 60;
        unsigned long totalHours = totalMinutes / 60;

        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = args[0];
        doc["fw"] = FWVERSION;
        doc["uptime_days"] = totalHours / 24;
        doc["uptime_hours"] = totalHours % 24;
        doc["uptime_minutes"] = totalMinutes % 60;

        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    });

    stepper.begin();
    rehome.begin();

    // ==========================================
    // Reader 1 Interface Setup
    // ==========================================
    switch (eepromdata.getReaderType(ReaderId::reader1)) {
    case ReaderType::None:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 1 is disabled");
        break;
    case ReaderType::Wiegand:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 1 is Wiegand");
        SerialReader1_232Port.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader1));
        reader1 = new WiegandReader(ReaderId::reader1, ts, SerialReader1_232Port, READER1_D0, READER1_D1);
        reader1->begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader1));
        break;
    case ReaderType::Osdp:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 1 is OSDP passer");
        READER1osdpPort.transmitterEnable(READER1osdpFlowCnt);
        READER1osdpPort.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader1));
        SerialReader1_232Port.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader1));
        osdpPort1 = new osdpPort(ReaderId::reader1, ts, READER1osdpPort, SerialReader1_232Port);
        osdpPort1->begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader1));
        break;
    }

    // ==========================================
    // Reader 2 Interface Setup
    // ==========================================
    switch (eepromdata.getReaderType(ReaderId::reader2)) {
    case ReaderType::None:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 2 is disabled");
        break;
    case ReaderType::Wiegand:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 2 is Wiegand");
        SerialReader2_232Port.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader2));
        reader2 = new WiegandReader(ReaderId::reader2, ts, SerialReader2_232Port, READER2_D0, READER2_D1);
        reader2->begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader2));
        break;
    case ReaderType::Osdp:
        logger().info(logger().printHeader, __FILE__, __LINE__, "Reader 2 is OSDP passer");
        READER2osdpPort.transmitterEnable(READER2osdpFlowCnt);
        READER2osdpPort.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader2));
        SerialReader2_232Port.begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader2));
        osdpPort2 = new osdpPort(ReaderId::reader2, ts, READER2osdpPort, SerialReader2_232Port);
        osdpPort2->begin(eepromdata.getOsdpPortBaudrate(ReaderId::reader2));
        break;
    }
    enableWatchdog();
    return 0;
}

/**
 * Task Management Processing Loop
 */
void mainLoop() {
    while (true) {
        ts.execute();
        // TaskScheduler handles yielding for this target configuration.
    }
}
