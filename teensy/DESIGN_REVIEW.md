# RedDiamonds Test Fixture Firmware - Comprehensive Design Review
**Version**: 0.6 | **Target**: Teensy 4.1 | **Date**: 2026-06-22

---

## Executive Summary

This is a well-architected embedded test fixture controller with strong real-time design principles. The firmware manages dual access control readers (Wiegand/OSDP protocols), stepper motor control with homing, and watchdog safety systems. The architecture demonstrates excellent understanding of embedded constraints (no exceptions, non-blocking tasks, memory efficiency).

**Overall Assessment**: **B+** (Good with identified risks)

### Key Strengths
✅ Non-blocking task-based architecture prevents timing glitches  
✅ Clean protocol abstraction (Wiegand/OSDP interchangeable)  
✅ Comprehensive logging and telemetry built-in  
✅ Safety-first approach (watchdog, exception stubs, LED heartbeat)  

### Critical Issues
⚠️ **No null-checks after dynamic allocation** → Crashes on low memory  
⚠️ **ISR race conditions with global pointers** → Potential use-after-free  
⚠️ **Hardcoded calibration values** → No field tuning capability  
⚠️ **Compilation error in eepromData.hpp** → Prevents current build  

---

## 1. ARCHITECTURE OVERVIEW

### System Design Pattern
```
main() → setupFw() → mainLoop()
         ↓
  [Initialization Phase]
  - Watchdog, Serial, Logger setup
  - EEPROM persistence load
  - Hardware interface init (Readers, Stepper, Rehome)
  - Shell command registration
         ↓
  [Execution Phase]
  - TaskScheduler.execute() loop
  - Non-blocking task execution
  - ISR event handling
```

### Hardware Architecture
```
Teensy 4.1 (CPU)
├── Reader 1 Interface
│   ├── Wiegand: D0/D1 pins (4,2) → ISR handlers
│   ├── OSDP: Serial2 (9600 baud)
│   └── Feedback: LED (Green/Red/1k/2k), Buzzer, Tamper
├── Reader 2 Interface
│   ├── Wiegand: D0/D1 pins (19,38)
│   ├── OSDP: Serial4 (9600 baud)
│   └── Feedback: LED (Green/Red/1k/2k), Buzzer, Tamper
├── Stepper Motor (NEMA23-sized, direct-drive, 200 steps/rev)
│   ├── Step Pin: 31
│   ├── Dir Pin: 32
│   ├── Enable Pin: 33
│   └── ISR: IntervalTimer @ 6600µs
└── Home Sensor (Hall effect, pin 41)
    └── Calibration: Steps 42-47 (hardcoded)
```

### Software Architecture Layers

```
┌─────────────────────────────────────────┐
│  Shell/CLI Command Interface            │ ← Human/machine I/O
│  (JSON over Serial)                     │
├─────────────────────────────────────────┤
│  Domain Logic Layer                     │
│  ├─ Stepper (motor control, rehome)   │
│  ├─ WiegandReader (pulse handler)      │
│  ├─ osdpPort (pass-through bridge)     │
│  └─ StepperRehome (homing FSM)         │
├─────────────────────────────────────────┤
│  Task Scheduler (ArkhipenkoTaskScheduler)
│  (Non-blocking concurrent execution)    │
├─────────────────────────────────────────┤
│  Hardware Abstraction Layer             │
│  ├─ Logger (Serial7 @ 256Kbps)         │
│  ├─ EEPROM (config persistence)        │
│  ├─ Watchdog (safety reset)            │
│  └─ GPIO/Timers (Teensy HAL)           │
└─────────────────────────────────────────┘
```

---

## 2. CRITICAL SAFETY ISSUES

### 2.1 🔴 MEMORY ALLOCATION RACE CONDITIONS

**File**: `src/init.cpp` (lines 147-177)

**Issue**: No validation after `new` operations
```cpp
reader1 = new WiegandReader(...);
reader1->begin(...);  // CRASH if allocation failed!
```

**Risk Level**: **CRITICAL**
- Heap fragmentation in long-running systems
- Silent pointer corruption leading to crashes
- No graceful degradation on memory exhaustion

**Scenario**: 
- System running for weeks
- Heap becomes fragmented
- Reader reinitialization fails
- Dereferenced nullptr → hard fault

**Recommended Fix**:
```cpp
reader1 = new WiegandReader(...);
if (reader1 == nullptr) {
    logger().error(..., "CRITICAL: Reader 1 alloc failed");
    return -1;  // Halt boot
}
reader1->begin(...);
```

---

### 2.2 🔴 ISR RACE CONDITION WITH GLOBAL STATE

