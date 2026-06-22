#ifndef WIEGAND_READER_H
#define WIEGAND_READER_H

#include <TaskSchedulerDeclarations.h>
#include <WiegandMulti.h>
#include <hw.h>
#include <logger.hpp>
#include <shellFunctor.hpp>

typedef void (*isrFunction)(void);

class WiegandReader {
public:
    WiegandReader(ReaderId _readerId, Scheduler& _ts, Stream& _reader232Port, int _d0, int _d1)
        : readerId(_readerId),
          ts(_ts),
          reader232Port(_reader232Port),
          d0(_d0),
          d1(_d1) {}

    void begin(uint32_t baudrate) {
        readers[getReaderIndex(readerId)] = this;

        // Bind shell command to instance runner cleanly using local lambda scope
        ShellFunctor::getInstance().add("wgdebug",
                                        [this](int cnt, char** args, Stream& str) { return handleDebugCommand(cnt, args, str); });

        if (readerId == ReaderId::reader1) {
            logger().info(logger().printHeader, __FILE__, __LINE__, "Initializing Reader 1. Baud: %d", baudrate);
            pinMode(READER1_Power, OUTPUT);
            digitalWrite(READER1_Power, HIGH);
            pinMode(READER1_F2F_O, OUTPUT);
            digitalWrite(READER1_F2F_O, LOW);
            wg.begin(d0, d1, Reader1D0Interrupt, Reader1D1Interrupt);
        } else if (readerId == ReaderId::reader2) {
            logger().info(logger().printHeader, __FILE__, __LINE__, "Initializing Reader 2. Baud: %d", baudrate);
            pinMode(READER2_Power, OUTPUT);
            digitalWrite(READER2_Power, HIGH);
            pinMode(READER2_F2F_O, OUTPUT);
            digitalWrite(READER2_F2F_O, LOW);
            wg.begin(d0, d1, Reader2D0Interrupt, Reader2D1Interrupt);
        }

        workTask.enable();
    }

private:
    // Store reader identity and I/O bindings by value/reference for the lifetime of the instance.
    ReaderId readerId;
    Scheduler& ts;
    Stream& reader232Port;
    int d0;
    int d1;
    WiegandMulti wg;
    unsigned int packetGap = 15;

    inline static WiegandReader* readers[2] = {nullptr, nullptr};

    // Interrupt trampolines guard against uninitialized reader instances.
    inline static void reader1D0Interrupt(void) {
        if (readers[0])
            readers[0]->wg.ReadD0();
    }
    inline static void reader1D1Interrupt(void) {
        if (readers[0])
            readers[0]->wg.ReadD1();
    }
    inline static void reader2D0Interrupt(void) {
        if (readers[1])
            readers[1]->wg.ReadD0();
    }
    inline static void reader2D1Interrupt(void) {
        if (readers[1])
            readers[1]->wg.ReadD1();
    }

    isrFunction Reader1D0Interrupt = reader1D0Interrupt;
    isrFunction Reader1D1Interrupt = reader1D1Interrupt;
    isrFunction Reader2D0Interrupt = reader2D0Interrupt;
    isrFunction Reader2D1Interrupt = reader2D1Interrupt;

    /**
     * Non-Blocking Cadence Task to Harvest Incoming Card Pulses
     */
    Task workTask{TASK_MILLISECOND * INTER_WIEGAND_BITS_TIMEOUT_MSEC,
                  TASK_FOREVER,
                  [this](void) -> void {
                      if (wg.available()) {
                          JsonDocument doc;
                          doc["status"] = wg.getBitCount() > 0;
                          doc["reader"] = getReaderIndex(readerId);

                          // WiegandMulti reports a zero-based last-bit index, so convert it to a bit count.
                          doc["bitCount"] = wg.getBitCount() + 1;
                          doc["code"] = wg.GetCardData();

                          serializeJson(doc, reader232Port);
                          reader232Port.println();
                      }
                  },
                  &ts,
                  false,
                  NULL,
                  NULL};

    /**
     * Debugging Command Response Processor Method
     */
    int handleDebugCommand(int arg_cnt, char** args, Stream& stream) {
        if (!checkArgument(2, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"args\": \"readerIndex 0/1\", \"desc\": \"wiegand statistics\" }",
                           stream)) {
            return 1;
        }

        int readerIndex = atoi(args[1]);
        JsonDocument doc;
        ReaderId targetEnum = getReaderEnum(readerIndex);

        if (targetEnum == ReaderId::invalid) {
            doc["cmd"] = args[0];
            doc["status"] = false;
            doc["error"] = "invalid argument";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 0;
        }

        WiegandMulti* targetWg = nullptr;
        if (targetEnum == ReaderId::reader1 && readers[0])
            targetWg = &readers[0]->wg;
        if (targetEnum == ReaderId::reader2 && readers[1])
            targetWg = &readers[1]->wg;

        doc["cmd"] = args[0];
        if (targetWg != nullptr) {
            doc["status"] = targetWg->getBitCount() > 0;
            doc["reader"] = readerIndex;
            doc["bitCount"] = targetWg->getBitCount();
            doc["lastWiegand"] = millis() - targetWg->getLastWiegand();
            doc["code"] = targetWg->GetCardData();
        } else {
            doc["status"] = false;
            doc["error"] = "requested reader instance is uninitialized";
        }

        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    }
};

#endif
