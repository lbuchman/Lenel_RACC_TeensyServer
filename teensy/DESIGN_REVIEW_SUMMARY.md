# Design Review Summary & Action Plan
**Date**: 2026-06-22 | **Project**: RedDiamonds Test Fixture Firmware v0.6

---

## Quick Status

| Area | Rating | Status |
|------|--------|--------|
| **Architecture** | A | Excellent non-blocking design |
| **Safety** | C+ | **CRITICAL: 2 unfixed issues** |
| **Code Quality** | B | Solid but inconsistent error handling |
| **Compilation** | ❌ | **1 error blocking build** |
| **Testing** | D | No visible test suite |

---

## Blocking Issues (Do First)

### 1. Compilation Error: `logLevelToString()` doesn't exist

**File**: `include/eepromData.hpp` line 262

**Current Code**:
```cpp
doc["logLevelInEeprom"] = logger().logLevelToString(eepromdata.loglevel);
```

**Problem**: The `Logger` class doesn't have a `logLevelToString()` method  
**Solution**: Use `logger().getLogLevelString()` instead (already used on line 258)

**Fix**: Replace one line in the lambda function

---

### 2. CRITICAL: No Null-Check After Reader Allocation

**File**: `src/init.cpp` (Lines 147-177)

**Impact**: Crash on low memory, especially after weeks of runtime with heap fragmentation

**Example Problem**:
```cpp
reader1 = new WiegandReader(...);  
reader1->begin(...);  // ← CRASH if allocation failed
```

**Fix Locations**:
- Line 150: After `reader1 = new WiegandReader(...)`
- Line 164: After `osdpPort1 = new osdpPort(...)`  
- Line 176: After `reader2 = new WiegandReader(...)`
- Line 190: After `osdpPort2 = new osdpPort(...)`

**Code Template**:
```cpp
reader1 = new WiegandReader(...);
if (reader1 != nullptr) {
    reader1->begin(...);
} else {
    logger().error(..., "CRITICAL: Reader 1 allocation failed");
}
```

---

### 3. CRITICAL: ISR Race Condition in Motor Control

**File**: `include/stepperDriver.hpp` (Line 103)

**Impact**: Use-after-free crash if object deallocated while ISR fires (unlikely but possible)

**Current Code**:
```cpp
static void motorISR(void) {
    if (!self->runMotor)  // ← CRASH if self == nullptr
        return;
```

**Fix** (Add 2 lines):
```cpp
static void motorISR(void) {
    if (self == nullptr)   // ← Add this line
        return;
    if (!self->runMotor)
        return;
```

---

## Recommended Priority 1 Actions (Safety)

| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 1 | Fix logger method name | eepromData.hpp | 1 min | Unblock compilation |
| 2 | Add reader allocation checks | init.cpp | 10 min | Prevent crash on low memory |
| 3 | Add ISR null-guard | stepperDriver.hpp | 2 min | Prevent use-after-free |

**Total Time**: ~15 minutes  
**Result**: Compilation passes, eliminates critical crashes

---

## Priority 2 Actions (Reliability)

### 4. Add Persistent Calibration Storage

**Current State**: Home sensor window hardcoded (42-47 steps)  
**Problem**: No field tuning capability, code bloat for variants

**Implementation**:
- Add `CalibrationData` struct to EEPROM
- Add shell command: `calibratehome <minSteps> <maxSteps>`
- Modify `isStepperAtHome()` to load bounds from EEPROM

**Effort**: 1-2 hours  
**Benefit**: Field flexibility, reduces firmware variants

---

### 5. Disable Interrupts During Object Cleanup

**Current State**: Reader destructors called while ISRs could still fire  
**Improvement**: Detach interrupt handlers explicitly

**Effort**: 30 minutes  
**Benefit**: Eliminates race condition timing window

---

## Priority 3 Actions (Maintainability)

### 6. Replace Global `self` Pointer Pattern

**Current Issue**: `static Stepper* self;` used in ISR is fragile

**Better Pattern**: Virtual ISR dispatcher  
**Effort**: 3-4 hours  
**Benefit**: Cleaner code, easier testing

---

### 7. Add Unit Tests

**Target**: Enum conversions, CRC validation, EEPROM RMW  
**Effort**: 4-6 hours  
**Benefit**: Prevents regressions

---

## Current Risk Assessment

### High Risk (Likely to manifest)
- ❌ Memory allocation failures in long-running systems  
- ⚠️ Field support burden without calibration adjustment  

### Medium Risk (Possible edge cases)
- ⚠️ Heap fragmentation after many reconfigurations
- ⚠️ EEPROM RMW corruption if power loss during save
- ⚠️ ISR race condition (very timing-dependent)

### Low Risk (Well-mitigated)
- ✅ Motor control accuracy
- ✅ Task scheduling fairness
- ✅ Watchdog safety

---

## Quick Action Summary

### To Get Passing Compilation (15 min)
1. Change line 262 in eepromData.hpp
2. Add 4 null-checks in init.cpp  
3. Add null-guard in stepperDriver.hpp

### To Eliminate Safety Issues (30 min total)
4. Add interrupt disabling to reader cleanup

### To Improve Field Support (1-2 hours)
5. Implement persistent calibration + shell command

---

## Files Requiring Changes

```
Priority 1 (Required - 15 minutes):
├── include/eepromData.hpp (Line 262) - Fix method name
├── src/init.cpp (Lines 150, 164, 176, 190) - Add 4 null-checks  
└── include/stepperDriver.hpp (Line 103) - Add ISR guard

Priority 2 (Recommended - 30 minutes):
├── include/wiegandReader.hpp - Disable ISRs on cleanup
├── include/osdpPort.hpp - Disable serial on cleanup
└── src/init.cpp - Call cleanup during shutdown

Priority 3 (Enhancement - 1-2 hours):
├── include/eepromData.hpp - Add CalibrationData struct
└── include/stepperRehome.hpp - Load calibration from EEPROM
```

---

## Validation Checklist

After implementing Priority 1 & 2 fixes, verify:

- [ ] Project compiles without errors
- [ ] Firmware boots successfully  
- [ ] Both readers initialize (logs show "Reader X is Wiegand/OSDP/disabled")
- [ ] Motor responds to `motormove` command
- [ ] Rehome command triggers successfully
- [ ] Watchdog LED blinks (1 Hz)
- [ ] Logger shows no error messages on boot

---

## Deployment Recommendation

**Current State**: NOT READY for production (safety issues)

**After Priority 1 Fixes**: Can compile, deployable for testing  
**After Priority 2 Fixes**: Production-ready  
**After Priority 3 Fixes**: Optimal maintainability

---

## Questions for Product Owner

1. How many fixtures are deployed? (Helps prioritize safety vs. features)
2. Expected runtime duration? (Relevant for heap fragmentation)
3. Field calibration capability needed? (Affects Priority 2 timeline)
4. Any reported crashes in field? (Helps confirm risks)

---

## Full Details Available In

📄 **See [DESIGN_REVIEW.md](DESIGN_REVIEW.md)** for:
- Detailed risk matrix
- Architecture diagrams
- Component-by-component analysis
- Performance characteristics
- Dependencies and conflicts