**File**: `include/stepperDriver.hpp` (line 103-112)

**Issue**: ISR accesses global pointer without null-check
```cpp
static Stepper* self;  // Global pointer

static void motorISR(void) {
    if (!self->runMotor)  // CRASH if self == nullptr
        return;
```

**Risk Level**: **CRITICAL**
- ISR fires while main thread is deallocating object
- Timer interrupt has no knowledge of destruction
- Classic use-after-free vulnerability

**Scenario**:
```
Main Thread              Timer ISR
─────────────────────────────────────
1. stepper.end()
   → disable power
   → set disabled=true
                        2. motorISR() fires
                           if (!self->runMotor)
3. delete stepper ─→    3. self now invalid!
                        4. Crash → watchdog reboot
```

**Recommended Fix**: Guard ISR entry point
```cpp
static void motorISR(void) {
    if (self == nullptr)
        return;
    if (!self->runMotor)
        return;
    // Safe to proceed
}
```

---

### 2.3 🟡 WIEGAND ISR RACE CONDITION

**File**: `include/wiegandReader.hpp` (lines 65-78)

**Issue**: Better than motor ISR (has null-check) but still fragile
```cpp
inline static void reader1D0Interrupt(void) {
    if (readers[0])  // OK: checks null
        readers[0]->wg.ReadD0();
}
```

**Risk Level**: **MEDIUM**
- Reader pointer is checked (good)
- But object could be deallocated between check and access
- Timing window is extremely small but non-zero

**Atomic Solution**: Disable interrupt before deallocation

---

## 3. DESIGN FLAWS

### 3.1 🟡 HARDCODED CALIBRATION VALUES

**File**: `include/stepperRehome.hpp` (line 55)

```cpp
bool isStepperAtHome() {
    // The home window is tuned for this fixed fixture geometry
    if ((stepper.getPosition() > 42) && (stepper.getPosition() < 47) && 
        getHomeSensorState()) {
        return true;
    }
    return false;
}
```

**Issue**: 
- Calibration values (42, 47) are hardcoded
- No mechanism to adjust after manufacturing
- Mechanical wear or sensor drift requires firmware rebuild
- Different fixtures need different bounds → code duplication

**Impact**:
- Field support nightmare
- Environmental changes (temperature, humidity) affect timing
- No A/B testing capability
- Maintenance requires recompilation

**Solution**: Store in EEPROM with shell command
```cpp
// Future: calibratehome <minSteps> <maxSteps>
```

---

### 3.2 🟡 GLOBAL STATE OVERUSE

**Files**: `src/init.cpp` + scattered includes

**Global Singletons**:
- `Stepper stepper(...)` - line 26
- `StepperRehome rehome(...)` - line 27
- `WiegandReader* reader1/2` - lines 30-31
- `osdpPort* osdpPort1/2` - lines 32-33
- `EepromData::getInstance()` - singleton pattern
- `ShellFunctor::getInstance()` - singleton pattern
- `Scheduler ts` - global

**Problem**: Hidden dependencies and initialization order coupling

**Example**: `rehome` depends on `stepper` being initialized first, but only visible in constructor:
```cpp
StepperRehome rehome(stepper, HALL_SENSOR, ts);  // Order matters!
```

If someone reorders these lines, subtle bugs appear.

**Better Pattern**: Dependency injection
```cpp
Stepper stepper(...);
Rehome rehome;
rehome.init(stepper, HALL_SENSOR, ts);  // Explicit
```

---

### 3.3 🟡 EXCEPTION HANDLING DISABLED

**File**: `platformio.ini`
```
build_unflags = -fexceptions
build_flags = -fno-exceptions
```

**Plus custom exception stubs** in `main.cpp`:
```cpp
void __throw_bad_function_call() {
    Serial7.println("CRITICAL: Bad Function Call Stub!");
    while(1) ;  // Infinite loop → watchdog reboot
}
```

**Trade-offs**:

✅ **Pros**:
- Smaller code size (no RTTI, unwind tables)
- Guaranteed no unexpected overhead
- Predictable timing

❌ **Cons**:
- No stack unwinding → resource leaks
- `new` failure returns nullptr silently (not detected)
- ArduinoJson, TaskScheduler limited features
- No standard error handling patterns

**Current Risk**: Since `new` failures aren't checked (Issue 2.1), they manifest as silent pointer corruption rather than caught exceptions.

---

## 4. CODE QUALITY ASSESSMENT

### 4.1 Memory Management: ⚠️ RISKY

