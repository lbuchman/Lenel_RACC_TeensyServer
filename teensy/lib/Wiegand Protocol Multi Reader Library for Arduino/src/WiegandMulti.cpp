/* this code is based on
https://github.com/jpliew/Multi-Reader-Wiegand-Protocol-Library-for-Arduino.git
The code was used is a tamplate and retains very little from the original code
*/

#include "WiegandMulti.h"
#include <logger.hpp>

#if defined(ESP8266)
#define INTERRUPT_ATTR ICACHE_RAM_ATTR
#elif defined(ESP32)
#define INTERRUPT_ATTR IRAM_ATTR
#else
#define INTERRUPT_ATTR
#endif

WiegandMulti::WiegandMulti() {
    memset(dataIn, 0, sizeof(dataIn)); // clear data buffer
}

bool WiegandMulti::available() {
    bool ret;
    //noInterrupts();
    ret = DoWiegandConversion();
    //interrupts();
    return ret;
}

void WiegandMulti::begin(int pinD0, int pinD1, void (*ISR_D0)(void), void (*ISR_D1)(void)) {
    _lastWiegand = 0;
    _code = 0;
    _bitCount = 0;
    pinMode(pinD0, INPUT); // Set D0 pin as input
    pinMode(pinD1, INPUT); // Set D1 pin as input

    attachInterrupt(digitalPinToInterrupt(pinD0), ISR_D0, RISING); // Hardware interrupt - high to low pulse
    attachInterrupt(digitalPinToInterrupt(pinD1), ISR_D1, RISING); // Hardware interrupt - high to low pulse
}

INTERRUPT_ATTR void WiegandMulti::ReadD0() {
    _bitCount++;

    if (_bitCount > WIEGAND_MAX_BITS) {
        logger().debug(logger().printHeader, __FILE__, __LINE__, "Reader 1 is Wiegand");
        return;
    }

    dataIn[_bitCount] = char(0x30); // Increament bit count for Interrupt connected to D0
    _lastWiegand = millis();        // Keep track of last wiegand bit received
}

INTERRUPT_ATTR void WiegandMulti::ReadD1() {
    _bitCount++; // Increment bit count for Interrupt connected to D1

    if (_bitCount > WIEGAND_MAX_BITS) {
        logger().debug(logger().printHeader, __FILE__, __LINE__, "Reader 1 is Wiegand");
        return;
    }

    dataIn[_bitCount] = char(0x31); // Make note of bit value for D1
    _lastWiegand = millis();        // Keep track of last wiegand bit received
}

String WiegandMulti::GetCardData() { return String(_dataIn); }

bool WiegandMulti::DoWiegandConversion() {
    unsigned long sysTick = millis();

    if ((sysTick - _lastWiegand) > INTER_WIEGAND_BITS_TIMEOUT_MSEC) {

        if (_bitCount < 0) {
            return false;
        }

        memcpy(_dataIn, dataIn, sizeof(dataIn));
        memset(dataIn, 0, sizeof(dataIn)); // clear data buffer
        bitCount = _bitCount;
        _bitCount = -1;
        return true;
    } else {
        return false;
    }
}
