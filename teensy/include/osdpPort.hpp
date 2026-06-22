#ifndef RS485_PORT_H
#define RS485_PORT_H

#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <TaskSchedulerDeclarations.h>
#include <hw.h>
#include <logger.hpp>

class osdpPort {
public:
    osdpPort(ReaderId _readerId, Scheduler& _ts, Stream& _reader485Port, Stream& _reader232Port)
        : readerId(_readerId),
          ts(_ts),
          reader485Port(_reader485Port),
          reader232Port(_reader232Port),
          baudRate(9600) {}

    void begin(uint32_t baudrate) {
        baudRate = baudrate;

        // Update execution slicing rate to track your custom OSDP timing macro parameters safely
        workTask.setInterval(OSDP_PULL_RATE_USEC);

        // Note: Move physical power control configurations (pinMode) up into init.cpp to maximize reuse decoupling
        if (readerId == ReaderId::reader1) {
            logger().debug(logger().printHeader, __FILE__, __LINE__, "Initializing Reader 1 OSDP Link. Baud: %d bps", baudrate);
            pinMode(READER1_Power, OUTPUT);
            digitalWrite(READER1_Power, HIGH);
        } else if (readerId == ReaderId::reader2) {
            logger().debug(logger().printHeader, __FILE__, __LINE__, "Initializing Reader 2 OSDP Link. Baud: %d bps", baudrate);
            pinMode(READER2_Power, OUTPUT);
            digitalWrite(READER2_Power, HIGH);
        }

        workTask.enable();
    }

private:
    ReaderId readerId;
    Scheduler& ts;
    Stream& reader485Port;
    Stream& reader232Port;
    uint32_t baudRate;

    // Constant limits to protect your task processing loop from locking up under continuous data streams
    static constexpr size_t kMaxBytesPerSlice = 32;

    /**
     * Non-Blocking Non-Starving Bidirectional Pass-Through Worker Task
     */
    Task workTask{TASK_IMMEDIATE,
                  TASK_FOREVER,
                  [this](void) -> void {
                      size_t bytesProcessed = 0;

                      // Route 1: forward from the system-side serial port to the reader-side RS-485 port.
                      // Cap each slice so this task cannot monopolize the scheduler under sustained traffic.
                      while (reader232Port.available() && (bytesProcessed < kMaxBytesPerSlice)) {
                          reader485Port.write(reader232Port.read());
                          bytesProcessed++;
                      }

                      bytesProcessed = 0;

                      // 🔄 ROUTE 2: Forward from Physical Reader Line (485) back up to System Logic Panel (232)
                      while (reader485Port.available() && (bytesProcessed < kMaxBytesPerSlice)) {
                          reader232Port.write(reader485Port.read());
                          bytesProcessed++;
                      }
                  },
                  &ts,
                  false,
                  NULL,
                  NULL};
};

#endif
