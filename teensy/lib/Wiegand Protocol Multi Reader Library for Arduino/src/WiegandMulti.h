/* this code is based on
https://github.com/jpliew/Multi-Reader-Wiegand-Protocol-Library-for-Arduino.git
The code was used is a tamplate and retains very little from the original code
*/

#ifndef _WIEGANDMULTI_H
#define _WIEGANDMULTI_H

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

class WiegandMulti {

private:
    bool DoWiegandConversion();
    volatile unsigned long _lastWiegand;
    volatile int _bitCount, bitCount = 0;
    char dataIn[WIEGAND_MAX_BITS]; // support up to 512 bits Wiegand data
    char _dataIn[WIEGAND_MAX_BITS];
    unsigned long _code;

public:
    WiegandMulti();

    void begin(int pinD0, int pinD1, void (*ISR_D0)(void), void (*ISR_D1)(void));
    bool available();
    void ReadD0();
    void ReadD1();
    int getBitCount() { return bitCount; }
    String GetCardData();
    uint32_t getLastWiegand() { return _lastWiegand; }
};

#endif
