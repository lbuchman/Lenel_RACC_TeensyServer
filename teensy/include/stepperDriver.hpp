#ifndef STEPPER_DRIVER_H1
#define STEPPER_DRIVER_H1

#include "TaskSchedulerDeclarations.h"
#include "hw.h"
#include "logger.hpp"
#include <ArduinoJson.h>
#include <common.hpp>
#include <shellFunctor.hpp>
#include <simpleEvents.h>

enum class motorDirection : int8_t { CW, CCW };
typedef std::function<void(void* data)> stepperStoppedCallback;

class Stepper : public SimpleEvent {
public:
    Stepper(int _stepPin, int _dirPin, int _enPin, Scheduler& _ts)
        : SimpleEvent("Stepper"),
          stepPin(_stepPin),
          dirPin(_dirPin),
          enPin(_enPin),
          ts(_ts) {
        self = this;
        pinMode(stepPin, OUTPUT);
        pinMode(dirPin, OUTPUT);
        pinMode(enPin, OUTPUT);
        digitalWrite(enPin, HIGH);

        // Bind runtime shell execution command methods safely inside constructor context body
        ShellFunctor::getInstance().add("motormove", [this](int cnt, char** args, Stream& str) { return handleMotorMove(cnt, args, str); });
        ShellFunctor::getInstance().add("motorstop", [this](int cnt, char** args, Stream& str) { return handleMotorStop(cnt, args, str); });
        ShellFunctor::getInstance().add("motortest", [this](int cnt, char** args, Stream& str) { return handleMotorTest(cnt, args, str); });
    }

    motorDirection getMotorDirection() { return motorDir; }

    void begin() {
        stepTimer.begin(motorISR, STEPPER_STEP_TIME_USEC >> 1);
        stepperSleepTask.enable();
    }

    void revertDirection() { motorDir = (motorDir == motorDirection::CW) ? motorDirection::CCW : motorDirection::CW; }

    bool isMotorMoving() { return runMotor; }
    void setStepRate(uint32_t value) { stepTimer.update(value >> 1); }
    void resetPosition(int newposition = 0) { motorPosition = newposition; }

    // void setMotorDirection(motorDirection dir) { motorDir = dir; }
    void setDirection(motorDirection direction) {
        motorDir = direction;
        digitalWrite(dirPin, (direction == motorDirection::CW) ? LOW : HIGH);
    }

    void enablePower() { digitalWrite(enPin, LOW); }
    void disablePower() { digitalWrite(enPin, HIGH); }
    int getPosition() { return motorPosition; }
    void onStopMotor(stepperStoppedCallback eventFunction) { registerEvent(kMotorStopped, eventFunction); }

    void startMotor(int steps) {
        if (disabled) {
            logger().debug(logger().printHeader, __FILE__, __LINE__, "Motor cannot start, status: disabled");
            return;
        }
        setDirection(motorDir);
        enablePower();
        logger().debug(logger().printHeader, __FILE__, __LINE__, "Motor start steps = %d", steps);
        stepsToGo = steps << 2;
        runMotor = true;
    }

    void end() {
        disablePower();
        stepperMotorTask.disable();
        disabled = true;
    }

    void stopMotor() {
        motorStopFlag = true;
        stepperMotorTask.restart();
    }

private:
    uint32_t onTimeCount = 0;
    IntervalTimer stepTimer;
    bool disabled = false;
    volatile bool runMotor = false;
    volatile bool motorStopFlag = false;

    int stepPin, dirPin, enPin;
    Scheduler& ts;
    const static int kMotorStopped = 0;
    // This fixture uses a direct-drive 200-step motor with no gearing and no microstepping.
    static constexpr int kStepsPerRevolution = 200;

    volatile int motorPosition = 0;
    volatile motorDirection motorDir = motorDirection::CW;
    static Stepper* self;
    volatile int32_t stepsToGo = 100;
    static constexpr int MaxIdleTime = 60; // 60 seconds
    int testingStep = 0;

    /**
     * High-Speed Hardware Timer Interrupt Routine (ISR)
     */
    static void motorISR(void) {
        if (!self->runMotor)
            return;

        if (self->stepsToGo < 2) {
            self->runMotor = false;
            self->motorStopFlag = true;
            self->stepperMotorTask.restart();
            return;
        }
        self->stepsToGo -= 2;

        if (self->invertStepLineState()) {
            // Update position on the active step edge.
            if (self->motorDir == motorDirection::CW) {
                self->motorPosition += 1;
            } else {
                self->motorPosition -= 1;
            }

            // Position is tracked in full motor steps over one fixed 200-step revolution.
            if (self->motorPosition >= kStepsPerRevolution)
                self->motorPosition = 0;
            if (self->motorPosition < 0)
                self->motorPosition = kStepsPerRevolution - 1;
        }
    }