| Aspect | Status | Notes |
|--------|--------|-------|
| Dynamic allocation checks | ❌ None | All `new` operations unvalidated |
| Cleanup/destructors | ❌ Missing | No explicit cleanup for reader objects |
| Static pointers | ❌ Unsafe | `self` pointer in ISR |
| RAII pattern | ⚠️ Partial | Streams handled, objects not |

### 4.2 Concurrency/ISR: ⚠️ NEEDS GUARDS

| Operation | Risk | Status |
|-----------|------|--------|
| motorISR() access to Stepper | High | No null-check |
| Reader ISR access to reader[] | Medium | Has null-check but fragile |
| Task scheduler state changes | Low | Well-protected |
| EEPROM RMW cycles | Medium | No mutex/disable IRQ |

### 4.3 Testing Coverage: ❌ NONE APPARENT

- No unit tests visible
- No integration tests
- No stress testing (long runtime behavior)
- Relies on field testing

### 4.4 Error Handling: ⚠️ INCONSISTENT

| Component | Error Handling | Notes |
|-----------|---|---|
| Shell commands | ✅ Good | JSON error responses |
| Reader init | ⚠️ Poor | No null-check on `new` |
| EEPROM load | ⚠️ OK | CRC check exists, but fails silently |
| Watchdog | ✅ Good | Timeout resets system |

---

## 5. POSITIVE OBSERVATIONS

### 5.1 ✅ Excellent Real-Time Design
- Task scheduler prevents blocking operations
- ISR handlers are minimal (just flag setting)
- No unbounded loops
- Stepper stepping uses hardware timer (not software)

### 5.2 ✅ Smart JSON Command Interface
- Machine-readable + human-readable
- Extensible registration pattern
- Stateful terminal mode (human/script)
- All responses include status + error fields

### 5.3 ✅ Comprehensive Logging
- Multi-level (error, warn, info, debug, trace)
- File/line context on every message
- Persistent log level in EEPROM
- Separate logger serial channel (Serial7 @ 256Kbps)

### 5.4 ✅ Dual Protocol Flexibility
- Wiegand reader completely independent from OSDP
- Runtime switchable via `setreadertype` command
- Configurable baudrates per reader
- EEPROM persistence of selections

### 5.5 ✅ Watchdog + Safety Systems
- Hardware watchdog with Teensy library wrapper
- Dual platform support (Teensy + STM32)
- LED heartbeat indicator
- Callback before reboot

### 5.6 ✅ Homing Calibration FSM
- Edge-triggered sensor detection
- Timeout-based fail-safe
- Event callbacks for completion/failure
- Non-blocking implementation

---

## 6. COMPILATION STATUS

### Current Issues

**Error**: `eepromData.hpp:262`
```cpp
doc["logLevelInEeprom"] = logger().logLevelToString(eepromdata.loglevel);
```
❌ **Method doesn't exist**: Logger has `getLogLevelString()` but not `logLevelToString()`

This is the ONLY compilation error blocking the build.

---

## 7. RISK ASSESSMENT MATRIX

| Issue | Severity | Likelihood | Impact | Fix Effort |
|-------|----------|------------|--------|-----------|
| No allocation checks | CRITICAL | High | Crash on low memory | Low |
| ISR race condition | CRITICAL | Medium | Use-after-free crash | Low |
| Hardcoded calibration | HIGH | High | Field support burden | Medium |
| Global state coupling | MEDIUM | Medium | Maintenance complexity | High |
| Logger method bug | MEDIUM | High | Blocks compilation | Trivial |
| EEPROM RMW atomicity | MEDIUM | Low | Data corruption | Medium |

---

## 8. RECOMMENDED FIXES (PRIORITY ORDER)

### Priority 1: MUST DO (Safety)
1. **Fix compilation error** - Replace `logLevelToString` with correct method
2. **Add allocation null-checks** - Protect all `new` operations  
3. **Add ISR null-guard** - Check `self != nullptr` at motorISR entry

### Priority 2: SHOULD DO (Reliability)
4. **Disable interrupts during object cleanup** - Prevent ISR race
5. **Add persistent calibration** - Remove hardcoded bounds  
6. **Implement error recovery** - Don't silently fail initialization

### Priority 3: NICE TO DO (Maintainability)
7. **Replace global `self` pointer** - Use virtual ISR dispatcher
8. **Add unit tests** - CRC check, enum conversions
9. **Extract magic numbers** - Define calibration struct

---

## 9. DETAILED FINDINGS BY COMPONENT

### 9.1 Main.cpp ✅ GOOD
- Minimal, clear entry point
- Exception stubs properly implemented
- Standard error handling in exception handlers

### 9.2 Init.cpp ⚠️ NEEDS SAFETY CHECKS
- **Strength**: Clear initialization sequence, good logging
- **Weakness**: No validation after `new` operations (lines 147-177)
- **Recommendation**: Add null-checks before calling `.begin()`

