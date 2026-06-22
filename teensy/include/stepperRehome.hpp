#ifndef __STEPPERHOME__H__
#define __STEPPERHOME__H__

#include "TaskSchedulerDeclarations.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <common.hpp>
#include <ctype.h>
#include <logger.hpp>
#include <simpleEvents.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <stepperDriver.hpp>
#include <string.h>
#include <unistd.h>

class StepperRehome : public SimpleEvent {
public:
    StepperRehome(Stepper& _stepper, int _hallSensorPin, Scheduler& _ts)
        : SimpleEvent("StepperRehome"),
          stepper(_stepper),
          hallSensorPin(_hallSensorPin),
          ts(_ts) {
        pinMode(hallSensorPin, INPUT_PULLUP);

        // Bind runtime shell execution command methods safely inside constructor context body
        ShellFunctor::getInstance().add("rehome",
                                        [this](int cnt, char** args, Stream& str) { return handleRehomeCommand(cnt, args, str); });
    }

    void begin() {
        homeSensorTask.enable();
        homeSensorTask.restart();

        // Register core tracking status events
        stepper.onStopMotor([this](void* data) { handleMotorStopEvent(data); });
    }

    void startRehome() {
        prevSensorValue = getHomeSensorState();
        // stepper.setMotorDirection(motorDirection::CW);
        stepper.setDirection(motorDirection::CW);

        stepper.enablePower();
        stepper.startMotor(rehomeRevsSteps);

        doRehome = true;
        rehomed = false;
        prevSensorValue = getHomeSensorState();
    }

    void onComplete(event eventFunction) { registerEvent(kOnComplete, eventFunction); }
    void onFailed(event eventFunction) { registerEvent(kOnFailed, eventFunction); }

    bool isStepperAtHome() {
        // The home window is tuned for this fixed fixture geometry: direct-drive, 200 full steps/rev, no microstepping.
        if ((stepper.getPosition() > 42) && (stepper.getPosition() < 47) && getHomeSensorState()) {
            return true;
        }
        return false;
    }

protected:
    Stepper& stepper;
    int hallSensorPin;
    Scheduler& ts;
    bool prevSensorValue = false;
    int rehomed = false;
    bool homeSensor = false;
    bool doRehome = false;

    static constexpr int kStepsPerRevolution = 200;
    // Rehome travel and final index are fixed fixture calibration values.
    const static int rehomeRevsSteps = (3 * kStepsPerRevolution);
    const static int rehomeFinalPosSteps = 50;
    const static int kOnComplete = 0;
    const static int kOnFailed = 1;

    int state = 0;
    int position = 0;
    int inPosition = 0;
    int outPosition = 0;
    const static int kMaxMissedSensorPulses = 4;
    int missedSensorPulses = 0;

    bool getHomeSensorState() { return !digitalRead(hallSensorPin); }

private:
    /**
     * Non-blocking Edge-Triggered Sensor Polling Task
     * Shifted to 5ms for enhanced performance stability
     */
    Task homeSensorTask{5 * TASK_MILLISECOND,
                        TASK_FOREVER,
                        [this](void) -> void {
                            if (!doRehome)
                                return;

                            bool currentValue = getHomeSensorState();

                            // Detect a clean low-to-high transition edge on the sensor pin
                            if (!prevSensorValue && currentValue) {
                                doRehome = false;
                                logger().info(logger().printHeader, __FILE__, __LINE__,
                                              "Home sensor boundary hit. Halting stepper axis...");
                                stepper.stopMotor();
                            }
                            prevSensorValue = currentValue;
                        },
                        &ts,
                        false,
                        NULL,
                        NULL};

    /**
     * Cleaned Motor Rest Event Callback Handler
     * Resolves the dangerous infinite lambda nesting architecture bug
     */
    void handleMotorStopEvent(void* data) {
        if (!rehomed && !doRehome) {
            // The motor stopped cleanly while rehoming was active -> successfully reached home point
            stepper.setDirection(motorDirection::CCW);
            rehomed = true;
            stepper.resetPosition(rehomeFinalPosSteps);

            logger().info(logger().printHeader, __FILE__, __LINE__, "Rehome completed. Moving axis to index zero...");
            fireEvent(kOnComplete, nullptr);
        } else if (doRehome) {
            // The motor stopped out of bounds without the sensor ever triggering -> validation failed
            doRehome = false;
            logger().error(logger().printHeader, __FILE__, __LINE__, "Rehome tracking error: Axis limit reached without sensor trigger.");
            fireEvent(kOnFailed, nullptr);
        }
    }

    /**
     * Standardized Clean Shell Command Processor Interface
     */
    int handleRehomeCommand(int arg_cnt, char** args, Stream& stream) {
        if (!checkArgument(1, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"desc\": \"find home sensor\", \"timeoutMs\": 10000 }", stream)) {
            return 1;
        }

        logger().info(logger().printHeader, __FILE__, __LINE__, "Executing system rehome command: %s", args[0]);
        startRehome();

        // Acknowledge the command immediately; the rehome sequence continues asynchronously.
        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = args[0];
        doc["info"] = "rehome sequence initiated";
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    }
};

#endif