    bool invertStepLineState() {
        if (digitalRead(stepPin) == LOW) {
            digitalWrite(stepPin, HIGH);
            return true;
        }
        digitalWrite(stepPin, LOW);
        return false;
    }

    // ==========================================
    // Core Execution Task Workers
    // ==========================================
    Task stepperMotorTask{TASK_IMMEDIATE,
                          TASK_ONCE,
                          [this](void) -> void {
                              if (motorStopFlag) {
                                  self->runMotor = false;
                                  motorStopFlag = false;
                                  int _motorPosition = motorPosition;
                                  fireEvent(kMotorStopped, &_motorPosition);
                              }
                          },
                          &ts,
                          false,
                          NULL,
                          NULL};

    Task stepperSleepTask{TASK_SECOND,
                          TASK_FOREVER,
                          [this](void) -> void {
                              if (runMotor) {
                                  onTimeCount = 0;
                                  return;
                              } else {
                                  onTimeCount++;
                                  if (onTimeCount < MaxIdleTime)
                                      return;
                              }
                              onTimeCount = 0;
                              disablePower();
                          },
                          &ts,
                          false,
                          NULL,
                          NULL};

    Task motorTestTask{TASK_SECOND,
                       TASK_FOREVER,
                       [this](void) -> void {
                           int testSteps[4] = {50, -50, -50, 50};
                           if (testSteps[testingStep] > 0) {
                               setDirection(motorDirection::CW);
                           } else {
                               setDirection(motorDirection::CCW);
                           }
                           startMotor(abs(testSteps[testingStep]));
                           logger().debug(logger().printHeader, __FILE__, __LINE__, "Motor Test: move by %d index = %d",
                                          testSteps[testingStep], testingStep);
                           testingStep = (testingStep + 1) % 4;
                       },
                       &ts,
                       false,
                       NULL,
                       NULL};

    // ==========================================
    // Unified Shell Interfacing Methods
    // ==========================================
    int handleMotorMove(int arg_cnt, char** args, Stream& stream) {
        if (!checkArgument(2, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"arg\": \"degrees\", \"desc\": \"move motor\" }", stream)) {
            return 1;
        }
        if (runMotor) {
            logger().error(logger().printHeader, __FILE__, __LINE__, "motormove() failed, motor is active");
            JsonDocument doc;
            doc["status"] = false;
            doc["cmd"] = args[0];
            doc["error"] = "failed -> motor is active";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 1;
        }

        double degree = atof(args[1]);
        logger().info(logger().printHeader, __FILE__, __LINE__, "Executing command motormove(): %f degrees", degree);

        if (degree > 0) {
            setDirection(motorDirection::CW);
            startMotor(degree / 1.8);
        } else {
            setDirection(motorDirection::CCW);
            startMotor(abs(degree) / 1.8);
        }

        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = "motormove";
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    }

    int handleMotorStop(int arg_cnt, char** args, Stream& stream) {
        if (!checkArgument(1, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"desc\": \"stop motor\" }", stream)) {
            return 1;
        }

        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = args[0];

        if (!runMotor) {
            logger().info(logger().printHeader, __FILE__, __LINE__, "motor is already at rest");
            serializeJsonPretty(doc, stream);
            stream.println();
            return 1;
        }

        // Acknowledge the command immediately; the stop completes asynchronously in the task path.
        stopMotor();
        logger().info(logger().printHeader, __FILE__, __LINE__, "Halting motor operations...");
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    }

    int handleMotorTest(int arg_cnt, char** args, Stream& stream) {
        if (!checkArgument(2, arg_cnt, args, "\t{ \"cmd\": \"%s\", \"arg\": \"start/stop\", \"desc\": \"test loop\" }", stream)) {
            return 1;
        }

        String command = String(args[1]);
        if (command != "start" && command != "stop") {
            JsonDocument doc;
            doc["status"] = false;
            doc["cmd"] = args[0];
            doc["error"] = "invalid argument";
            serializeJsonPretty(doc, stream);
            stream.println();
            return 1;
        }

        if (command == "start") {
            motorTestTask.enable();
            testingStep = 0;
        } else if (command == "stop") {
            motorTestTask.disable();
            stopMotor();
        }

        JsonDocument doc;
        doc["status"] = true;
        doc["cmd"] = "motortest";
        serializeJsonPretty(doc, stream);
        stream.println();
        return 1;
    }
};

#endif