### 9.3 StepperDriver.hpp 🔴 CRITICAL ISR BUG
- **Strength**: Excellent timing control, smooth stepping
- **Weakness**: `motorISR()` accesses unguarded global pointer
- **Recommendation**: Add `if (self == nullptr) return;` check

### 9.4 StepperRehome.hpp ⚠️ CALIBRATION HARDCODED
- **Strength**: Good FSM design, event-driven
- **Weakness**: Home bounds hardcoded (42, 47)
- **Recommendation**: Load from EEPROM instead

### 9.5 WiegandReader.hpp ⚠️ FRAGILE INTERRUPT
- **Strength**: Has null-check on `readers[0]`
- **Weakness**: Check-then-use race condition still possible
- **Recommendation**: Disable interrupt during deallocation

### 9.6 OsdpPort.hpp ✅ GOOD
- Clean pass-through design
- Proper byte rate limiting (32 bytes per slice)
- Event-driven, non-blocking

### 9.7 EepromData.hpp ⚠️ COMPILATION ERROR + DESIGN ISSUE
- **Strength**: CRC protection, good command structure
- **Current Issue**: Calls non-existent `logger().logLevelToString()`
- **Design Issue**: No calibration storage
- **Recommendation**: Fix method name, add CalibrationData struct

### 9.8 Common.hpp ✅ GOOD
- Safe enum conversions
- Bounds checking
- Consistent string mappings

---

## 10. PERFORMANCE ANALYSIS

### Timing Characteristics
| Component | Period | Tolerance | Status |
|-----------|--------|-----------|--------|
| Motor ISR | 3300µs (6600/2 edges) | ±1% | ✅ Hardware timer |
| Stepper sleep task | 1s | ±10ms | ✅ Soft timeout |
| Wiegand poll | 25ms | ±5ms | ✅ Adequate |
| OSDP poll | 100µs | ±10µs | ✅ Fast enough |
| Watchdog kick | ~667ms | ±10% | ✅ Safe margin |

### Memory Usage
- **Heap**: ~200 bytes (WiegandReader × 2, osdpPort × 2)
- **Stack**: ~3KB estimated (ISR stack frame)
- **Flash**: ~80KB estimated (code + constants)
- **EEPROM**: 12 bytes used / 4KB available

---

## 11. DEPENDENCY ANALYSIS

### External Libraries
- **ArkhipenkoTaskScheduler** - Well-suited for embedded
- **ArduinoJson v7.4.3** - Appropriate version
- **FastCRC** - Good for EEPROM validation
- **Queue library** - Used by Wiegand reader
- **WDT_T4** - Teensy watchdog wrapper

### Pin Conflicts
✅ No conflicts detected - all 42 used pins are unique

### Serial Port Usage
- **Serial1** (CmdSerialDev) - Command/telemetry interface
- **Serial2** (Reader1 OSDP) - RS485 or async
- **Serial4** (Reader2 OSDP) - RS485 or async
- **Serial7** (LoggerSerialDev) - Dedicated logging @ 256Kbps
- **SerialUSB1** (SerialReader2_232Port) - USB UART

---

## 12. MAINTENANCE & FIELD SUPPORT

### Issues That Will Impact Support
1. ❌ No way to tune home sensor window in field
2. ⚠️ No way to recover from failed reader initialization
3. ⚠️ No system health telemetry command
4. ⚠️ Log level persists but can't diagnose boot failures

### Operational Concerns
- Long runtime stability not tested (>24 hours)
- Heap fragmentation behavior under repeated reconfigurations
- Thermal behavior (motor duty cycle vs ambient)

---

## CONCLUSION

This firmware demonstrates **solid embedded design fundamentals** with a **concerning lack of defensive programming** in critical paths. The architecture is sound, but execution has safety gaps.

**Overall Grade: B+**
- **Architecture**: A (clean, modular, non-blocking)
- **Safety**: C+ (unguarded allocations, ISR race)
- **Code Quality**: B (good patterns, but inconsistent)
- **Testing**: D (none visible)
- **Documentation**: B+ (logging excellent, code comments good)

### Immediate Actions Required
1. Fix compilation error (trivial)
2. Add null-checks (5 lines across 2 files)
3. Add ISR guard (3 lines)
4. Test build and runtime

### Timeline Estimate
- **Immediate (now)**: 30 minutes → get compilation passing + 3 safety fixes
- **Short-term (1-2 weeks)**: 4-6 hours → calibration persistence + testing
- **Medium-term (1 month)**: 8-12 hours → refactor global state + add unit tests
