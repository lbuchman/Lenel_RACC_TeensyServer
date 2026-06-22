#include <Arduino.h>
#include <cstdint>
#include <hw.h>
#include <init.h>

int setupFw();
void mainLoop();

namespace std
{
void __throw_bad_function_call() {
    Serial7.println("CRITICAL: Bad Function Call Stub!");

    while (1)
        ;
}
void __throw_length_error(char const* e) {
    Serial7.print("CRITICAL Length Error: ");
    Serial7.println(e);

    while (1)
        ;
}
} // namespace std

int main(int argc, char** argv) {
    pinMode(WATCHDOG_LED, OUTPUT);
    LoggerSerialDev.begin(256000);
    setupFw();
    mainLoop();
}
