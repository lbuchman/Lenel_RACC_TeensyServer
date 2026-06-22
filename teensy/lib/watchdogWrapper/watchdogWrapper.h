/* copyright by Leo Buchman */

#ifndef WATCHDOG_H
#define WATCHDOG_H

#define WD_TRIGGER (WD_EXPIRE >> 1) // interrupt this time before WD_EXPIRE

void watchdog();
void enableWatchdog();
void watchdogReboot();

#endif
